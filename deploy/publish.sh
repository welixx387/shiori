#!/bin/sh
#
# Обновляет сайт на своём сервере: применяет схему базы, собирает сайт
# и выкладывает его в папку, которую раздаёт Caddy.
#
#   sh ~/shiori/deploy/publish.sh
#
# Адрес API и публичный ключ берутся из .env Supabase, вписывать их не нужно.
# Сборка идёт в контейнере node:22, ставить Node.js на сервер не надо.
# Пошаговая инструкция — в DEPLOY.md.
#
# Переменные (необязательно):
#   SUPABASE_DIR    папка Supabase, по умолчанию ~/supabase-project
#   SITE_DIR        куда выкладывать сайт, по умолчанию /var/www/shiori
#   NPM_REGISTRY    откуда ставить npm-пакеты (по умолчанию выбирается само)
#   VITE_SITE_NAME  своё название сайта вместо «Shiori»

set -eu

SUPABASE_DIR=${SUPABASE_DIR:-$HOME/supabase-project}
SITE_DIR=${SITE_DIR:-/var/www/shiori}
APP_DIR=$(cd "$(dirname "$0")/.." && pwd)

die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }
env_value() { grep "^$1=" "$SUPABASE_DIR/.env" | head -n1 | cut -d= -f2- | tr -d "\r\"'"; }

[ -f "$SUPABASE_DIR/.env" ] || die "не найден $SUPABASE_DIR/.env — сначала установите Supabase (шаг 7 в DEPLOY.md)"
API_URL=$(env_value SUPABASE_PUBLIC_URL)
ANON_KEY=$(env_value ANON_KEY)
SITE_URL=$(env_value SITE_URL)
case "$API_URL" in
    https://*) ;;
    *) die "SUPABASE_PUBLIC_URL в $SUPABASE_DIR/.env должен начинаться с https:// (сейчас: '$API_URL'), см. шаг 8" ;;
esac
[ -n "$ANON_KEY" ] || die "в $SUPABASE_DIR/.env нет ANON_KEY"

docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 \
    || die "Supabase не запущен. Запустите: cd $SUPABASE_DIR && sh run.sh start"

echo "==> Схема базы данных"
# Скрипт можно применять повторно: он только добавляет недостающее и обновляет функции.
docker exec -i -e PGOPTIONS='--client-min-messages=warning' supabase-db \
    psql -q -v ON_ERROR_STOP=1 -U postgres -h localhost -d postgres \
    < "$APP_DIR/supabase/schema.sql" >/dev/null

# registry.npmjs.org работает через Cloudflare, а его в России замедляют.
# Если пакет не скачивается за 20 секунд, ставим зависимости через зеркало GitVerse.
if [ -z "${NPM_REGISTRY:-}" ]; then
    if curl -fsS --max-time 20 -o /dev/null https://registry.npmjs.org/react/-/react-18.3.1.tgz 2>/dev/null; then
        NPM_REGISTRY=https://registry.npmjs.org/
    else
        NPM_REGISTRY=https://npm-mirror.gitverse.ru/
        echo "    registry.npmjs.org не отвечает, пакеты возьму с зеркала $NPM_REGISTRY"
    fi
fi

echo "==> Сборка сайта (API: $API_URL)"
docker run --rm \
    -v "$APP_DIR":/app -w /app \
    -v shiori-npm-cache:/root/.npm \
    -e VITE_SUPABASE_URL="$API_URL" \
    -e VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
    -e VITE_SITE_NAME="${VITE_SITE_NAME:-}" \
    -e npm_config_registry="$NPM_REGISTRY" \
    -e npm_config_audit=false \
    -e npm_config_fund=false \
    -e npm_config_update_notifier=false \
    node:22-alpine sh -c 'npm ci && npm run build'

[ -f "$APP_DIR/dist/index.html" ] || die "сборка не создала dist/index.html"

echo "==> Публикация в $SITE_DIR"
mkdir -p "$SITE_DIR/assets"
# Сначала новые файлы из assets/ (в их именах хеш, поэтому существующие не трогаем),
# затем остальное и в самом конце index.html — так читатель никогда не получит
# страницу, которая ссылается на ещё не скопированные файлы. Старые файлы
# не удаляем: у читателей с открытой вкладкой они ещё могут подгружаться.
for f in "$APP_DIR"/dist/assets/*; do
    [ -e "$SITE_DIR/assets/${f##*/}" ] || cp "$f" "$SITE_DIR/assets/"
done
for f in "$APP_DIR"/dist/*; do
    case "${f##*/}" in assets|index.html) continue ;; esac
    cp -R "$f" "$SITE_DIR/"
done
cp "$APP_DIR/dist/index.html" "$SITE_DIR/.index.html.new"
mv -f "$SITE_DIR/.index.html.new" "$SITE_DIR/index.html"

echo ""
echo "Готово! Сайт: $SITE_URL"
