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
Artisan::command('changelog:post {file : путь к .md или «-» для stdin} {--at= : время записи, например «2026-11-26 10:05» (по умолчанию — сейчас)} {--media=* : картинка или видео к записи (PNG, JPEG, WebP, GIF, MP4, WebM); первая — обложка}', function () {
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
    $media = $this->option('media');
    foreach ($media as $path) {
        if (! is_file($path)) {
            $this->error("Нет файла: {$path}");

            return 1;
        }
    }
    $message = $chat->messages()->create(['user_id' => null, 'kind' => 'text', 'body' => $body]);
    foreach ($media as $path) {
        $mime = mime_content_type($path) ?: 'application/octet-stream';
        $size = str_starts_with($mime, 'image/') ? @getimagesize($path) : false;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION) ?: 'bin');
        $stored = 'messenger/'.$chat->id.'/'.\Illuminate\Support\Str::random(40).'.'.$ext;
        \Illuminate\Support\Facades\Storage::disk('local')->put($stored, file_get_contents($path));
        $message->files()->create(['name' => basename($path), 'path' => $stored, 'mime' => $mime, 'size' => filesize($path), 'width' => $size ? $size[0] : null, 'height' => $size ? $size[1] : null]);
    }
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
    /* Вместе со строками — и сами файлы, иначе они остаются в storage. */
    $query->with('files')->get()->each(function ($message) {
        \Illuminate\Support\Facades\Storage::disk('local')->delete($message->files->pluck('path')->all());
        $message->forceDelete();
    });
    $chat->members()->update(['last_read_id' => 0]);
    $chat->update(['last_message_at' => $chat->messages()->max('created_at')]);
    \App\Support\Realtime::emit($chat->members()->pluck('user_id')->map(fn ($id) => (int) $id)->all(), 'chat', ['chatId' => $chat->id]);
    $this->info("Удалено записей: {$count}");
})->purpose('Удалить записи портала из канала Changelog');

/* Чаты задач, у которых задачи больше нет (остались от удалённых до исправления). */
Artisan::command('chats:prune-orphans {--force : удалить, без этого только показать}', function () {
    $orphans = \App\Models\Chat::query()->where('entity', 'like', 'task:%')->get()
        ->reject(fn ($chat) => \App\Models\Task::query()->whereKey((int) substr($chat->entity, 5))->exists());
    foreach ($orphans as $chat) {
        $this->line("#{$chat->id} {$chat->entity} «{$chat->title}», сообщений: ".$chat->messages()->withTrashed()->count());
    }
    if (! $this->option('force') || $orphans->isEmpty()) {
        $this->info('Найдено: '.$orphans->count().($orphans->isEmpty() ? '' : '. Удалить — с --force'));

        return 0;
    }
    $orphans->each->drop();
    $this->info('Удалено чатов: '.$orphans->count());
})->purpose('Показать или удалить чаты задач без задачи');

/* Личные чаты «… теперь в команде» между всеми сотрудниками — задним числом, без дублей. */
Artisan::command('staff:greet-all', function () {
    $this->info('Заведено личных чатов: '.\App\Support\GeneralChat::greetAll());
})->purpose('Завести недостающие личные чаты между сотрудниками («… теперь в команде»)');

/* Настройки CRM из Битрикс24: воронки, стадии, поля сделок (см. App\Support\BitrixImport). */
Artisan::command('crm:import-bitrix {--dir= : папка с deal-stages.json и deal-fields.json (по умолчанию database/bitrix24)}', function () {
    $dir = rtrim($this->option('dir') ?: database_path('bitrix24'), '/');
    $read = function (string $name) use ($dir) {
        $path = "{$dir}/{$name}";
        if (! is_file($path)) {
            throw new RuntimeException("Нет файла {$path}");
        }

        return json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
    };
    $report = (new App\Support\BitrixImport)->run($read('deal-stages.json'), $read('deal-fields.json'));
    $this->info("Воронок: +{$report['pipelines']}, стадий: +{$report['stages']}, полей: +{$report['fields']}.");
    if ($report['skipped']) {
        $this->line('Не перенесены (привязки к CRM, товары, бронь — этап 2): '.implode('; ', $report['skipped']));
    }
    App\Support\Realtime::changed('crm', App\Support\DealAccess::everyone());
})->purpose('Перенести воронки, стадии и поля сделок из выгрузки Битрикс24');

