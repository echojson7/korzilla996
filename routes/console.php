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

/*
 * Запись в канал «Changelog» мессенджера: Markdown из файла (или «-» —
 * со стандартного ввода). Автор — сам портал, без сотрудника.
 */
Artisan::command('changelog:post {file : путь к .md или «-» для stdin} {--at= : время записи, например «2026-11-26 10:05» (по умолчанию — сейчас)}', function () {
    $file = $this->argument('file');
    $body = trim($file === '-' ? stream_get_contents(STDIN) : (is_file($file) ? file_get_contents($file) : ''));
    if ($body === '') {
        $this->error('Пустая запись: нужен непустой Markdown-файл.');

        return 1;
    }
    if (mb_strlen($body) > 10000) {
        $this->error('Слишком длинно: до 10 000 знаков.');

        return 1;
    }
    \App\Support\GeneralChat::sync();
    $chat = \App\Support\GeneralChat::chat(\App\Support\GeneralChat::CHANGELOG);
    $message = $chat->messages()->create(['user_id' => null, 'kind' => 'text', 'body' => $body]);
    if ($this->option('at')) {
        $at = \Illuminate\Support\Carbon::parse($this->option('at'));
        $message->forceFill(['created_at' => $at, 'updated_at' => $at])->save();
    }
    $chat->update(['last_message_at' => $chat->messages()->max('created_at')]);
    $payload = app(\App\Http\Controllers\MessengerController::class)->message($message->load(['files', 'reactions', 'replyTo']));
    $ids = $chat->members()->pluck('user_id')->map(fn ($id) => (int) $id)->all();
    \App\Support\Realtime::emit($ids, 'message', ['chatId' => $chat->id, 'message' => $payload, 'new' => true]);
    $this->info("Опубликовано в Changelog: сообщение #{$message->id}");
})->purpose('Опубликовать запись в канал Changelog');

/* Убрать все записи портала из Changelog (например, чтобы переложить их заново). */
Artisan::command('changelog:clear {--force : без вопроса}', function () {
    $chat = \App\Support\GeneralChat::chat(\App\Support\GeneralChat::CHANGELOG);
    $query = $chat->messages()->withTrashed()->whereNull('user_id')->where('kind', 'text');
    $count = (clone $query)->count();
    if (! $count || (! $this->option('force') && ! $this->confirm("Удалить записей: {$count}?"))) {
        $this->info('Ничего не удалено.');

        return 0;
    }
    $query->get()->each->forceDelete();
    $chat->members()->update(['last_read_id' => 0]);
    $chat->update(['last_message_at' => $chat->messages()->max('created_at')]);
    \App\Support\Realtime::emit($chat->members()->pluck('user_id')->map(fn ($id) => (int) $id)->all(), 'chat', ['chatId' => $chat->id]);
    $this->info("Удалено записей: {$count}");
})->purpose('Удалить записи портала из канала Changelog');

/* Личные чаты «… теперь в команде» между всеми сотрудниками — задним числом, без дублей. */
Artisan::command('staff:greet-all', function () {
    $this->info('Заведено личных чатов: '.\App\Support\GeneralChat::greetAll());
})->purpose('Завести недостающие личные чаты между сотрудниками («… теперь в команде»)');
