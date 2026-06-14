# 在线部署（线上 demo）

把 Pocket Earth 部署成一个公网可访问的站点。拓扑：**nginx（443/SSL）→ 反代 → 本机 node 服务（内网端口）→ 静态 dist + 三个 /api 端点**。

```
浏览器 ──https──▶ nginx :443  ──proxy──▶ node server.mjs :3008
                  （Certbot 证书）          ├─ /            静态托管 dist/（SPA 回退）
                  HTTP:80 → 301 https        ├─ /api/frost-llm  云脑代理（DeepSeek，密钥服务端读）
                                             ├─ /api/edge       端侧推理（MNN/ollama/stub 三级降级）
                                             └─ /api/unsplash   星球 agent 抓图代理
```

## 设计要点

- **单文件零依赖服务**：`server.mjs` 只用 Node 内置模块，无需 `npm install`，直接 `node server.mjs` 或 pm2 拉起。
- **构建期 / 运行期分离**：
  - `VITE_MAPBOX_TOKEN` 是**构建期**注入（`import.meta.env`），随 `dist` 打包；本地 `npm run build` 后发布 `dist` 即可，无需在服务器上构建。
  - `DEEPSEEK_API_KEY` / `UNSPLASH_ACCESS_KEY` 是**运行期**由服务端从 `.env` 读，**永不进前端 bundle**。
- **端侧降级**：端侧模型本是给真机的；线上 Web demo 默认 `EDGE_BACKEND=stub`，`/api/edge` 返回确定性兜底值，前端 `edgeSafe` 自动降级，功能不受影响。若服务器另起了 MNN sidecar / ollama，设 `MNN_URL` 或 `EDGE_BACKEND` 即可切真端侧。

## 服务器 `.env`（放在与 server.mjs 同目录，chmod 600）

```
DEEPSEEK_API_KEY=...        # 云脑，必填才有 agent 对话
UNSPLASH_ACCESS_KEY=...     # 可选，星球 agent 抓图；缺省则该功能优雅降级
API_PORT=3008               # 反代到的内网端口
EDGE_BACKEND=stub           # auto|mnn|ollama|stub；云上默认 stub
# MNN_URL=http://127.0.0.1:8000   # 若服务器跑了端侧 sidecar 再开
```

## 一键部署

```bash
# 本机：构建并把 dist + server.mjs 推到服务器，远程用 pm2 拉起
PEM=/path/to/key.pem REMOTE=root@<server-ip> ./deploy/online/deploy.sh
```

脚本只发布 `dist` 与 `server.mjs`，不动服务器已有的其它应用与 `.env`（首次需手动建 `.env`）。

## nginx 与证书

1. 把 `nginx-pocket-earth.conf` 放到 `/etc/nginx/conf.d/`（按需改 `server_name` 与反代端口），`nginx -t && systemctl reload nginx`。
2. 签 HTTPS（会自动把配置改写成 443 + 80→443 跳转）：
   ```bash
   certbot --nginx -d <your-domain> --non-interactive --agree-tos --redirect
   ```
   续期由 certbot 的定时任务自动完成。

## 进程管理

```bash
pm2 start server.mjs --name pocket-earth   # 启动
pm2 save                                   # 持久化（开机自启需 pm2 startup）
pm2 logs pocket-earth                       # 看日志
pm2 restart pocket-earth                    # 改 .env / 换 dist 后重启
```

## 验证

```bash
curl https://<your-domain>/healthz                       # {"ok":true,"edge":"stub","llm":"on"}
curl -X POST https://<your-domain>/api/frost-llm \
  -H 'content-type: application/json' -d '{"prompt":"你好"}'   # 云脑应返回文本
```
