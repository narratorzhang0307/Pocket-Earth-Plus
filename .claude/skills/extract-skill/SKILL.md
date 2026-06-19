---
name: extract-skill
description: 把项目里重复/领域无关的能力抽成运行时 skill 模块（解耦）。当用户说"抽 skill / 这段重复了 / 解耦进 skill / 沉淀成能力 / 六层镜像去重"时用。流程：审计重复→判家目录→领域差异做参数→建+改 import+删镜像→build+node 单测→守禁用词→[Plus] 提交推私有 origin→更新 skills/README。Not for：开发期 SOP 文档（那本身就是 .claude/skills 的 SKILL.md）、公开仓库（明令禁动）。
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(grep:*)
  - Bash(npm run build:*)
  - Bash(node:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git push:*)
---
# 抽运行时 skill（解耦 app 层共享能力）

**参考型 skill**：指导"把重复/领域无关能力沉淀成可调用模块"的标准流程。抽的是**运行时 TS 模块**（各 agent `import` 的代码），不是本文件这种 SKILL.md。

## Quick Reference
| 步 | 动作 | 校验 / 要点 |
|---|---|---|
| 1 审计 | `grep -rl` 找近镜像文件、`wc -l` 量化重复 | 确认是**真重复**或**领域无关原语**才抽；单消费者也可抽（若该能力本不该归某 curator 私有）|
| 2 判家目录 | 见下「家目录约定」 | 依赖 app 数据 → `src/app/lib/skills/`；只依赖 harness → `frost-agent/skills/` |
| 3 设计 | 领域差异**做成参数**（schema / 噪声词 / keyPath / geo.kind），不写死分支；可注入后端（依赖倒置）；能组合就组合已有 skill | 单一职责、最小接口、<500 行 |
| 4 接线 | 建 skill → 各消费者改 `import` → **删镜像副本** | 保留原有导出名（薄壳 re-export），别断下游 import |
| 5 验证 | `npm run build` 净 + 纯逻辑跑 `node` 单测 | **行为保持**；UI 改动才用 preview（见 [[verify-in-preview]]）|
| 6 守禁用词 | 入库前 `grep -nE` 扫**禁用词** | 见下「红线」|
| 7 提交 | `git add <仅自己的文件>` → `[Plus]` 前缀 commit → `git push origin` | **只推私有 origin**；只 add 自己文件（双窗口）|
| 8 收尾 | 在 `src/app/lib/skills/README.md`（路由器）索引补一行 | 让目录自解释 |

## 家目录约定（两种 skill 别混）
- `src/app/lib/skills/` = **app 层**：依赖 userMarks / geoStickers / catalog / 画像 等 app 数据。
- `frost-agent/skills/` = **内核层**：只依赖 harness（不能反向依赖 app）。
- 本文件所在的 `.claude/skills/*/SKILL.md` = **开发期** Claude Code 技能，不跑在 app 里。

## 设计要点（§3.12 迁移自软件工程）
- **关注点分离**：领域无关能力不归任何 curator 私有。
- **依赖倒置**：调用方依赖输入输出契约，不依赖实现（如 visionRead/textExtract 可注入端侧/云后端）。
- **泛化**：领域差异做参数（如 `keyedStore(库名,keyPath)`、`parseTitle(text,噪声词)`、`textExtract({fields})`）。
- **可组合**：skill 调 skill、无层级（如 `visionExtract = visionRead + textExtract`）。

## 验证规矩
- 优先 `npm run build`（类型净）+ `node -e` 跑纯函数单测（正则/哈希/解析），断言**行为与抽取前一致**。
- 别为验证去开 preview，除非改动**浏览器可见**（那时见 [[verify-in-preview]]）。
- 端侧能力（edgeSafe.vision / 浏览器 CLIP）线上是 stub，完整链路留真机——如实说明，不假装验过。

## 红线（务必遵守）
- **禁用词**（入库内容不得出现）：`比赛、参赛、复用、复制、评委、简历、hackathon、日落电台、Sunset Radio`。用「共享 / 通用 / 多处调用 / 各写一套」替代。
- **绝不碰公开仓库** `narratorzhang0307/Pocket-Earth`（pre-push hook + block-public-repo hook 已物理拦截）。备份**只推私有 `Pocket-Earth-Plus`(origin)**。
- **双窗口纪律**：只 `git add` 自己改的文件（禁 `-A`）、commit 加 `[Plus]` 前缀、避开热区（server.mjs / MyMapTab / MusicAgentsTab / mapMarkers / council——另一窗口的域）。

## 部署（可选，独立步骤）
skill 抽取是纯重构、默认不单独部署。要上线见 [[deploy-pocket-earth]]（bump sw.js → build → deploy.sh → 验 healthz）。
