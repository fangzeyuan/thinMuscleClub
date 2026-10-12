#!/bin/sh
# 生成 deploy/.env，并自动填上随机密钥（已有的值不会被覆盖）
set -e
cd "$(dirname "$0")"
[ -f .env ] || cp .env.example .env
gen() { head -c 48 /dev/urandom | base64 | tr -d '/+=\n' | head -c "$1"; }
for key in POSTGRES_PASSWORD:32 JWT_SECRET:48 CODE_PEPPER:32; do
  name=${key%%:*}; len=${key##*:}
  if grep -q "^$name=$" .env; then
    sed -i.bak "s|^$name=$|$name=$(gen "$len")|" .env && rm -f .env.bak
    echo "已生成 $name"
  fi
done
chmod 600 .env
echo "完成。请编辑 deploy/.env 填写 DOMAIN、SMTP_USER、SMTP_PASS、SIGNUP_ALLOWLIST"
