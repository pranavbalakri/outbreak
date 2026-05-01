#!/usr/bin/env bash
# Nightly Postgres backup. Intended to run in a cron/systemd timer on the
# backup host with DATABASE_URL and BACKUP_DIR set.
#
# Example crontab (rotated via `find -mtime +14` to 14 days of history):
#   0 3 * * * /opt/breaklog/scripts/backup-postgres.sh
#
# Restore with: pg_restore --clean --if-exists -d "$DATABASE_URL" <file>
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/breaklog}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/breaklog-$stamp.dump"

echo "Writing $out"
pg_dump --format=custom --no-owner --no-acl --dbname="$DATABASE_URL" > "$out"

echo "Pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'breaklog-*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "Done."
