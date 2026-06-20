#!/usr/bin/env bash
# 在线部署：本机构建 → 把 dist + server.mjs 推到服务器 → pm2 拉起。
# 只动 pocket-earth 自己的目录，不碰服务器上已有的其它应用。
#
# 用法：
#   PEM=/path/to/key.pem REMOTE=root@<server-ip> ./deploy/online/deploy.sh
# 可选：
#   APP_DIR（远程目录，默认 ~/pocket-earth）  APP_NAME（pm2 名，默认 pocket-earth）
set -euo pipefail

PEM="${PEM:?请设置 PEM=部署私钥路径}"
REMOTE="${REMOTE:?请设置 REMOTE=root@服务器IP}"
APP_DIR="${APP_DIR:-~/pocket-earth}"
APP_NAME="${APP_NAME:-pocket-earth}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH=(ssh -i "$PEM" -o StrictHostKeyChecking=no)

chmod 600 "$PEM"
cd "$ROOT"

echo "==> 本机构建 dist ..."
npm run build

echo "==> 推送 dist + server.mjs 到 $REMOTE:$APP_DIR ..."
"${SSH[@]}" "$REMOTE" "mkdir -p $APP_DIR"
rsync -az --delete -e "ssh -i $PEM -o StrictHostKeyChecking=no" \
  dist server.mjs "$REMOTE:$APP_DIR/"

echo "==> 远程提示 .env（首次需手动创建，含 DASHSCOPE_API_KEY 等）"
"${SSH[@]}" "$REMOTE" "[ -f $APP_DIR/.env ] && echo '已存在 .env' || echo '⚠️  $APP_DIR/.env 不存在，请先创建（见 deploy/online/README.md）'"

echo "==> pm2 拉起/重启 ..."
"${SSH[@]}" "$REMOTE" "cd $APP_DIR && (pm2 restart $APP_NAME || pm2 start server.mjs --name $APP_NAME) && pm2 save"

echo "==> 远程自测："
"${SSH[@]}" "$REMOTE" "sleep 1; curl -s http://127.0.0.1:\$(grep -E '^API_PORT=' $APP_DIR/.env | cut -d= -f2)/healthz || true"
echo ""
echo "部署完成。若已配好 nginx + 证书，访问你的域名即可。"
