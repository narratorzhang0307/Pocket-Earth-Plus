# FROST 主-子 Agent 调用规范（Orchestration Protocol）

> 一句话：**FROST = 主 agent（CEO / 调度器），agents / JOT-AGENT / AGENT-FORGE = 子 agent（专项员工）。**
> 这正是黄佳《Claude Code 实战 · Harness 工程之道》第 4 章「分而治之：子智能体与任务委派的艺术」里的 **CEO 委派模型 / SubAgent 模式**。
>
> 本文回答三件事：①这到底是不是书里的「主-子 agent」关系（是）；②在**本 app 里**一个子 agent 怎样才能「被调用」；③写一个子 agent 的「定义」要多**规范**才能被可靠调起。

---

## 0. 为什么这是「主-子 agent」关系

书里（第 4 章，CEO 委派模型）：主 agent 不该亲自吞下所有原始数据，而是**扮演 CEO**——把任务拆解、委派给专门的「员工」（子 agent），只把**结论**收回来。三条原则：

| 原则 | 书里的话（要义） | 在 FROST 的体现 |
|---|---|---|
| **上下文隔离** | 子 agent 有独立上下文，读的文件 / 中间推理**不回流**主对话，防「上下文污染」 | 每个 agent 是独立运行页（独立 state / 独立 RunTrace），FROST 控制台只拿「钉成功了吗」这种结论 |
| **任务委派** | 主 agent 打包任务上下文 → 启动子 agent；子 agent 只看到被传入的任务描述 | 路线 A：`onRun(target)` 把「跳到哪个 agent」这件事派下去；路线 B：`runFrost` 把这句话的意图派给意图处理器 |
| **结论汇总** | 子 agent 只回传**摘要**（500 行日志 → 1 行根因） | agent 跑完只回「suggest 描述子」+「确认才落地球」，不把中间 token 灌回主对话 |

> 嵌套深度：书里建议**子 agent 不超过 2 层**。FROST 是 `主 → 子`，到此为止，不再往下嵌。

主 agent vs 子 agent 的职责分工（书 §4.6）：

| | 主 agent（FROST） | 子 agent（agent / JOT-AGENT / forge） |
|---|---|---|
| 身份 Who | CEO / 调度器 | 专项角色（点歌、看片、记一笔…） |
| 任务 What | 意图识别、路由决策、结论汇总 | 单一职责的核心目标 |
| 范围 Where | 全局、主对话上下文 | 自己的运行页 / 自己的数据图层 |
| 交付 Output | 精炼结论 | 结构化阶段成果（suggest-then-confirm） |

---

## 1. 关键区别：Claude Code 的「md 即调用规范」 vs 本 app 的「代码即路由」

这是你问的核心——「md 的写法是不是要规范一点才能调用」。答案分两种世界：

### 1.1 Claude Code（书里的世界）：md 就是可执行的调用规范
- 子 agent 由 `.claude/agents/<name>.md` 定义，frontmatter 必填 `name` / `description` / `tools`。
- **主 agent 靠 `description` 字段做语义匹配来自动委派**。书里反复强调（§3.4.2）：
  > 「description 并非人类阅读的说明性文字，而是 Claude 在决策『是否调用此 Skill』时所依据的**唯一信号**。」
- 所以在 Claude Code 里，**md 写得规不规范 = 能不能被调起**。写法公式（书 §3.4.2）：

  ```yaml
  ---
  name: api-doc-generator           # kebab-case，用途驱动，≤64 字符，禁品牌词(claude/anthropic)
  description: |
    生成 API 文档（功能定义 · What）。
    Use when user asks to "write API docs" / "document endpoints" / "create OpenAPI specs"（触发场景 · When）。
    Supports Express, FastAPI, Spring Boot（核心能力）。
    Not for: general code questions or debugging（排除范围 · 强烈推荐，防误触发）。
  tools: [Read, Grep, Bash(npm run docs:*)]   # 工具白名单 = 物理边界（最小权限）
  ---
  ```
  三段式：**功能(What) + 触发场景(Use when…) + 排除(Not for…)**。description 共享全局字符预算，超了会被「静默排除」，主 agent 根本看不到。

### 1.2 Pocket Earth（本 app 的世界）：调用在代码里，md 是「设计契约 + 注册清单」
本 app 的 FROST **不读 md 去决定调谁**——它是**确定性代码路由**（更可控、能离线 / 端侧跑）。一个子 agent 要「可被调用」，必须在下面这几处**登记一致**。三条调用通道：

