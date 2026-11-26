<?php

namespace App\Support;

use App\Models\Chat;
use App\Models\ChatMember;
use App\Models\User;

/**
 * Общий чат портала: в нём все действующие сотрудники. Новые попадают
 * туда сами (при заведении учётки или первом входе), выключенные —
 * выбывают. Выйти из него, исключить участника или удалить его нельзя.
 */
class GeneralChat
{
    public const ENTITY = 'general';

    public const TITLE = 'Общий чат';

    public static function chat(): Chat
    {
        return Chat::query()->firstOrCreate(['entity' => self::ENTITY], ['type' => 'group', 'title' => self::TITLE]);
    }

    public static function is(Chat $chat): bool
    {
        return $chat->entity === self::ENTITY;
    }

    /** Действующий сотрудник — в чате, выключенный — нет. Сообщает, если состав поменялся. */
    public static function place(User $user): void
    {
        $chat = self::chat();
        /* Свежее значение из базы: у только что созданной модели is_active может быть не заполнен. */
        if (User::query()->whereKey($user->id)->value('is_active')) {
            $member = ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id], ['last_read_id' => (int) $chat->messages()->withTrashed()->max('id')]);
            if (! $member->wasRecentlyCreated) {
                return;
            }
            $message = $chat->messages()->create(['user_id' => $user->id, 'kind' => 'system', 'body' => "{$user->name} присоединяется к порталу", 'meta' => ['event' => 'joined', 'users' => [$user->id]]]);
            $chat->update(['last_message_at' => $message->created_at]);
        } elseif (! ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $user->id)->delete()) {
            return;
        }
        $ids = ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id')->map(fn ($id) => (int) $id)->push($user->id)->unique()->values()->all();
        Realtime::emit($ids, 'chat', ['chatId' => $chat->id]);
    }

    /** Свести состав с учётками: все действующие — в чате, остальных — нет. */
    public static function sync(): void
    {
        $chat = self::chat();
        $active = User::query()->where('is_active', true)->pluck('id');
        $have = ChatMember::query()->where('chat_id', $chat->id)->pluck('user_id');
        $last = (int) $chat->messages()->withTrashed()->max('id');
        foreach ($active->diff($have) as $id) {
            ChatMember::query()->create(['chat_id' => $chat->id, 'user_id' => $id, 'last_read_id' => $last]);
        }
        ChatMember::query()->where('chat_id', $chat->id)->whereNotIn('user_id', $active)->delete();
    }
}
