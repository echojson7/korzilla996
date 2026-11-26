#!/bin/sh
# Переложить записи Changelog за 26.11 поэтапно. Запускать из корня портала:
#   sh docs/changelog/2026-11-26/publish.sh ~/korzilla996-env/bin/php
# Время — UTC (в портале показывается по местному).
set -e
PHP="${1:-php}"
DIR="$(dirname "$0")"
"$PHP" artisan changelog:clear --force
"$PHP" artisan changelog:post "$DIR/01-messenger.md" --at="2026-11-26 10:05"
"$PHP" artisan changelog:post "$DIR/02-realtime-tasks.md" --at="2026-11-26 11:30"
"$PHP" artisan changelog:post "$DIR/03-message-actions.md" --at="2026-11-26 11:58"
"$PHP" artisan changelog:post "$DIR/04-gif-speed.md" --at="2026-11-26 12:10"
"$PHP" artisan changelog:post "$DIR/05-general-chat.md" --at="2026-11-26 12:45"
"$PHP" artisan changelog:post "$DIR/06-staff-access.md" --at="2026-11-26 13:15"
"$PHP" artisan changelog:post "$DIR/07-changelog.md" --at="2026-11-26 13:40"
