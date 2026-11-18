<?php

use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

/*
 * Учётки сотрудников заводит консоль: формы регистрации у портала нет,
 * иначе он стоял бы с открытой дверью до первого вошедшего.
 */
Artisan::command('staff:create {email} {name} {--role=staff : owner, admin или staff} {--position=} {--department=}', function () {
    $email = mb_strtolower(trim($this->argument('email')));
    $role = $this->option('role');
    if (! isset(User::ROLES[$role])) {
        $this->error('Роль — owner, admin или staff.');

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
    $count = User::query()->where('email', mb_strtolower(trim($this->argument('email'))))->update(['is_active' => false]);
    $this->info($count ? 'Учётка выключена.' : 'Такой учётки нет.');
})->purpose('Выключить учётку сотрудника');
