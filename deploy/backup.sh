#!/bin/sh
# 备份数据库到 deploy/backups/，保留最近 14 天
# 建议加到 crontab：0 4 * * * /path/to/deploy/backup.sh
set -e
cd "$(dirname "$0")"
mkdir -p backups
docker compose exec -T db pg_dump -U tmc tmc | gzip > "backups/tmc-$(date +%Y%m%d-%H%M).sql.gz"
find backups -name 'tmc-*.sql.gz' -mtime +14 -delete
ls -lh backups | tail -3