| 通道 | 触发 | 链路（文件:符号） |
|---|---|---|
| **A · 显式委派** | FROST 快捷入口「派给子 agent」按钮，或控制台点 RUN | `FrostBuddyPage.QUICK` → `onRun(target)` → `MusicAgentsTab.runSkill` → `RUN_BY_NAME[target] ?? HERO_BY_NAME[target]` → `setRunning()` → 运行页 |
| **B · 意图委派** | 跟 FROST 对话，它判意图 | `FrostBuddyPage.send` → `harness/router.runFrost` → `routeRegex` / 端侧分类 → `intentRegistry.getIntentHandler(intent)` → 意图处理器 |
| **C · 主动建议** | 心跳产「今日推荐」 | `harness/heartbeat.candidates()` → `suggestion.target` → 采纳后走通道 A 的 `runSkill` |
| **D · 造物主白名单** | AGENT-FORGE 造新技能，只能路由到已有 agent | `harness/skillForge.ALLOWED_TARGETS`（必须 = `RUN_BY_NAME` 的键集） |

> ⚠️ 所以「调用一个子 agent」≠ 写一个 md，而是**在 A/C/D 用的同一个 `target` 名字下、把这几处登记对齐**。本文件就是这份对齐清单。

---

## 2. 注册一个「可被调用」的子 agent —— 落地清单

即便本 app 的调用在代码里，**每个子 agent 仍按书里的 schema 写「定义」**（写进运行页顶部注释 + 下面的注册表），这样描述精确、职责不重叠，三条通道才路由得准。

### 2.1 子 agent 定义 schema（照搬书里 description 三段式）
```
name:        kebab-case 用途驱动名（= target 路由键），禁品牌词
description: 功能(What) + 触发场景(Use when…) + 排除(Not for…)
keywords:    路线 B 的 routeRegex / 端侧意图分类命中词（≤8 个，互不重叠）
target:      路由键，必须出现在 RUN_BY_NAME（计入 AGENTS 数）或 HERO_BY_NAME（hero，不计数）
scope/tools: 这个子 agent 能碰什么数据 / 调什么（最小权限）
output:      suggest-then-confirm —— 只产建议，用户确认才写数据（绝不偷改）
```
**单一职责**（书 §4.7）：一个子 agent 只有一个「变化的理由」。**避免描述重叠**（书 §4.7）：两个子 agent 描述太像 → 路由不准。

### 2.2 新增一个子 agent 的步骤（改这几处就能被调起）
1. 写运行页组件 `XxxRunPage.tsx`（按 schema 写顶部注释；遵守 suggest-then-confirm）。
2. `MusicAgentsTab.tsx`：① `import`；② `Running` 联合类型加成员；③ `if (running === 'xxx') return <XxxRunPage/>`；④ 若要进控制台列表，`GROUPS` 加一行；⑤ `RUN_BY_NAME['xxx-agent'] = 'xxx'`（或 hero 放 `HERO_BY_NAME`）。
3. 要让 **FROST 能调**：`FrostBuddyPage.QUICK` 加一条 `{ label, target }`（label=人话，target=路由键）。
4. （可选）要让**对话也能自动委派**：在 `intentRegistry` 注册意图 + 在 `routeRegex` / 端侧分类加 keywords。
5. 要让**造物主能造**指向它的技能：`skillForge.ALLOWED_TARGETS` 加键（**保持 = `RUN_BY_NAME` 键集**，否则造出的技能点击死链）。
6. 自检：description 不与现有重叠 · target 三处一致能路由 · 最小权限 · suggest-then-confirm。

---

## 3. 现有子 agent 注册表（actual · 2026-06）

主 agent：**FROST**（`FrostBuddyPage`，总 agent，路线 A/B 的发起者）。

