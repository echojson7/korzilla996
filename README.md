# Korzilla 996

Внутренний портал компании Korzilla на замену Битрикс24: сотрудники и отделы,
CRM-сделки с воронками, задачи, бизнес-процессы, уведомления.

Отдельный репозиторий, отдельно от CMS korzillaX: кода CMS нет.

## Что внутри

```
app/, routes/, database/   сервер на Laravel 13: вход сотрудников, учётки,
                           мессенджер (API /api/messenger/…, файлы чатов —
                           storage/app/private/messenger)
public/index.php           вход в сервер; API — /index.php/api/…
web/                       интерфейс: Vue 3 + Vite + Tailwind 4 + стили HeroUI v3
  src/pages/               обзор, мессенджер, сделки (канбан), задачи (канбан
                           и таблица), сотрудники, процессы
  src/shell/ChatRail.vue   колонка чатов справа: обложки, счётчики, быстрый чат
  src/lib/data.ts          демо-данные, пока их нет на сервере
  public/bg/               фоны (свои, web/scripts/backgrounds.py)
public/portal/             готовая сборка web/ (коммитится: на стенде нет node)
public/app/index.html      старый адрес, уводит на /portal/
```

## Запуск

```bash
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate
php artisan staff:create owner@example.ru "Имя Фамилия" --role=owner   # печатает пароль
php artisan serve                                                     # http://localhost:8000/
```

Интерфейс:

```bash
cd web && npm ci
npm run dev      # http://localhost:5173/, API проксируется на :8000
npm run build    # сборка в public/portal — коммитить вместе с исходниками
```

На стенде портал раздаётся из подпапки `/996/` стенда korzillaX: папка
`~/korzilla996`, ссылка `~/korzillax/public/996 → ~/korzilla996/public`.
API идёт через `/996/index.php/api/…`: Caddy отдаёт подпапке только
существующие файлы, а остальное уводит в Laravel стенда.

Учётки — только из консоли: `staff:create`, `staff:password`, `staff:disable`.
Роли: `owner`, `admin`, `staff`. Сессия своя (кука `k996_session`, путь `/996`),
с админкой korzillaX не пересекается.

## Дальше

1. Права по ролям; переезд с SQLite на MySQL, когда на стенде будет своя база.
2. Сотрудники и отделы из базы.
3. CRM: сделки, воронки и стадии (импорт из Битрикс24, 14 воронок).
4. Задачи.
5. Движок бизнес-процессов с импортом шаблонов Битрикс24 (28 шаблонов).
6. Уведомления.
