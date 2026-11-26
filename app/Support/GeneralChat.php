<?php

namespace App\Support;

use App\Models\Chat;
use App\Models\ChatMember;
use App\Models\User;

/**
 * Каналы портала, в которых состоят все действующие сотрудники:
 * «Общий чат» и «Changelog» (что нового в портале). Новые сотрудники
 * попадают в них сами (при заведении учётки), выключенные — выбывают.
 * Выйти, исключить участника или удалить канал нельзя. В Changelog
 * пишут только владелец и администраторы, остальные читают.
 */
class GeneralChat
{
    public const ENTITY = 'general';

    public const CHANGELOG = 'changelog';

    public const TITLE = 'Общий чат';

    /** Каналы и их названия; порядок — как в списке чатов. */
    public const CHANNELS = [self::ENTITY => self::TITLE, self::CHANGELOG => 'Changelog'];

    public static function chat(string $entity = self::ENTITY): Chat
    {
        return Chat::query()->firstOrCreate(['entity' => $entity], ['type' => 'group', 'title' => self::CHANNELS[$entity]]);
    }

    public static function is(Chat $chat): bool
    {
        return $chat->entity === self::ENTITY;
    }

    public static function isChangelog(Chat $chat): bool
    {
        return $chat->entity === self::CHANGELOG;
    }

    /** Любой канал портала: состав меняется сам. */
    public static function isChannel(Chat $chat): bool
    {
        return isset(self::CHANNELS[$chat->entity ?? '']);
    }

    /** Кто может публиковать в Changelog. */
    public static function canPublish(User $user): bool
    {
        return in_array($user->role, ['owner', 'admin'], true);
    }

    /** Действующий сотрудник — в каналах, выключенный — нет. Сообщает, если состав поменялся. */
    public static function place(User $user): void
    {
        /* Свежее значение из базы: у только что созданной модели is_active может быть не заполнен. */
        $active = (bool) User::query()->whereKey($user->id)->value('is_active');
        foreach (array_keys(self::CHANNELS) as $entity) {
            $chat = self::chat($entity);
            if ($active) {
                $member = ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id], ['last_read_id' => (int) $chat->messages()->withTrashed()->max('id')]);
                if (! $member->wasRecentlyCreated) {
                    continue;
                }
                if ($entity === self::ENTITY) {
                    $message = $chat->messages()->create(['user_id' => $user->id, 'kind' => 'system', 'body' => "{$user->name} теперь в команде", 'meta' => ['event' => 'team', 'users' => [$user->id]]]);
                    $chat->update(['last_message_at' => $message->created_at]);
                    self::greet($user);
                }
            } elseif (! ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $user->id)->delete()) {
                continue;
            }
            $ids = ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id')->map(fn ($id) => (int) $id)->push($user->id)->unique()->values()->all();
            Realtime::emit($ids, 'chat', ['chatId' => $chat->id]);
        }
    }

    /** Свести состав каналов с учётками: все действующие — в них, остальных — нет. */
    public static function sync(): void
    {
        $active = User::query()->where('is_active', true)->pluck('id');
        foreach (array_keys(self::CHANNELS) as $entity) {
            $chat = self::chat($entity);
            $have = ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id');
            $last = (int) $chat->messages()->withTrashed()->max('id');
            foreach ($active->diff($have) as $id) {
                ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $id, 'last_read_id' => $last]);
            }
            ChatMember::query()->where('chat_id', $chat->id)->whereNotIn('user_id', $active)->delete();
        }
    }

    /**
     * Новый сотрудник сразу появляется у каждого коллеги в списке чатов:
     * личный чат с ним и строкой «… теперь в команде». Чат на пару один
     * (direct_key), поэтому повторное включение учётки дублей не создаёт.
     */
    private static function greet(User $user): void
    {
        $others = User::query()->where('is_active', true)->whereKeyNot($user->id)->pluck('id');
        foreach ($others as $id) {
            $chat = Chat::query()->firstOrCreate(['direct_key' => Chat::directKey($user->id, (int) $id)], ['type' => 'direct', 'created_by' => $user->id]);
            if (! $chat->wasRecentlyCreated) {
                continue;
            }
            foreach ([$user->id, (int) $id] as $member) {
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $member]);
            }
            $message = $chat->messages()->create(['user_id' => $user->id, 'kind' => 'system', 'body' => "{$user->name} теперь в команде", 'meta' => ['event' => 'team', 'users' => [$user->id]]]);
            $chat->update(['last_message_at' => $message->created_at]);
            Realtime::emit([$user->id, (int) $id], 'chat', ['chatId' => $chat->id]);
        }
    }
}
