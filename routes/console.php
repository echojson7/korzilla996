<?php

use App\Models\Role;
use App\Models\User;
use App\Support\Realtime;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Str;

/*
 * Учётки сотрудников заводят владелец и администраторы — в настройках
 * портала или здесь, в консоли. Формы регистрации у портала нет, иначе он
 * стоял бы с открытой дверью до первого вошедшего.
 */
Artisan::command('staff:create {email} {name} {--role=staff : owner, admin, staff или ключ своей роли} {--position=} {--department=}', function () {
    $email = mb_strtolower(trim($this->argument('email')));
    $role = $this->option('role');
    if (! isset(User::ROLES[$role]) && ! Role::query()->where('key', $role)->exists()) {
        $this->error('Роль — owner, admin, staff или ключ своей роли из настроек.');

        return 1;
    }
    if (User::query()->where('email', $email)->exists()) {
        $this->error("Учётка {$email} уже есть. Новый пароль — staff:password {$email}.");

        return 1;
    }
    $password = Str::password(16, symbols: false);
    User::query()->create([
        'email' => $email,
        'name' => $this->argument('name'),
        'role' => $role,
        'position' => $this->option('position'),
        'department' => $this->option('department'),
        'password' => $password,
    ]);
    $this->info("Учётка заведена: {$email}");
    $this->line("Пароль: {$password}");
})->purpose('Завести учётку сотрудника портала');

Artisan::command('staff:password {email}', function () {
    $user = User::query()->where('email', mb_strtolower(trim($this->argument('email'))))->first();
    if (! $user) {
        $this->error('Такой учётки нет.');

        return 1;
    }
    $password = Str::password(16, symbols: false);
    $user->update(['password' => $password]);
    $this->info("Новый пароль для {$user->email}: {$password}");
})->purpose('Выдать сотруднику новый пароль');

Artisan::command('staff:disable {email}', function () {
    /* Через модель, не одним UPDATE: так учётка выбывает и из общего чата. */
    $user = User::query()->where('email', mb_strtolower(trim($this->argument('email'))))->first();
    $user?->update(['is_active' => false]);
    $this->info($user ? 'Учётка выключена.' : 'Такой учётки нет.');
})->purpose('Выключить учётку сотрудника');

/*
 * Планировщик. На стенде его раз в минуту запускает таймер systemd --user
 * korzilla996-schedule (deploy/systemd/), команда — artisan schedule:run.
 * Сюда же дальше — напоминания о сроках задач, дни рождения и прочее «по времени».
 */
Artisan::command('realtime:prune', function () {
    $this->info('Убрано событий: '.Realtime::prune());
})->purpose('Убрать журнал real-time старше трёх суток');

Schedule::command('realtime:prune')->hourly()->withoutOverlapping();
