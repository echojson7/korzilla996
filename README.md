# Korzilla 996

Внутренний портал компании Korzilla на замену Битрикс24: сотрудники и отделы,
CRM-сделки с воронками, задачи, бизнес-процессы, уведомления.

Отдельный репозиторий, отдельно от CMS korzillaX: кода CMS нет.

## Что внутри

```
app/, routes/, database/   сервер на Laravel 13: вход сотрудников, учётки
public/index.php           вход в сервер; API — /index.php/api/…
public/eokit/              дизайн-система EOKIT (копия frontend/eokit из ветки Kirye)
public/app/                оболочка admin2 и модули портала, без сборки
  modules/portal/          обзор, сделки (канбан), задачи, сотрудники, процессы;
                           data.js — демо-данные, пока их нет на сервере
```

## Запуск

```bash
composer install
cp .env.example .env && php artisan key:generate
touch database/database.sqlite && php artisan migrate
php artisan staff:create owner@example.ru "Имя Фамилия" --role=owner   # печатает пароль
php artisan serve                                                     # http://localhost:8000/
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