| name (target) | 功能 / Use when / Not for | 路由键 | 入口 | 运行页 |
|---|---|---|---|---|
| `music-agent` | 把音乐钉到歌手出身地 / 歌曲城市。Use when 点歌·歌单·音乐。 | RUN_BY_NAME→`music` | QUICK「来份歌单」· 列表 | MusicAgentPage |
| `books-agent` | 把书钉到故事地 / 作者地 + 读完日期。Use when 读书·书单·某作者。 | →`books` | QUICK「翻翻我的书」· 列表 | BooksAgentPage |
| `movies-agent` | 把电影钉到取景地 / 故事地。Use when 看片·影单。 | →`movies` | QUICK「聊聊电影」· 列表 | MoviesAgentPage |
| `photos-agent` | 端侧整理相册，高价值照片钉地球。Use when 整理照片·相册。 | →`photos` | QUICK「整理相册」· 列表 | PhotosAgentRunPage |
| `travel-agent` | 按喜好端侧规划行程，完成即钉星球。Use when 规划行程·去某地玩。 | →`travel` | 列表 | TravelRunPage |
| `jot-agent`（**记一笔**） | 一句话/截图 → FROST 判书·影·行程·心情 → 钉到对应图层；记心情还能回望。Use when 不想先选 agent，随手记一切。**Not for**：明确要点歌/规划长行程时直接进专属 agent 更准。 | →`jot` | **QUICK「记一笔」**· 列表 | UniversalCaptureRunPage |
| `council-room` | 圆桌 / 辩论 / 法庭：多 agent 同台。Use when 想让多个 agent 一起出谋划策。 | →`council` | 列表 | CouncilPage |
| `public-plaza` | 委派你的 agent 去公共广场社交，夜里回来报告。Use when 想让 agent 替你社交。 | →`plaza` | 列表 | PublicPlazaPage |
| `agent-forge`（**AGENT-FORGE**） | 说一句话，让 FROST 造一个新 agent（端侧/云 Qwen 拟稿 → 安全闸 → 钉地球）。Use when 现成 agent 都不对味、想要个新的。 | **HERO_BY_NAME→`agentforge`**（hero，不计 AGENTS 数） | **QUICK「造个 agent」**· 控制台 hero 卡 | AgentForgePage |

FROST 对话里的**意图处理器**（路线 B，子能力而非运行页）：`tour`（跟日落环游）/ `open_dj`（开放策展）/ `city_culture`（城市文化问答）/ `switch`（换歌/切城）/ `chitchat` / `general` / `regenerate`，见 `harness/intentRegistry.ts`。

> 本轮已去掉的死项：`planet-builder`（造星球）——已从 QUICK、heartbeat、`ALLOWED_TARGETS`、`Running` 联合、路由、运行页全部移除（地球的 planet 图层无种子、渲染空，保留无副作用）。

---

## 4. 与书的对照：哪些已对齐、哪些是本 app 的取舍

| 书里的工程主张 | 本 app | 说明 |
|---|---|---|
| CEO 委派 / 子 agent | ✅ 对齐 | FROST 派活给 agents |
| 上下文隔离 | ✅ 对齐 | 每 agent 独立运行页 + 独立 RunTrace |
| 单一职责 | ✅ 对齐 | 一个 agent 一件事 |
| 最小权限（工具白名单=物理边界） | ✅ 对齐 | `ALLOWED_TARGETS` 是造物主的物理边界；技能审查闸 `reviewSkill` 默认拒绝 |
| 输出格式契约 | ✅ 对齐 | suggest-then-confirm = 书的 confirm gate |
| description 是调用信号、要三段式 | ⚠️ 部分 | 本 app 路由在代码（确定性），description 不直接驱动 A，但驱动 B 的 keywords 命中 + 端侧分类 + 给云脑的 prompt，**写法照样要规范** |
| md 即子 agent 定义、自动语义委派 | ❌ 取舍 | 本 app 用代码登记而非 md 语义匹配——更可控、可离线/端侧；代价是新增 agent 要改第 2.2 节那几处（本规范就是为对齐它们） |

---

## 5. 回到你的问题

- **「这是不是黄佳书里的主-子 agent 关系？」** —— 是。FROST↔agents 就是 CEO 委派模型 / SubAgent 模式，连「只回传结论、上下文隔离、单一职责、最小权限、confirm 才落地」这些细则都对得上。
- **「那个 md 的写法是不是要规范一点才能调用？」** ——
  - 在 **Claude Code** 里：是，`description` 就是被调起的唯一信号，写不好就被静默排除。
  - 在 **本 app** 里：调用不读 md、靠代码登记；但 description / keywords 仍决定路线 B 的意图命中与端侧分类，**写法同样要规范**（功能 + Use when + Not for + 不重叠）。
  - 所以本文件的作用：把「散在 QUICK / RUN_BY_NAME / HERO_BY_NAME / intentRegistry / ALLOWED_TARGETS 各处的登记点」收成**一份可对照的规范**，新增/调用子 agent 照第 2.2 节走即可。

---

*参考：黄佳《Claude Code 实战 · Harness 工程之道》第 3.4.2 节（description 写法）、第 4 章（子 agent 与委派）、§4.6（职责分工）、§4.7（单一职责/避免重叠/嵌套≤2 层）。本 app 实现见 `frost-agent/harness/router.ts`、`intentRegistry.ts`、`heartbeat.ts`、`skillForge.ts` 与 `src/app/components/MusicAgentsTab.tsx`、`FrostBuddyPage.tsx`。*
