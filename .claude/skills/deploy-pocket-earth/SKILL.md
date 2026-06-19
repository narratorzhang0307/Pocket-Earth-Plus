---
name: deploy-pocket-earth
description: 把当前构建部署到生产 ECS 的 pocketearth 站点(pocketearth.throughtheglass.art)。当用户说"部署/上线/deploy/发布/推上去"时用。流程：bump sw.js 版本 → npm run build → deploy/online/deploy.sh(推 dist+server.mjs + pm2 重启) → 验 healthz(应 llm:qwen) + 公开站 sw.js 版本号。Not for：公开仓库 Pocket-Earth(明令禁动)、服务器上其它 pm2 应用、纯 git 推送。
disable-model-invocation: true
allowed-tools:
  - Read
  - Edit
  - Bash(npm run build:*)
  - Bash(curl:*)
  - Bash(cd:*)
---

# 部署 Pocket Earth 到生产

**任务型 skill**：部署生产是有副作用的高危操作，只能由用户显式 `/deploy-pocket-earth` 触发，绝不自动执行（"最坏情况测试"：自动把半成品推上线=吓人 → 任务型）。

## Quick Reference

| 步骤 | 命令 / 动作 | 校验 |
|---|---|---|
| 1 预检 | `git status -sb` | 确认要部署的状态；**注意另一窗口的未提交改动也会被一起构建**（见 [[two-window-coordination]]）|
| 2 bump 缓存 | Edit `public/sw.js` 的 `const VERSION = 'pe-vN'` → `pe-v(N+1)` | 让 PWA 拉到新壳、清旧 `pocket-earth-*` 缓存（保 webllm 模型缓存）|
| 3 构建 | `npm run build` | `✓ built`，无 error |
| 4 部署 | 见下方部署命令 | rsync dist+server.mjs → pm2 重启 → 远程 healthz |
| 5 验证 | 见下方验证命令 | healthz `llm:qwen`；公开站 sw.js = 新版本号 |

## 部署命令（固定参数，照抄）

```bash
PEM=/Users/zhangcheng/Documents/测试你的文学基因/literature.pem \
REMOTE=root@43.98.248.74 \
APP_DIR='~/pocketearth' APP_NAME='pocketearth' \
./deploy/online/deploy.sh
```
- 多分钟任务，建议 `run_in_background: true` + `dangerouslyDisableSandbox: true`（需联网 SSH）。
- 脚本只推 `dist + server.mjs`，**不同步 .env** —— 生产 `~/pocketearth/.env` 已含 `DASHSCOPE_API_KEY`+`QWEN_MODEL`（首次/换 key 才需手动加）。
- 详见契约文件 `deploy/online/README.md`（去哪查：远程目录结构、nginx、首次 .env 创建）。

## 验证命令

```bash
curl -s https://pocketearth.throughtheglass.art/sw.js | grep -m1 "const VERSION"   # 应为本次 bump 的新版本
curl -s https://pocketearth.throughtheglass.art/healthz                            # 应 {"llm":"qwen","model":"qwen-plus",...}
```
两者都对 = 新构建确已上线。

## 红线（务必遵守）

- **绝不碰公开仓库 `narratorzhang0307/Pocket-Earth`**（`.git/hooks/pre-push` + `.claude/hooks/block-public-repo.sh` 已物理拦截）。部署与 git 备份独立——备份只推私有 `Pocket-Earth-Plus`（见 [[git-remote-pocket-earth]]）。
- 只动服务器上 `pocketearth`(id 32, port 见 .env) 这一个 pm2 应用；旧的 `pocket-earth`(3008 回退版) 别动。
- 部署前若工作区有另一窗口的半成品，先确认它能 build（构建失败 deploy.sh 会自动中止、不推生产）。
