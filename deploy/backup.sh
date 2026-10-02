#!/bin/sh
#
# Резервная копия сайта: база данных (аккаунты, тайтлы, главы, библиотеки),
# загруженные обложки и аватары, настройки Supabase (.env с ключами).
#
#   sh ~/shiori/deploy/backup.sh
#
# Копии складываются в ~/backups, копии старше 14 дней удаляются.
# Как восстановить — в DEPLOY.md, раздел «Резервные копии».
#
# Переменные (необязательно): SUPABASE_DIR, BACKUP_DIR, KEEP_DAYS.

set -eu

SUPABASE_DIR=${SUPABASE_DIR:-$HOME/supabase-project}
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DB_FILE="$BACKUP_DIR/db_$STAMP.dump"
FILES_FILE="$BACKUP_DIR/files_$STAMP.tar.gz"
trap 'rm -f "$DB_FILE.part" "$FILES_FILE.part"' EXIT

# Вся база в сжатом формате pg_dump. supabase_admin — суперпользователь,
# поэтому в копию попадают и аккаунты (схема auth), и данные хранилища.
docker exec supabase-db pg_dump -U supabase_admin -h localhost -d postgres -Fc > "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"

# Файлы хранилища (обложки, аватары) и .env.
cd "$SUPABASE_DIR"
if [ -d volumes/storage ]; then
    tar -czf "$FILES_FILE.part" .env volumes/storage
else
    tar -czf "$FILES_FILE.part" .env
fi
mv "$FILES_FILE.part" "$FILES_FILE"
chmod 600 "$DB_FILE" "$FILES_FILE"

find "$BACKUP_DIR" -maxdepth 1 \( -name 'db_*.dump' -o -name 'files_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete

echo "$(date '+%F %T') готово: $DB_FILE ($(du -h "$DB_FILE" | cut -f1)), $FILES_FILE ($(du -h "$FILES_FILE" | cut -f1))"
