# Правила для Claude

- Это Korzilla 996 — внутренний портал компании, не CMS. Код CMS korzillaX сюда
  не переносить. Работать только в ветке `main`, пушить прямо в неё; других веток не создавать.
- Интерфейс — Vue 3 + Vite + Tailwind 4 + стили HeroUI v3 (`@heroui/styles`,
  классы вроде `button button--primary`, `card`, `chip`), как в docs.korzilla.
  React и `@heroui/react` не используем. Исходники в `web/`, сборка — в
  `public/portal/`, и она коммитится: на стенде нет node, там только `git pull`.
  После правок в `web/`: `cd web && npm ci && npm run build`, коммитить вместе
  с `public/portal/`.
- Скорость — главное: каждый раздел отдельным куском (`web/src/pages.ts`),
  тяжёлые библиотеки не тянуть, иконки — `@lucide/vue` поштучно. Стили HeroUI
  подключаются выборочно в `web/src/styles.css`: новый компонент HeroUI —
  строка там.
- Вид как в Битрикс24: фон-фотография (`web/public/bg`, выбор в шапке),
  меню и шапка на стекле, содержимое на белых подложках (`.sheet`, `.column`).
- Новые тексты — только по-русски.
- Адреса разделов — после `#` (`#/tasks?view=board`): портал лежит статикой
  в `public/portal/`. Приложение ходит в API по адресу `../index.php/api/…`
  от страницы (`web/src/lib/api.ts`), адреса относительные.
- Стенд: свой сервер http://185.9.25.61:8996/ (служба `korzilla996-web`,
  окружение `~/korzilla996-env`), со стендом korzillaX ничего общего нет.
- Сервер — Laravel 13 в корне ветки. Учётки сотрудников заводят владелец
  и администраторы в «Настройках» портала или консолью (`staff:create`),
  регистрации нет.
- Права — как в Битрикс24: роль у сотрудника одна (`users.role` — ключ из
  таблицы `roles`), уровни по разделам none/own/dept/all
  (`App\Support\Access`, задачи — `App\Policies\TaskPolicy`). Новый
  раздел или действие — строка в `Access::schema()` и `defaults()`, проверка
  на сервере обязательна; во фронте `can()` из `web/src/lib/access.ts`
  только прячет недоступное. Владелец и администратор — всё; владельцев
  меняет только владелец, последнего не понизить.
- Скорость сервера: FrankenPHP в worker-режиме (Laravel Octane, воркер —
  `public/index.php`). Приложение живёт между запросами, поэтому никакого
  состояния в `static`-свойствах, синглтонах и глобальных переменных: всё
  про текущего пользователя — только из `$request`. Воркеры перезапускаются
  сами, когда меняются `app/`, `config/`, `routes/`, `bootstrap/`, `.env`
  или пакеты, и после каждых 500 запросов.
- Кэши Laravel (config, routes, events) на стенде собирает
  `deploy/after-update.sh` из хуков git после pull, commit и checkout
  (поставить один раз: `sh deploy/install-hooks.sh`). Поменял `routes/` или
  `config/` и проверяешь без коммита — сначала `php artisan optimize:clear`,
  иначе работают старые маршруты. Тесты кэш не читают (`phpunit.xml`).
- Отделы — справочник `departments`, у сотрудника `users.department_id`.
  В API и формах отдел по-прежнему названием: `$user->department` читает
  имя и при записи находит отдел по ключу (нижний регистр, пробелы
  схлопнуты) или заводит (`App\Models\Department::idFor`). В списках
  сотрудников — `with(['roleRecord', 'departmentRecord'])`, иначе N+1.
- Планировщик: `Schedule` в `routes/console.php`, на стенде его раз в минуту
  запускает таймер `korzilla996-schedule` (юниты в `deploy/systemd/`, копии
  в `~/.config/systemd/user`). Всё «по времени» (чистка журналов,
  напоминания) — туда, тяжёлое — пачками, чтобы не держать запись в SQLite.
- Кэш — APCu (`CACHE_STORE=apc`, память FrankenPHP, при перезапуске пустеет:
  в кэше только то, что можно пересчитать), сессии — файлы
  (`SESSION_DRIVER=file`). Таблицы `cache` и `sessions` не используются:
  «выйти на других устройствах» — `App\Http\Middleware\CheckSignIn`
  (отпечаток пароля в сессии + выключенная учётка), строки из `sessions`
  не удалять. В CLI APCu свой и обычно выключен — консоль кэш веба не видит.
- SQLite в режиме WAL: рядом с `database.sqlite` лежат `-wal` и `-shm`.
  Копию базы снимать не `cp`, а `VACUUM INTO`: `~/korzilla996-env/bin/php -r
  '(new PDO("sqlite:database/database.sqlite"))->exec("VACUUM INTO \"/путь/копия.sqlite\"");'`.
- Обои — AVIF и WebP рядом (`web/public/bg`): новое фото — оба формата,
  AVIF: `ffmpeg -i x.webp -c:v libaom-av1 -still-picture 1 -crf 26 x.avif`.
