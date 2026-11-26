#!/bin/sh
# Переложить записи Changelog за 26.11 поэтапно, с обложками и роликами.
# Запускать из корня портала:
#   sh docs/changelog/2026-11-26/publish.sh ~/korzilla996-env/bin/php
# Время — UTC (в портале показывается по местному). Первая --media — обложка.
set -e
PHP="${1:-php}"
D="$(dirname "$0")"
M="$D/media"
"$PHP" artisan changelog:clear --force
"$PHP" artisan changelog:post "$D/01-messenger.md" --at="2026-11-26 10:05" --media="$M/01-messenger.mp4"
"$PHP" artisan changelog:post "$D/02-realtime-tasks.md" --at="2026-11-26 11:30" --media="$M/02-tasks.webp" --media="$M/02-task-card.webp"
"$PHP" artisan changelog:post "$D/03-message-actions.md" --at="2026-11-26 11:58" --media="$M/03-views.webp" --media="$M/03-reactions.webp"
"$PHP" artisan changelog:post "$D/04-gif-speed.md" --at="2026-11-26 12:10" --media="$M/04-composer.webp"
"$PHP" artisan changelog:post "$D/05-general-chat.md" --at="2026-11-26 12:45" --media="$M/05-general.mp4"
"$PHP" artisan changelog:post "$D/06-staff-access.md" --at="2026-11-26 13:15" --media="$M/06-profile.webp" --media="$M/06-settings.webp"
"$PHP" artisan changelog:post "$D/07-changelog.md" --at="2026-11-26 13:40" --media="$M/07-changelog.webp"
