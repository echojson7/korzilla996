<?php

namespace App\Support;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;

/**
 * Права доступа как в Битрикс24: у сотрудника одна роль, у роли — набор
 * прав по разделам. Уровень права — none (нет), own (свои), dept (отдела),
 * all (все); у прав-галочек только none и all.
 *
 * Владелец и администратор — системные роли, им можно всё. Настройки и
 * права правят только они: иначе роль могла бы выдать себе всё.
 *
 * Никакого состояния между запросами (Octane): роль берётся из связи
 * пользователя, а он у каждого запроса свой.
 */
class Access
{
    public const LEVELS = ['none' => 0, 'own' => 1, 'dept' => 2, 'all' => 3];

    private const SCOPE = ['none', 'own', 'dept', 'all'];

    private const FLAG = ['none', 'all'];

    /** Разделы и действия: подпись и допустимые уровни. Порядок — как в настройках. */
    public static function schema(): array
    {
        return [
            'tasks' => ['title' => 'Задачи', 'actions' => [
                'view' => ['title' => 'Видеть задачи', 'levels' => self::SCOPE],
                'create' => ['title' => 'Ставить задачи', 'levels' => self::FLAG],
                'edit' => ['title' => 'Менять задачи', 'levels' => self::SCOPE],
                'delete' => ['title' => 'Удалять задачи', 'levels' => self::SCOPE],
            ]],
            'crm' => ['title' => 'Сделки и CRM', 'actions' => [
                'view' => ['title' => 'Видеть сделки', 'levels' => self::SCOPE],
                'create' => ['title' => 'Создавать сделки', 'levels' => self::FLAG],
                'edit' => ['title' => 'Менять сделки', 'levels' => self::SCOPE],
                'delete' => ['title' => 'Удалять сделки', 'levels' => self::SCOPE],
            ]],
            'staff' => ['title' => 'Сотрудники', 'actions' => [
                'view' => ['title' => 'Видеть список сотрудников и профили', 'levels' => self::FLAG],
                'edit' => ['title' => 'Менять чужие профили, должность и отдел', 'levels' => ['none', 'dept', 'all']],
            ]],
            'messenger' => ['title' => 'Мессенджер', 'actions' => [
                'chats' => ['title' => 'Создавать групповые чаты', 'levels' => self::FLAG],
                'general' => ['title' => 'Писать в общий чат', 'levels' => self::FLAG],
                'moderate' => ['title' => 'Удалять чужие сообщения, править и чистить чужие чаты', 'levels' => self::FLAG],
            ]],
            'processes' => ['title' => 'Бизнес-процессы', 'actions' => [
                'view' => ['title' => 'Видеть бизнес-процессы', 'levels' => self::FLAG],
                'start' => ['title' => 'Запускать бизнес-процессы', 'levels' => self::FLAG],
                'templates' => ['title' => 'Править шаблоны', 'levels' => self::FLAG],
            ]],
        ];
    }

    /** Набор «Сотрудник» по умолчанию: так портал и работал до ролей. */
    public static function defaults(): array
    {
        return [
            'tasks' => ['view' => 'own', 'create' => 'all', 'edit' => 'own', 'delete' => 'own'],
            'crm' => ['view' => 'all', 'create' => 'all', 'edit' => 'own', 'delete' => 'own'],
            'staff' => ['view' => 'all', 'edit' => 'none'],
            'messenger' => ['chats' => 'all', 'general' => 'all', 'moderate' => 'none'],
            'processes' => ['view' => 'all', 'start' => 'all', 'templates' => 'none'],
        ];
    }

    /** Всё по максимуму — для владельца и администратора. */
    public static function full(): array
    {
        return array_map(fn ($section) => array_map(fn ($action) => end($action['levels']), $section['actions']), self::schema());
    }

    /** Набор из формы: только известные разделы и уровни, остальное — «нет». */
    public static function normalize(array $input): array
    {
        $out = [];
        foreach (self::schema() as $section => $def) {
            foreach ($def['actions'] as $action => $one) {
                $value = $input[$section][$action] ?? 'none';
                $out[$section][$action] = in_array($value, $one['levels'], true) ? $value : 'none';
            }
        }

        return $out;
    }

    public static function isOwner(?User $user): bool
    {
        return $user?->role === 'owner';
    }

    /** Владелец или администратор: настройки, роли, учётки. */
    public static function isManager(?User $user): bool
    {
        return in_array($user?->role, ['owner', 'admin'], true);
    }

    /** Все права сотрудника — для приложения и проверок. */
    public static function map(User $user): array
    {
        if (self::isManager($user)) {
            return self::full();
        }
        try {
            $stored = $user->roleRecord?->permissions;
            if (! is_array($stored)) {
                /* Роли нет (удалили) — права «Сотрудника». */
                $stored = Role::query()->where('key', 'staff')->value('permissions');
                $stored = is_string($stored) ? json_decode($stored, true) : $stored;
            }
        } catch (QueryException) {
            /* Таблицы ролей ещё нет (код обновили, миграцию — нет): как раньше. */
            $stored = self::defaults();
        }

        return self::fill($stored);
    }

    /** Сохранённый набор, дополненный: новое право, которого в наборе ещё не было, — как у «Сотрудника». */
    public static function fill(mixed $stored): array
    {
        $stored = is_array($stored) ? $stored : [];
        $defaults = self::defaults();
        $out = [];
        foreach (self::schema() as $section => $def) {
            foreach ($def['actions'] as $action => $one) {
                $value = $stored[$section][$action] ?? $defaults[$section][$action] ?? 'none';
                $out[$section][$action] = in_array($value, $one['levels'], true) ? $value : 'none';
            }
        }

        return $out;
    }

    public static function level(?User $user, string $section, string $action): string
    {
        if (! $user || ! $user->is_active) {
            return 'none';
        }
        if (self::isManager($user)) {
            return 'all';
        }

        return self::map($user)[$section][$action] ?? 'none';
    }

    /** Есть ли право хоть на каком-то уровне. */
    public static function allows(?User $user, string $section, string $action, string $at = 'own'): bool
    {
        return self::LEVELS[self::level($user, $section, $action)] >= self::LEVELS[$at];
    }

    /** Коллеги по отделу, включая самого. Без отдела — только сам. */
    public static function colleagues(User $user): array
    {
        if (! $user->department_id) {
            return [$user->id];
        }

        return User::query()->where('department_id', $user->department_id)->pluck('id')->map(fn ($id) => (int) $id)->push($user->id)->unique()->values()->all();
    }
}
