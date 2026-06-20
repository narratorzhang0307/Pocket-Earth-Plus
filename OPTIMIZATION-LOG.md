# Pocket Earth · 自主持续优化日志

这是一条自驱动的持续打磨流程：每轮挑一个维度，对抗式找问题 → 验证 → 修 → 构建验证 → 提交并推送私有备份，循环推进，直到项目足够完善。

## 每轮固定流程（cycle）
1. **选维度**：从下方维度池里轮换（或由「完整性批判」指出最该补的）。
2. **对抗式找问题**：用 workflow 多 agent 并行扫该维度，发现项逐条**对抗式复核**（默认证伪），只留确认为真的。
3. **修**：只做小而稳、可回退的改动；优先非热区文件；动到热区（server.mjs / MyMapTab / MusicAgentsTab / mapMarkers / council）时最小化、谨慎。
4. **验证**：`npm run build` 必须过；有单测就跑；可观测的改动在预览里验。**没过不提交。**
5. **落盘**：`git add <本轮改的具体文件>`（**绝不 `-A`**，免得带进 langchain-master 等未跟踪目录）→ `git commit`（`[Plus]` 前缀 + Co-Authored-By 结尾）。
6. **推送**：`git push origin main`（私有 **Pocket-Earth-Plus**）。**绝不推 public-DO-NOT-PUSH（公开 Pocket-Earth）**——pre-push hook 已硬拦，但仍只对 origin 推。
7. **记账**：在下方「轮次日志」追加一行（轮号 / 维度 / 改了什么 / 提交哈希）。
8. **续上**：ScheduleWakeup 安排下一轮，循环继续。

## 维度池（轮换）
- correctness / 边界与空值（对抗式 bug 猎杀）
- 错误处理与韧性（try/catch、降级、竞态）
- 类型安全（any / 不安全断言 / 非空断言滥用）
- 一致性与文案（UI 措辞、命名、跨文件口径）
- 性能（重渲染、重 import、懒加载、缓存）
- 无障碍 a11y（aria / 对比度 / 点击区）
- 死代码 / 未用导出 / 冗余
- 测试覆盖（关键纯逻辑补单测）
- 文档与注释（与代码对齐）

## 硬规则
- 推送只走 `origin`（私有 Pocket-Earth-Plus）；公开仓库一律不碰。
- 提交禁用词不入库：比赛 / 参赛 / 复用 / 复制 / 评委 / 简历 / hackathon / 日落电台 / Sunset Radio。
- 全程中文叙述。模型只用通义 Qwen，绝不引入别家。
- 构建不过、或改动有破坏风险 → 回退本轮，不提交。

## 轮次日志
| 轮 | 日期 | 维度 | 改了什么 | commit |
|---|---|---|---|---|
| R0 | 2026-06-21 | 基线 | 落盘本会话改动（jot-agent 改名 / FROST 任庭长 / 西湖照走 OSS / 诗句便签 / ?embed + 独立录制台 / SW v14）+ 建优化流程 | ed32eaf |
| R1 | 2026-06-21 | correctness/robustness · lib+harness | workflow 24 找→13 确认全修：①movie cast 空值护栏 ②travel plan / enrich fetch 超时主动 abort（去重复 withTimeout 死码）③seasonOf 容错非零填充月份 ④照片 EXIF 复用免每张重复解析 ⑤无日期照片去重收窄（GPS 异地豁免 + 严阈 4）⑥mood 概览城市数过滤脏地名 + 恰好 2 地点也带第二处（MoodReview 复用同口径）⑦skillForge / heartbeat 存档损坏护栏 ⑧health 空串重载 ⑨多字节 UTF-8 chunk 边界中文损坏（viteEdge + server.mjs readBody）。build 净 + 11 文件 tsc 零新错 | (本轮) |
