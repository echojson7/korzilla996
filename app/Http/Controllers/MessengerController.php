<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\ChatMember;
use App\Models\Message;
use App\Models\MessageFile;
use App\Models\MessageReaction;
use App\Models\User;
use App\Support\Gifs;
use App\Support\GeneralChat;
use App\Support\Realtime;
use App\Support\TaskMentions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Мессенджер портала: личные и групповые чаты, сообщения с файлами,
 * реакции, отметки прочитанного, системные сообщения («добавляет в чат»).
 * Каждое изменение — событие участникам (App\Support\Realtime): сразу
 * через Mercure, если он есть, и меткой для лёгкого опроса sync.
 *
 * Чужой чат отвечает 404, а не 403: так не видно, какие чаты вообще есть.
 */
class MessengerController extends Controller
{
    private const PAGE = 50;

    /** Файл до 50 МБ, до 10 штук в сообщении. */
    private const FILE_KB = 51200;

    private const FILES = 10;

    /* ---------- Люди ---------- */

    public function users(Request $request): JsonResponse
    {
        $users = User::query()->orderBy('name')->get()->map(fn (User $user) => $this->person($user));

        return response()->json(['data' => $users]);
    }

    /* ---------- Чаты ---------- */

    public function chats(Request $request): JsonResponse
    {
        $me = $this->me($request);

        $stamp = Realtime::stamp($me->id);

        return response()->json(['data' => [
            'chats' => $this->chatList($me),
            'me' => $me->id,
            'v' => $stamp,
            'realtime' => Realtime::subscription($me->id),
            'now' => now()->toIso8601String(),
        ]]);
    }

    /**
     * Лёгкий опрос: v — метка с прошлого ответа. Ничего не менялось —
     * ответ из одной метки. Менялось — список чатов и, если передан
     * открытый чат (chat, since), его изменения.
     */
    public function sync(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $request->validate(['v' => ['nullable', 'integer'], 'chat' => ['nullable', 'integer'], 'since' => ['nullable', 'date']]);
        $stamp = Realtime::stamp($me->id);
        if ($request->filled('v') && (int) $request->input('v') === $stamp) {
            return response()->json(['data' => ['v' => $stamp]]);
        }
        $thread = null;
        if ($request->filled('chat') && $request->filled('since')) {
            $chat = Chat::query()->find((int) $request->input('chat'));
            $member = $chat ? ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->exists() : false;
            if ($member) {
                $thread = ['chatId' => $chat->id] + $this->changes($chat, $me, Carbon::parse($request->input('since')));
            }
        }

        return response()->json(['data' => [
            'v' => $stamp,
            'chats' => $this->chatList($me),
            'thread' => $thread,
            'now' => now()->toIso8601String(),
        ]]);
    }

    /** «Печатает…»: только Mercure, без метки и без базы. */
    public function typing(Request $request, Chat $chat): Response
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        Realtime::emit($this->others($chat, $me), 'typing', ['chatId' => $chat->id, 'userId' => $me->id], stamp: false);

