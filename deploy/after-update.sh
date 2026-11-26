#!/bin/sh
# Стенд: после git pull / commit / checkout в рабочей папке портала.
# Хуки git ставит deploy/install-hooks.sh. Скрипт:
#  1. ставит пакеты composer, если поменялся composer.lock;
#  2. пересобирает кэши Laravel (config, routes, events) — запуск без них
#     дольше на четверть. Если кэш не собрался (ошибка в маршрутах или
#     конфиге), кэши стираются и портал работает без них.
# Воркеры FrankenPHP перезапускает сам FrankenPHP (watch в Caddyfile),
# когда меняются файлы приложения или кэши.
cd "$(dirname "$0")/.." || exit 0
PHP="${PHP:-$HOME/korzilla996-env/bin/php}"
[ -x "$PHP" ] || PHP=php
COMPOSER="${COMPOSER_PHAR:-$HOME/korzillax-env/bin/composer.phar}"
LOG=storage/logs/deploy.log

{
  echo "== $(date '+%F %T') $1"
  if [ -n "$2" ] && [ "$2" != "$(git rev-parse HEAD)" ] && ! git diff --quiet "$2" HEAD -- composer.lock 2>/dev/null; then
    "$PHP" "$COMPOSER" install --no-dev --no-interaction --no-scripts --optimize-autoloader && "$PHP" artisan package:discover
  fi
  "$PHP" artisan config:cache && "$PHP" artisan route:cache && "$PHP" artisan event:cache \
    || { echo "кэш не собрался — работаем без кэша"; "$PHP" artisan optimize:clear; }
} >> "$LOG" 2>&1
exit 0
