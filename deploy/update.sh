#!/bin/sh
# 发布新版本：拉取代码 → 重新构建 → 重启（数据库迁移在启动时自动执行）
set -e
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