        return response()->noContent();
    }

    public function createChat(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate([
            'type' => ['required', Rule::in(Chat::TYPES)],
            'user_id' => ['required_if:type,direct', 'nullable', 'integer', Rule::exists('users', 'id')],
            'title' => ['required_if:type,group', 'nullable', 'string', 'max:120'],
            'user_ids' => ['array', 'max:200'],
            'user_ids.*' => ['integer', Rule::exists('users', 'id')],
        ], [
            'title.required_if' => 'Назовите чат',
            'user_id.required_if' => 'Выберите собеседника',
        ]);

        if ($data['type'] === 'direct') {
            $other = (int) $data['user_id'];
            if ($other === $me->id) {
                throw ValidationException::withMessages(['user_id' => 'Нельзя начать чат с самим собой']);
            }
            $key = Chat::directKey($me->id, $other);
            $chat = DB::transaction(function () use ($key, $me, $other) {
                $chat = Chat::query()->firstOrCreate(['direct_key' => $key], ['type' => 'direct', 'created_by' => $me->id]);
                foreach ([$me->id, $other] as $id) {
                    ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $id]);
                }

                return $chat;
            });
        } else {
            $ids = collect($data['user_ids'] ?? [])->map(fn ($id) => (int) $id)->push($me->id)->unique();
            $chat = DB::transaction(function () use ($data, $me, $ids) {
                $chat = Chat::query()->create(['type' => 'group', 'title' => trim($data['title']), 'created_by' => $me->id]);
                foreach ($ids as $id) {
                    ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $id]);
                }
                $this->system($chat, $me, 'created', "{$me->name} создаёт чат «{$chat->title}»");

                return $chat;
            });
        }
        if ($chat->wasRecentlyCreated) {
            Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);
        }

        return response()->json(['data' => $this->chatOne($chat, $me)], $chat->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Чат задачи, сделки или проекта: один на сущность, создаётся при первом
     * открытии карточки. Кто открыл карточку — становится участником.
     */
    public function entityChat(Request $request): JsonResponse
    {
        $me = $this->me($request);
        $data = $request->validate([
            'entity' => ['required', 'string', 'regex:/^(task|deal|project|process|staff):[A-Za-z0-9_-]{1,40}$/'],
            'title' => ['required', 'string', 'max:120'],
        ]);

        $chat = DB::transaction(function () use ($data, $me) {
            $chat = Chat::query()->firstOrCreate(
                ['entity' => $data['entity']],
                ['type' => 'group', 'title' => trim($data['title']), 'created_by' => $me->id],
            );
            /* Название без имени сущности (открыли до загрузки списка) — дописать. */
            if (! $chat->wasRecentlyCreated && str_ends_with(trim((string) $chat->title), ':') && ! str_ends_with(trim($data['title']), ':')) {
                $chat->update(['title' => trim($data['title'])]);
            }
            $member = ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $me->id]);
            if ($member->wasRecentlyCreated && ! $chat->wasRecentlyCreated) {
                $this->system($chat, $me, 'joined', "{$me->name} присоединяется к обсуждению");
            }

            return $chat;
        });

        return response()->json(['data' => $this->chatOne($chat, $me)], $chat->wasRecentlyCreated ? 201 : 200);
    }

    public function updateChat(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $this->groupOnly($chat);
        $this->canManage($chat, $me);
        $data = $request->validate(['title' => ['required', 'string', 'max:120']], ['title.required' => 'Назовите чат']);
        $title = trim($data['title']);
        if ($title !== $chat->title) {
            $chat->update(['title' => $title]);
            $this->system($chat, $me, 'renamed', "{$me->name} переименовывает чат в «{$title}»", ['title' => $title]);
            Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);
        }

        return response()->json(['data' => $this->chatOne($chat, $me)]);
    }

    public function addMembers(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $this->groupOnly($chat);
        abort_if(GeneralChat::is($chat), 422, 'В общем чате — все сотрудники портала, состав меняется сам');
        $data = $request->validate([
            'user_ids' => ['required', 'array', 'min:1', 'max:200'],
            'user_ids.*' => ['integer', Rule::exists('users', 'id')],
        ]);
        $added = [];
        foreach (array_unique($data['user_ids']) as $id) {
            if (ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => (int) $id])->wasRecentlyCreated) {
                $added[] = (int) $id;
            }
        }
        if ($added) {
            $names = User::query()->whereIn('id', $added)->orderBy('name')->pluck('name')->implode(', ');
            $this->system($chat, $me, 'added', "{$me->name} добавляет в чат: {$names}", ['users' => $added]);
            Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);
        }

        return response()->json(['data' => $this->chatOne($chat, $me)]);
    }

    /** Выйти из группы самому или убрать участника (создатель, администратор). */
    public function removeMember(Request $request, Chat $chat, User $user): Response
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $this->groupOnly($chat);
        abort_if(GeneralChat::is($chat), 422, 'В общем чате — все сотрудники портала, состав меняется сам');
        if ($user->id !== $me->id) {
            $this->canManage($chat, $me);
        }
        $before = $this->memberIds($chat);
        if (! in_array($user->id, $before, true)) {
            return response()->noContent();
        }
        ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $user->id)->delete();
        if (! $chat->members()->exists()) {
            $this->dropChat($chat);
        } elseif ($user->id === $me->id) {
            $this->system($chat, $me, 'left', "{$me->name} выходит из чата", ['users' => [$me->id]]);
        } else {
            $this->system($chat, $me, 'removed', "{$me->name} исключает из чата: {$user->name}", ['users' => [$user->id]]);
        }
        Realtime::emit($before, 'chat', ['chatId' => $chat->id]);

        return response()->noContent();
    }

    public function pin(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $member = $this->membership($chat, $me);
        $member->update(['is_pinned' => $request->boolean('pinned', ! $member->is_pinned)]);
        Realtime::emit([$me->id], 'chat', ['chatId' => $chat->id]);

        return response()->json(['data' => $this->chatOne($chat, $me)]);
    }

    public function read(Request $request, Chat $chat): Response
    {
        $me = $this->me($request);
        $member = $this->membership($chat, $me);
        $data = $request->validate(['id' => ['required', 'integer', 'min:0']]);
        $last = (int) $chat->messages()->withTrashed()->max('id');
        $id = min((int) $data['id'], $last);
        if ($id > $member->last_read_id) {
            $member->update(['last_read_id' => $id]);
            DB::table('chat_reads')->insert(['chat_id' => $chat->id, 'user_id' => $me->id, 'upto_id' => $id, 'created_at' => now()]);
            Realtime::emit($this->memberIds($chat), 'read', ['chatId' => $chat->id, 'userId' => $me->id, 'id' => $id]);
        }

        return response()->noContent();
    }

    /** Кто просмотрел сообщение и когда (кроме автора). */
    public function views(Request $request, Message $message): JsonResponse
    {
        $me = $this->me($request);
        $chat = $message->chat;
        $this->membership($chat, $me);
        $readers = ChatMember::query()->where('chat_id', $chat->id)->where('last_read_id', '>=', $message->id)
            ->when($message->user_id, fn ($q) => $q->where('user_id', '!=', $message->user_id))->pluck('user_id');
        $times = DB::table('chat_reads')->where('chat_id', $chat->id)->where('upto_id', '>=', $message->id)
            ->whereIn('user_id', $readers)->groupBy('user_id')->selectRaw('user_id, min(created_at) as at')->pluck('at', 'user_id');
        $rows = $readers->map(fn ($id) => [
            'userId' => (int) $id,
            'at' => isset($times[$id]) ? Carbon::parse($times[$id])->toIso8601String() : null,
        ])->sortBy(fn ($row) => $row['at'] ?? '')->values();

        return response()->json(['data' => $rows]);
    }

    public function uploadAvatar(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $this->groupOnly($chat);
        $request->validate(['avatar' => ['required', 'file', 'mimetypes:'.implode(',', MessageFile::IMAGES), 'max:5120']], [
            'avatar.mimetypes' => 'Обложка — картинка PNG, JPEG, GIF или WebP',
            'avatar.max' => 'Обложка до 5 МБ',
        ]);
        $old = $chat->avatar;
        $chat->update(['avatar' => $request->file('avatar')->store('messenger/avatars', 'local')]);
        if ($old) {
            Storage::disk('local')->delete($old);
        }
        $this->system($chat, $me, 'cover', "{$me->name} меняет обложку чата");
        Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);

        return response()->json(['data' => $this->chatOne($chat, $me)]);
    }

    public function deleteAvatar(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $this->groupOnly($chat);
        if ($chat->avatar) {
            Storage::disk('local')->delete($chat->avatar);
            $chat->update(['avatar' => null]);
            $this->system($chat, $me, 'cover', "{$me->name} убирает обложку чата");
            Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);
        }

        return response()->json(['data' => $this->chatOne($chat, $me)]);
    }

    public function avatar(Request $request, Chat $chat): StreamedResponse
    {
        $this->membership($chat, $this->me($request));
        abort_unless($chat->avatar && Storage::disk('local')->exists($chat->avatar), 404);

        return Storage::disk('local')->response($chat->avatar, 'cover', [
            'Cache-Control' => 'private, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /* ---------- Сообщения ---------- */

    /**
     * Без параметров — последние 50; before=id — 50 старше; since=время —
     * всё, что поменялось с тех пор (новые, правки, реакции, удаления).
     */
    public function messages(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($chat, $me);
        $request->validate(['before' => ['nullable', 'integer'], 'since' => ['nullable', 'date']]);
        if ($request->filled('since')) {
            return response()->json(['data' => $this->changes($chat, $me, Carbon::parse($request->input('since')))]);
        }

        $query = $chat->messages()->with(['files', 'reactions', 'replyTo']);
        if ($request->filled('before')) {
            $query->where('id', '<', (int) $request->input('before'));
        }
        $rows = $query->orderByDesc('id')->limit(self::PAGE + 1)->get();
        $more = $rows->count() > self::PAGE;
        $rows = $rows->take(self::PAGE)->reverse()->values();

        return response()->json(['data' => [
            'messages' => $rows->map(fn (Message $message) => $this->message($message)),
            'hasMore' => $more,
            'readUpTo' => $this->readUpTo($chat, $me),
            'now' => now()->toIso8601String(),
        ]]);
    }

    public function send(Request $request, Chat $chat): JsonResponse
    {
        $me = $this->me($request);
        $member = $this->membership($chat, $me);
        $request->validate([
            'body' => ['nullable', 'string', 'max:10000'],
            'reply_to_id' => ['nullable', 'integer'],
            'client_id' => ['nullable', 'string', 'max:64'],
            'gif' => ['nullable', 'array'],
            'files' => ['array', 'max:'.self::FILES],
            'files.*' => ['file', 'max:'.self::FILE_KB],
        ], [
            'files.max' => 'Не больше '.self::FILES.' файлов за раз',
            'files.*.max' => 'Файл до 50 МБ',
            'files.*.uploaded' => 'Файл не загрузился: слишком большой для сервера',
        ]);
        $body = trim((string) $request->input('body', ''));
        /** @var UploadedFile[] $files */
        $files = $request->file('files', []);
        /* GIF или стикер из пикера — отдельным сообщением, без текста и файлов. */
        $gif = $request->filled('gif') ? Gifs::clean($request->input('gif')) : null;
        if ($request->filled('gif') && ! $gif) {
            throw ValidationException::withMessages(['gif' => 'Это не GIF и не стикер']);
        }
        if ($gif) {
            [$body, $files] = ['', []];
        }
        if ($body === '' && ! $files && ! $gif) {
            throw ValidationException::withMessages(['body' => 'Пустое сообщение']);
        }
        $replyTo = $request->filled('reply_to_id')
            ? $chat->messages()->where('kind', 'text')->whereKey((int) $request->input('reply_to_id'))->value('id')
            : null;

        $message = DB::transaction(function () use ($chat, $me, $body, $files, $replyTo, $member, $gif) {
            $message = $chat->messages()->create(['user_id' => $me->id, 'body' => $body === '' ? null : $body, 'reply_to_id' => $replyTo, 'meta' => $gif ? ['gif' => $gif] : null]);
            foreach ($files as $file) {
                $mime = $file->getMimeType() ?: 'application/octet-stream';
                $size = in_array($mime, MessageFile::IMAGES, true) ? @getimagesize($file->getRealPath()) : false;
                $ext = Str::lower(preg_replace('/[^A-Za-z0-9]/', '', $file->getClientOriginalExtension()) ?: 'bin');
                $message->files()->create([
                    'name' => Str::limit($file->getClientOriginalName() ?: 'файл', 250, ''),
                    'path' => $file->storeAs('messenger/'.$chat->id, Str::random(40).'.'.$ext, 'local'),
                    'mime' => Str::limit($mime, 128, ''),
                    'size' => $file->getSize() ?: 0,
                    'width' => $size ? $size[0] : null,
                    'height' => $size ? $size[1] : null,
                ]);
            }
            $chat->update(['last_message_at' => $message->created_at]);
            $member->update(['last_read_id' => $message->id]);

            return $message;
        });

        /* @Имя в чате задачи — человек становится наблюдателем. */
        $watchers = $body === '' ? [] : TaskMentions::apply($chat, $me, $body);

        $payload = $this->message($message->load(['files', 'reactions', 'replyTo']));
        Realtime::emit($this->memberIds($chat), 'message', ['chatId' => $chat->id, 'message' => $payload, 'clientId' => $request->input('client_id'), 'new' => true]);
        if ($watchers) {
            $names = collect($watchers)->pluck('name')->sort()->implode(', ');
            $this->system($chat, $me, 'watcher', "{$me->name} добавляет наблюдателем задачи: {$names}", ['users' => collect($watchers)->pluck('id')->all()]);
            Realtime::emit($this->memberIds($chat), 'chat', ['chatId' => $chat->id]);
        }

        return response()->json(['data' => $payload], 201);
    }

    public function edit(Request $request, Message $message): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($message->chat, $me);
        abort_unless($message->user_id === $me->id && $message->kind === 'text', 403, 'Править можно только свои сообщения');
        abort_if(isset($message->meta['gif']), 422, 'GIF не правится');
        $data = $request->validate(['body' => ['nullable', 'string', 'max:10000']]);
        $body = trim((string) ($data['body'] ?? ''));
        if ($body === '' && ! $message->files()->exists()) {
            throw ValidationException::withMessages(['body' => 'Пустое сообщение']);
        }
        if ($body !== (string) $message->body) {
            $message->update(['body' => $body === '' ? null : $body, 'edited_at' => now()]);
        }

        return response()->json(['data' => $this->announce($message)]);
    }

    public function destroy(Request $request, Message $message): Response
    {
        $me = $this->me($request);
        $this->membership($message->chat, $me);
        abort_unless($message->kind === 'text' && ($message->user_id === $me->id || $me->permissions() === ['*']), 403, 'Удалять можно только свои сообщения');
        DB::transaction(function () use ($message) {
            foreach ($message->files as $file) {
                Storage::disk('local')->delete($file->path);
            }
            $message->files()->delete();
            $message->reactions()->delete();
            $message->delete();
        });
        $this->announce($message);

        return response()->noContent();
    }

    /**
     * Переслать сообщение в другие чаты: текст и копии файлов, с пометкой
     * «Переслано от …». Пересылать можно только в свои чаты.
     */
    public function forward(Request $request, Message $message): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($message->chat, $me);
        abort_unless($message->kind === 'text', 422, 'Системное сообщение не переслать');
        $data = $request->validate(['chat_ids' => ['required', 'array', 'min:1', 'max:20'], 'chat_ids.*' => ['integer']]);
        $targets = Chat::query()->whereIn('id', array_unique($data['chat_ids']))
            ->whereIn('id', ChatMember::query()->where('user_id', $me->id)->select('chat_id'))->get();
        abort_if($targets->isEmpty(), 404);
        $origin = $message->meta['forwarded_from'] ?? $message->user_id;
        $message->load('files');

        foreach ($targets as $chat) {
            $copy = DB::transaction(function () use ($chat, $me, $message, $origin) {
                $copy = $chat->messages()->create(['user_id' => $me->id, 'body' => $message->body, 'meta' => ['forwarded_from' => $origin] + (isset($message->meta['gif']) ? ['gif' => $message->meta['gif']] : [])]);
                foreach ($message->files as $file) {
                    $path = 'messenger/'.$chat->id.'/'.Str::random(40).'.'.(pathinfo($file->path, PATHINFO_EXTENSION) ?: 'bin');
                    if (Storage::disk('local')->copy($file->path, $path)) {
                        $copy->files()->create(['name' => $file->name, 'path' => $path, 'mime' => $file->mime, 'size' => $file->size, 'width' => $file->width, 'height' => $file->height]);
                    }
                }
                $chat->update(['last_message_at' => $copy->created_at]);
                ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->update(['last_read_id' => $copy->id]);

                return $copy;
            });
            $payload = $this->message($copy->load(['files', 'reactions', 'replyTo']));
            Realtime::emit($this->memberIds($chat), 'message', ['chatId' => $chat->id, 'message' => $payload, 'new' => true]);
        }

        return response()->json(['data' => ['count' => $targets->count()]]);
    }

    /** Поставить реакцию или снять, если она уже стоит. */
    public function react(Request $request, Message $message): JsonResponse
    {
        $me = $this->me($request);
        $this->membership($message->chat, $me);
        abort_unless($message->kind === 'text', 422, 'На системное сообщение реакцию не поставить');
        $data = $request->validate(['emoji' => ['required', 'string', 'max:32', 'not_regex:/[\x00-\x7F]/']], [
            'emoji.not_regex' => 'Реакция — один эмодзи',
        ]);
        $found = MessageReaction::query()->where(['message_id' => $message->id, 'user_id' => $me->id, 'emoji' => $data['emoji']])->first();
        if ($found) {
            $found->delete();
        } else {
            MessageReaction::query()->create(['message_id' => $message->id, 'user_id' => $me->id, 'emoji' => $data['emoji']]);
        }
        $message->touch();

        return response()->json(['data' => $this->announce($message)]);
    }

    public function file(Request $request, MessageFile $file): StreamedResponse
    {
        $message = $file->message;
        abort_unless($message && ! $message->trashed(), 404);
        $this->membership($message->chat, $this->me($request));
        abort_unless(Storage::disk('local')->exists($file->path), 404);
        $inline = $file->isImage() && ! $request->boolean('download');

        return Storage::disk('local')->response($file->path, $file->name, [
            'Content-Type' => $inline ? $file->mime : 'application/octet-stream',
            'Cache-Control' => 'private, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        ], $inline ? 'inline' : 'attachment');
    }

    /* ---------- Внутреннее ---------- */

    private function me(Request $request): User
    {
        /** @var User|null $user */
        $user = $request->user();
        abort_unless($user && $user->is_active, 401);

        return $user;
    }

    private function membership(?Chat $chat, User $me): ChatMember
    {
        $member = $chat ? ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->first() : null;
        abort_unless($member, 404);

        return $member;
    }

    /** @return int[] */
    private function memberIds(Chat $chat): array
    {
        return ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return int[] */
    private function others(Chat $chat, User $me): array
    {
        return array_values(array_filter($this->memberIds($chat), fn ($id) => $id !== $me->id));
    }

    /** Системное сообщение в ленту: событие уйдёт участникам сразу. */
    private function system(Chat $chat, User $actor, string $event, string $text, array $meta = []): Message
    {
        $message = $chat->messages()->create(['user_id' => $actor->id, 'kind' => 'system', 'body' => $text, 'meta' => ['event' => $event] + $meta]);
        $chat->update(['last_message_at' => $message->created_at]);
        $payload = $this->message($message->load(['files', 'reactions', 'replyTo']));
        Realtime::emit($this->memberIds($chat), 'message', ['chatId' => $chat->id, 'message' => $payload, 'new' => true]);

        return $message;
    }

    /** Сообщение изменилось (правка, реакция, удаление) — разослать новое. */
    private function announce(Message $message): array
    {
        $fresh = Message::withTrashed()->with(['files', 'reactions', 'replyTo'])->find($message->id);
        $payload = $this->message($fresh);
        Realtime::emit($this->memberIds($fresh->chat), 'message', ['chatId' => $fresh->chat_id, 'message' => $payload]);

        return $payload;
    }

    /** Всё, что поменялось в чате с момента since. */
    private function changes(Chat $chat, User $me, Carbon $since): array
    {
        $rows = $chat->messages()->withTrashed()->with(['files', 'reactions', 'replyTo'])
            ->where('updated_at', '>=', $since)->orderBy('id')->limit(500)->get();

        return [
            'messages' => $rows->map(fn (Message $message) => $this->message($message)),
            'hasMore' => false,
            'readUpTo' => $this->readUpTo($chat, $me),
            'now' => now()->toIso8601String(),
        ];
    }

    private function groupOnly(Chat $chat): void
    {
        abort_unless($chat->type === 'group', 422, 'Это личный чат');
    }

    private function canManage(Chat $chat, User $me): void
    {
        abort_unless($chat->created_by === $me->id || $me->permissions() === ['*'], 403, 'Это может создатель чата');
    }

    private function dropChat(Chat $chat): void
    {
        Storage::disk('local')->deleteDirectory('messenger/'.$chat->id);
        if ($chat->avatar) {
            Storage::disk('local')->delete($chat->avatar);
        }
        $chat->delete();
    }

    /** До какого сообщения дочитали остальные: для галочки «прочитано». */
    private function readUpTo(Chat $chat, User $me): int
    {
        return (int) ChatMember::query()->where('chat_id', $chat->id)->where('user_id', '!=', $me->id)->max('last_read_id');
    }

    private function chatOne(Chat $chat, User $me): array
    {
        return $this->chatList($me, $chat->id)->first();
    }

    /** Чаты сотрудника: последнее сообщение и непрочитанные — тремя запросами на всё. */
    private function chatList(User $me, ?int $only = null): Collection
    {
        $mine = ChatMember::query()->where('user_id', $me->id)->when($only, fn ($q) => $q->where('chat_id', $only))->get()->keyBy('chat_id');
        $ids = $mine->keys();
        if ($ids->isEmpty()) {
            return collect();
        }
        $chats = Chat::query()->whereIn('id', $ids)->get();
        $members = ChatMember::query()->whereIn('chat_id', $ids)->get(['chat_id', 'user_id', 'last_read_id'])->groupBy('chat_id');
        $users = User::query()->whereIn('id', $members->flatten()->pluck('user_id')->unique())->get()->keyBy('id');
        $last = Message::query()->with('files')->whereIn('id', Message::query()->selectRaw('max(id)')->whereIn('chat_id', $ids)->groupBy('chat_id'))->get()->keyBy('chat_id');
        $unread = DB::table('messages as m')
            ->join('chat_members as cm', fn ($join) => $join->on('cm.chat_id', '=', 'm.chat_id')->where('cm.user_id', '=', $me->id))
            ->whereIn('m.chat_id', $ids)->whereColumn('m.id', '>', 'cm.last_read_id')
            ->where(fn ($q) => $q->where('m.user_id', '!=', $me->id)->orWhereNull('m.user_id'))
            ->whereNull('m.deleted_at')->where('m.kind', 'text')
            ->groupBy('m.chat_id')->selectRaw('m.chat_id, count(*) as n')->pluck('n', 'chat_id');

        return $chats->map(function (Chat $chat) use ($me, $mine, $members, $users, $last, $unread) {
            $memberIds = $members->get($chat->id, collect())->pluck('user_id')->map(fn ($id) => (int) $id)->values();
            $peer = $chat->type === 'direct' ? $users->get($memberIds->first(fn ($id) => $id !== $me->id)) : null;
            $title = $chat->type === 'direct' ? ($peer?->name ?? 'Собеседник удалён') : $chat->title;
            $message = $last->get($chat->id);
            $others = $members->get($chat->id, collect())->where('user_id', '!=', $me->id);

            return [
                'id' => $chat->id,
                'type' => $chat->type,
                'entity' => $chat->entity,
                /* Общий чат портала: обложка-ромб, всегда сверху, выйти нельзя. */
                'general' => GeneralChat::is($chat),
                'title' => $title,
                'initials' => $peer ? $peer->initials() : self::initials((string) $title),
                'hue' => $peer ? self::hue($peer->id) : self::hue($chat->id * 7 + 3),
                'avatar' => $chat->avatar ? 'messenger/chats/'.$chat->id.'/avatar?v='.$chat->updated_at?->timestamp : null,
                'peer' => $peer?->id,
                'members' => $memberIds,
                'createdBy' => $chat->created_by,
                'pinned' => (bool) $mine[$chat->id]->is_pinned,
                'lastReadId' => (int) $mine[$chat->id]->last_read_id,
                'readUpTo' => (int) $others->max('last_read_id'),
                /* До какого сообщения дочитал каждый — для аватарок под сообщениями. */
                'reads' => $others->mapWithKeys(fn ($row) => [(string) $row->user_id => (int) $row->last_read_id])->all() ?: (object) [],
                'unread' => (int) ($unread[$chat->id] ?? 0),
                'last' => $message ? [
                    'id' => $message->id,
                    'userId' => $message->user_id,
                    'kind' => $message->kind,
                    'text' => self::preview($message),
                    'at' => $message->created_at?->toIso8601String(),
                ] : null,
                'at' => ($chat->last_message_at ?? $chat->created_at)?->toIso8601String(),
            ];
        })->sortByDesc(fn ($one) => [$one['pinned'] ? 1 : 0, $one['at']])->values();
    }

    private function message(Message $message): array
    {
        $deleted = $message->trashed();
        $reactions = $message->reactions->groupBy('emoji')->map(fn ($rows, $emoji) => [
            'emoji' => $emoji,
            'users' => $rows->pluck('user_id')->map(fn ($id) => (int) $id)->values(),
        ])->values();

        return [
            'id' => $message->id,
            'chatId' => $message->chat_id,
            'userId' => $message->user_id,
            'kind' => $message->kind ?? 'text',
            'meta' => $message->kind === 'system' ? $message->meta : null,
            'forwardedFrom' => $message->kind === 'text' && isset($message->meta['forwarded_from']) ? (int) $message->meta['forwarded_from'] : null,
            'body' => $deleted ? null : $message->body,
            'gif' => ! $deleted && ($message->kind ?? 'text') === 'text' ? ($message->meta['gif'] ?? null) : null,
            'deleted' => $deleted,
            'replyTo' => ! $deleted && $message->replyTo ? [
                'id' => $message->replyTo->id,
                'userId' => $message->replyTo->user_id,
                'text' => $message->replyTo->trashed() ? 'Сообщение удалено' : self::preview($message->replyTo),
            ] : null,
            'files' => $deleted ? [] : $message->files->map(fn (MessageFile $file) => [
                'id' => $file->id,
                'name' => $file->name,
                'size' => $file->size,
                'mime' => $file->mime,
                'image' => $file->isImage(),
                'width' => $file->width,
                'height' => $file->height,
                'url' => 'messenger/files/'.$file->id,
            ])->values(),
            'reactions' => $deleted ? [] : $reactions,
            'editedAt' => $message->edited_at?->toIso8601String(),
            'at' => $message->created_at?->toIso8601String(),
        ];
    }

    private function person(User $user): array
    {
        return $user->card();
    }

    private static function preview(Message $message): string
    {
        if ($message->trashed()) {
            return 'Сообщение удалено';
        }
        $text = trim(preg_replace('/\s+/u', ' ', (string) $message->body));
        if ($text === '' && isset($message->meta['gif'])) {
            $text = ($message->meta['gif']['type'] ?? 'gif') === 'sticker' ? 'Стикер' : 'GIF';
        } elseif ($text === '' && $message->relationLoaded('files') && $message->files->isNotEmpty()) {
            $text = $message->files->every->isImage() ? '🖼 Картинка' : '📎 '.$message->files->first()->name;
        } elseif ($text === '') {
            $text = '📎 Файл';
        }

        return Str::limit($text, 120);
    }

    private static function initials(string $title): string
    {
        $words = preg_split('/\s+/u', trim($title), -1, PREG_SPLIT_NO_EMPTY);

        return mb_strtoupper(implode('', array_map(fn ($word) => mb_substr($word, 0, 1), array_slice($words, 0, 2)))) ?: '#';
    }

    /** Цвет аватара по id: у каждого свой, и всегда тот же. */
    private static function hue(int $id): int
    {
        return ($id * 47 + 200) % 360;
    }
}
