---
name: verify-in-preview
description: 在浏览器预览里验证 Pocket Earth 的 UI 改动。当需要"看效果/验证界面/截图确认/preview 里跑一下/确认 UI 生效"时用。覆盖：起 preview 拿 serverId、注入 pe.profile.v1 + ?keep 跳过 demoReset 清零、分步点击避开 React 渲染时序、截图/snapshot、绕开 dev HMR 整页重载(改用 prod server 跑多步流程)。Not for：纯逻辑/类型验证(用 npm run build + node 单测)、Service Worker/PWA 行为(仅生产注册)。
allowed-tools:
  - Read
  - Bash(npm run build:*)
---

# 在预览里验证 UI（Pocket Earth）

**参考型 skill**：无副作用，按需自动加载。

## Quick Reference（踩过的坑 → 对策）

| 现象 | 对策 |
|---|---|
| 改了源码预览没变 | dev HMR 偶发不热更 → `preview_eval` 跑 `location.reload()` 强刷；或改动 dist 类需 `npm run build` 后再看 |
| **dev(5173) 每隔几秒整页重载**打断多步流程 | 是 vite HMR 怪癖(SW 仅 PROD 注册)。**多步 UI 流程改用 prod server**：`node server.mjs`(launch.json 的 `pocket-earth-prod`,3008)服务 dist，无 HMR；改完先 `npm run build` 再看 |
| 点 tab/按钮后状态没变 | React 渲染是下一 tick；**分步 eval**：一次只点一个，下一个 eval 再点/读，别在同一个 eval 里"点完立刻读" |
| 广场/推荐等页"画像太薄"无数据 | demoReset 每次加载清 `pe.*`。验证前**注入画像 + 用 `?keep` 跳过清零**（见下） |
| 验证颜色/字号 | 别只靠截图，用 `preview_inspect` 读具体 CSS 属性 |

## 注入画像 + 跳过 demoReset（验证依赖 profile 的页面）

```js
// preview_eval：写一份示例长期画像，再用 ?keep 重载(跳过 demoReset 清零)
localStorage.setItem('pe.profile.v1', JSON.stringify({
  domains: { movies:{directors:[{tag:'伯格曼',n:5}],countries:[{tag:'日本',n:6}]},
             music:{genres:[{tag:'流行',n:7}]}, books:{authors:[{tag:'川端康成',n:4}]} },
  seedVersion:1, updatedAt:'2026-06-19T12:00:00.000Z' }));
location.href = '/?keep';   // ?keep 跳过 demoReset，画像存活
```

## 标准流程

1. `preview_list` 拿 serverId（没有就 `preview_start` 起 `pocket-earth` 或 `pocket-earth-prod`）。
2. 需要画像的页面：先注入 + `?keep`（上面）。
3. 分步导航：点底部 tab（Photos/地球/Agents）→ 点目标 agent 卡 →（每步单独 eval + 读 `document.body.textContent` 确认到位）。
4. `preview_screenshot` 看版面 / `preview_snapshot` 看文本结构 / `preview_inspect` 看精确 CSS。
5. 云脑相关（建图/夜间报告等）：触发后**轮询 DOM**等 Qwen 返回（几十秒），别立刻截图。

## 何时不用预览

- 纯函数/算法/类型 → `npm run build` + 一段 `node -e` 单测（如 markPlace/matchCatalog 的逻辑）。
- SW/PWA 缓存行为 → 仅生产注册，dev 看不到，部署后真机验。
