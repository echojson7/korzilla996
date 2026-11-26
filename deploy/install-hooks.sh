#!/bin/sh
# Один раз на стенде: хуки git вызывают deploy/after-update.sh после
# pull (merge и rebase), commit и смены ветки. Посреди rebase молчат:
# сработают один раз в конце (post-rewrite).
cd "$(dirname "$0")/.." || exit 1
HOOKS="$(git rev-parse --git-path hooks)"
for hook in post-merge post-rewrite post-commit post-checkout; do
  case $hook in
    post-merge|post-rewrite) base='$(git rev-parse -q --verify ORIG_HEAD)' ;;
    post-checkout) base='$1' ;;
    *) base='' ;;
  esac
  cat > "$HOOKS/$hook" <<HOOK
#!/bin/sh
# Korzilla 996: кэши Laravel и пакеты после обновления кода (deploy/install-hooks.sh).
[ "\$1" = amend ] && exit 0
[ -d "\$(git rev-parse --git-path rebase-merge)" ] || [ -d "\$(git rev-parse --git-path rebase-apply)" ] && exit 0
exec sh "\$(git rev-parse --show-toplevel)/deploy/after-update.sh" $hook "$base"
HOOK
  chmod +x "$HOOKS/$hook"
done
echo "Хуки поставлены в $HOOKS"