/* Сотрудники и отделы из Битрикс24 по вебхуку: новые — выключенными (см. App\Support\Bitrix\ImportUsers). */
Artisan::command('bitrix:users {--no-photos : без фото} {--dry : только посчитать, ничего не записывать}', function () {
    $report = (new App\Support\Bitrix\ImportUsers(App\Support\Bitrix\Client::fromConfig(), ! $this->option('no-photos'), (bool) $this->option('dry')))->run();
    $this->info(($this->option('dry') ? 'Пробно. ' : '')."Отделов новых: {$report['departments']}. Сотрудников заведено выключенными: {$report['created']}, найдено по почте: {$report['linked']}, дописано полей у прежних: {$report['updated']}, фото: {$report['photos']}, пропущено без имени и почты: {$report['skipped']}.");
})->purpose('Перенести сотрудников и отделы из Битрикс24 (новые учётки выключены)');


/* Компании, контакты и сделки из Битрикс24 по вебхуку (см. App\Support\Bitrix\ImportCrm). Сначала bitrix:users и crm:import-bitrix. */
Artisan::command('bitrix:crm {--only=* : companies, contacts, deals, deal_contacts, leads, products (по умолчанию компании, контакты, сделки)} {--leads=all : all — все лиды, year — рабочие и провалы за год, work — рабочие} {--update : переписать уже перенесённые из Битрикса}', function () {
    ini_set('memory_limit', '512M');
    Illuminate\Support\Facades\DB::disableQueryLog();
    $webhook = (string) config('services.bitrix24.webhook');
    $parts = parse_url($webhook);
    $portal = ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '');
    $labels = ['companies' => 'Компании', 'contacts' => 'Контакты', 'deals' => 'Сделки', 'leads' => 'Лиды', 'products' => 'Товары (каталог)',
        'lead_contacts' => 'Контакты лидов', 'deal_contacts' => 'Контакты сделок', 'product_rows_deal' => 'Товары сделок', 'product_rows_lead' => 'Товары лидов'];
    $only = $this->option('only') ?: ['companies', 'contacts', 'deals'];
    $started = microtime(true);
    $import = new App\Support\Bitrix\ImportCrm(App\Support\Bitrix\Client::fromConfig(), $portal, (bool) $this->option('update'), function ($key, $done, $total) use ($labels, $started) {
        $this->line(sprintf('%s: %d из %d (%d с)', $labels[$key] ?? $key, $done, $total, microtime(true) - $started));
    });
    $import->leads = (string) $this->option('leads');
    $report = $import->run($only);
    foreach ($labels as $key => $label) {
        if (isset($report[$key]) && is_array($report[$key])) {
            $one = $report[$key];
            $this->info("{$label}: в Битриксе {$one['total']}, новых {$one['new']}, обновлено {$one['updated']}, уже были {$one['kept']}.");
        }
    }
    foreach (['lead_contacts' => 'Связей лид — контакт', 'deal_contacts' => 'Связей сделка — контакт', 'product_rows' => 'Строк товаров'] as $key => $label) {
        isset($report[$key]) && $this->info("{$label}: {$report[$key]}.");
    }
    if (! empty($report['deals_no_pipeline'])) {
        $this->warn("Сделок без известной воронки (не перенесены): {$report['deals_no_pipeline']}.");
    }
})->purpose('Перенести компании, контакты и сделки из Битрикс24');

/* Задачи из Битрикс24 по вебхуку (см. App\Support\Bitrix\ImportTasks). Сначала bitrix:users и bitrix:crm. */
Artisan::command('bitrix:tasks {--no-checklists : без чек-листов}', function () {
    ini_set('memory_limit', '512M');
    Illuminate\Support\Facades\DB::disableQueryLog();
    $started = microtime(true);
    $labels = ['tasks' => 'Задачи', 'checklists' => 'Чек-листы (задач)'];
    $report = (new App\Support\Bitrix\ImportTasks(App\Support\Bitrix\Client::fromConfig(), ! $this->option('no-checklists'), function ($key, $done, $total) use ($labels, $started) {
        $this->line(sprintf('%s: %d из %d (%d с)', $labels[$key], $done, $total, microtime(true) - $started));
    }))->run();
    $this->info("Задачи: в Битриксе {$report['total']}, новых {$report['new']}, уже были {$report['kept']}. Участников {$report['members']}, со сделкой {$report['deals']}, подзадач {$report['parents']}, пунктов чек-листов {$report['checklists']}.");
})->purpose('Перенести задачи из Битрикс24');

