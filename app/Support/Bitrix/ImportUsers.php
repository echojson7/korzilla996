<?php

namespace App\Support\Bitrix;

use App\Models\Department;
use App\Models\User;
use App\Support\Avatars;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Сотрудники и отделы из Битрикс24. Новые учётки — выключенные, с
 * паролем, которого никто не знает: войти нельзя, пока владелец или
 * администратор не включит учётку и не задаст пароль в «Настройках».
 * Тот, кто уже есть в портале, находится по почте; у него дописываются
 * только пустые поля, роль, пароль и «включён» не меняются. Повторный
 * запуск ничего не дублирует (users.bitrix_id, departments.bitrix_id).
 */
class ImportUsers
{
    public array $report = ['departments' => 0, 'created' => 0, 'linked' => 0, 'updated' => 0, 'photos' => 0, 'skipped' => 0];

    public function __construct(private Client $bitrix, private bool $photos = true, private bool $dry = false) {}

    public function run(): array
    {
        $departments = $this->departments();
        foreach (['Y', 'N'] as $active) {
            foreach ($this->bitrix->each('user.get', ['FILTER' => ['ACTIVE' => $active, 'USER_TYPE' => 'employee'], 'ADMIN_MODE' => 'true']) as $row) {
                $this->user($row, $departments);
            }
        }

        return $this->report;
    }

    /** @return array<int, int> ID отдела в Битриксе → id у нас */
    private function departments(): array
    {
        $rows = iterator_to_array($this->bitrix->each('department.get'), false);
        $byId = collect($rows)->keyBy(fn ($row) => (int) $row['ID']);
        $map = Department::query()->whereNotNull('bitrix_id')->pluck('id', 'bitrix_id')->map(fn ($id) => (int) $id)->all();
        foreach ($rows as $row) {
            $bid = (int) $row['ID'];
            if (isset($map[$bid])) {
                continue;
            }
            $name = Department::clean($row['NAME'] ?? '') ?? "Отдел {$bid}";
            $taken = Department::query()->where('key', Department::keyOf($name))->first();
            if ($taken && $taken->bitrix_id === null) {
                $this->dry || $taken->forceFill(['bitrix_id' => $bid])->save();
                $map[$bid] = (int) $taken->id;

                continue;
            }
            if ($taken) {
                $parent = Department::clean($byId[(int) ($row['PARENT'] ?? 0)]['NAME'] ?? '') ?? (string) $bid;
                $name = Department::clean("{$name} ({$parent})");
            }
            $this->report['departments']++;
            $map[$bid] = $this->dry ? -$bid : (int) Department::query()->forceCreate(['name' => $name, 'key' => Department::keyOf($name), 'bitrix_id' => $bid])->id;
        }
        if (! $this->dry) {
            foreach ($rows as $row) {
                $parent = (int) ($row['PARENT'] ?? 0);
                if ($parent && isset($map[$parent], $map[(int) $row['ID']])) {
                    Department::query()->whereKey($map[(int) $row['ID']])->update(['parent_id' => $map[$parent]]);
                }
            }
        }

        return $map;
    }

    private function user(array $row, array $departments): void
    {
        $bid = (int) $row['ID'];
        $email = mb_strtolower(trim((string) ($row['EMAIL'] ?? '')));
        $name = trim(preg_replace('/\s+/u', ' ', trim(($row['NAME'] ?? '').' '.($row['LAST_NAME'] ?? ''))));
        if ($name === '' && $email === '') {
            $this->report['skipped']++;

            return;
        }
        $dept = null;
        foreach ((array) ($row['UF_DEPARTMENT'] ?? []) as $one) {
            if (isset($departments[(int) $one])) {
                $dept = $departments[(int) $one];
                break;
            }
        }
        $phone = collect([$row['PERSONAL_MOBILE'] ?? '', $row['WORK_PHONE'] ?? '', $row['PERSONAL_PHONE'] ?? ''])->map(fn ($one) => trim((string) $one))->first(fn ($one) => $one !== '');
        $birthday = null;
        if (! empty($row['PERSONAL_BIRTHDAY'])) {
            try {
                $birthday = Carbon::parse(substr((string) $row['PERSONAL_BIRTHDAY'], 0, 10))->toDateString();
            } catch (Throwable) {
            }
        }
        $fill = array_filter([
            'position' => Str::limit(trim((string) ($row['WORK_POSITION'] ?? '')), 120, '') ?: null,
            'department_id' => $dept > 0 ? $dept : null,
            'phone' => $phone ? mb_substr($phone, 0, 40) : null,
            'birthday' => $birthday,
        ], fn ($value) => $value !== null);

        $user = User::query()->where('bitrix_id', $bid)->first()
            ?? ($email !== '' ? User::query()->where('email', $email)->whereNull('bitrix_id')->first() : null);
        if ($user) {
            $empty = array_filter($fill, fn ($value, $key) => blank($user->getAttribute($key)), ARRAY_FILTER_USE_BOTH);
            $linked = $user->bitrix_id === null;
            $this->report[$linked ? 'linked' : 'updated'] += ($linked || $empty) ? 1 : 0;
            if (! $this->dry && ($linked || $empty)) {
                $user->forceFill($empty + ['bitrix_id' => $bid])->save();
            }
        } else {
            $this->report['created']++;
            if ($this->dry) {
                return;
            }
            $login = $email !== '' && ! User::query()->where('email', $email)->exists() ? $email : "b24-{$bid}";
            $user = User::query()->forceCreate($fill + [
                'name' => $name !== '' ? $name : $login,
                'email' => $login,
                'password' => Str::password(40),
                'role' => 'staff',
                'is_active' => false,
                'bitrix_id' => $bid,
            ]);
        }

        if ($this->photos && ! $this->dry && ! $user->avatar && ! empty($row['PERSONAL_PHOTO']) && str_starts_with((string) $row['PERSONAL_PHOTO'], 'http')) {
            try {
                $bytes = $this->bitrix->download($row['PERSONAL_PHOTO']);
                if ($bytes) {
                    Avatars::storeBytes($user, $bytes);
                    $this->report['photos']++;
                }
            } catch (Throwable) {
            }
        }
    }
}