/* Статусы и поля лидов из Битрикс24 по вебхуку (как crm:import-bitrix для сделок). */
Artisan::command('bitrix:lead-settings', function () {
    $bitrix = App\Support\Bitrix\Client::fromConfig();
    $statuses = iterator_to_array($bitrix->each('crm.status.list', ['order' => ['SORT' => 'ASC']]), false);
    $fields = $bitrix->call('crm.lead.fields')['result'] ?? [];
    $report = (new App\Support\BitrixImport)->lead($statuses, $fields);
    $this->info("Статусов лидов: +{$report['stages']}, полей: +{$report['fields']}.");
    if ($report['skipped']) {
        $this->line('Не перенесены: '.implode('; ', $report['skipped']));
    }
})->purpose('Перенести статусы и поля лидов из Битрикс24');

/* Счета из Битрикс24: старые и смарт-счета (см. App\Support\Bitrix\ImportInvoices). Сначала bitrix:crm (сделки, лиды). */
Artisan::command('bitrix:invoices', function () {
    ini_set('memory_limit', '512M');
    Illuminate\Support\Facades\DB::disableQueryLog();
    $started = microtime(true);
    $labels = ['old' => 'Старые счета', 'new' => 'Новые счета'];
    $report = (new App\Support\Bitrix\ImportInvoices(App\Support\Bitrix\Client::fromConfig(), function ($key, $done, $total) use ($labels, $started) {
        $this->line(sprintf('%s: %d из %d (%d с)', $labels[$key], $done, $total, microtime(true) - $started));
    }))->run();
    $this->info("Счета: старых {$report['old']}, новых {$report['new']}, уже были {$report['kept']}, строк товаров {$report['rows']}.");
    if (! empty($report['new_error'])) {
        $this->warn('Новые счета не перенеслись: '.$report['new_error']);
    }
})->purpose('Перенести счета из Битрикс24');

/* Документы из шаблонов Битрикс24 с файлами (см. App\Support\Bitrix\ImportDocuments). Сначала bitrix:crm и bitrix:invoices. */
Artisan::command('bitrix:documents {--no-files : только записи, без скачивания файлов}', function () {
    ini_set('memory_limit', '512M');
    Illuminate\Support\Facades\DB::disableQueryLog();
    $started = microtime(true);
    $report = (new App\Support\Bitrix\ImportDocuments(App\Support\Bitrix\Client::fromConfig(), ! $this->option('no-files'), function ($key, $done, $total) use ($started) {
        $this->line(sprintf('Документы: %d из %d (%d с)', $done, $total, microtime(true) - $started));
    }))->run();
    $this->info(sprintf('Документы: новых %d, уже были %d, файлов %d (%.1f МБ), без файла %d.', $report['new'], $report['kept'], $report['files'], $report['bytes'] / 1048576, $report['no_file']));
})->purpose('Перенести документы из шаблонов Битрикс24 вместе с файлами');

/* Смарт-процессы Битрикс24: типы, стадии, поля, элементы (см. App\Support\Bitrix\ImportSmart). После bitrix:crm и bitrix:documents. */
Artisan::command('bitrix:smart', function () {
    ini_set('memory_limit', '512M');
    Illuminate\Support\Facades\DB::disableQueryLog();
    $parts = parse_url((string) config('services.bitrix24.webhook'));
    $started = microtime(true);
    $report = (new App\Support\Bitrix\ImportSmart(App\Support\Bitrix\Client::fromConfig(), ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? ''), function ($key, $done, $total) use ($started) {
        $this->line(sprintf('Смарт-процесс %s: %d из %d (%d с)', $key, $done, $total, microtime(true) - $started));
    }))->run();
    $this->info("Смарт-процессы: типов +{$report['types']}, стадий +{$report['stages']}, полей +{$report['fields']}, элементов {$report['items']} (уже были {$report['kept']}), документов привязано {$report['documents']}.");
})->purpose('Перенести смарт-процессы из Битрикс24');
