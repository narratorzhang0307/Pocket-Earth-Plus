# Pocket Earth · 核心 Agent 架构（frost-agent）

> **项目定位**：Pocket Earth 口袋地球——一座装在浏览器里的「本地空间知识库」，由一套名为 **frost-agent** 的端云双脑多智能体框架驱动。它把你读过的书、看过的影、听过的歌、走过的路、拍过的照、记下的心情，统统收敛成地球上同一种带坐标的点，让你以「在哪」为索引重新找回自己的记忆。
>
> **一句话口号**：**端侧管挑和找 · 云端管写 · 地球是统一索引。**

---

## 项目概览

### 应用场景

一款手机端的个人空间知识库 App（PWA），端侧和云端配合运行。用地理坐标当索引，把书、电影、音乐、照片、行程、心情这些记录，钉回它们在地球上对应的真实位置，让一颗地球长成你自己的知识地图。不同类型的记录都归一成地图上同一种带坐标的点，所有 agent 的产出都落在同一颗地球上，地球成为统一索引。

### 用户痛点

- 散落各处：书在豆瓣、影在别处、照片在相册、行程在备忘，没有一处能合起来看。
- 按时间记不牢：想找一段记忆，记不清哪天、叫什么，只隐约记得在哪。
- 记完就沉底：记录变成死档、不再被唤起，越积越懒得记，坚持不下来。
- 工具不懂你：推荐总推已看过的，说不中「读得少却极爱」的真口味。
- 隐私不敢交：照片、票据含人脸、证件、定位，不敢整张交给云端。
- 整理太费劲：手动分类归档成本高，碎片越多越无从下手。

### 技术方案

- **模型选型（端云双脑）**：端侧用 Qwen 系列小模型做「挑和找」（分类、排序、检索、看图打标），当前网页 demo 端侧用浏览器内 WebLLM 跑 Qwen3-0.6B（文本），视觉与嵌入走服务端 ollama 的 qwen2.5vl:3b；云端用 Qwen-Plus 做「写」（补全、推荐理由、叙述）。密钥只在服务端，前端不持密钥，无 key 时回落规则。详见 [§7 端云双脑](#7-端云双脑)。
- **推理框架**：端侧落到设备上用 MNN，跑 Qwen3-0.6B（文本）+ Qwen2.5-VL-3B（视觉），针对 Arm SME2 指令集加速，可升级到 Qwen3-VL-2B/4B；服务端按 MNN、ollama、stub 逐级回落；端侧能力统一走 EdgeModel 接口，换后端前端不改。详见 [§7 端云双脑](#7-端云双脑)。
- **端侧适配思路**：原图只在端侧处理、不上云，敏感信息本地脱敏；识图做成可复用模块（图 → 文 → 结构化字段）；上云前先在端侧筛选、压成摘要和长期画像，只传少量结果；核心交互在本地完成，没有云端、端侧模型或断网时仍能运行。详见 [§12 端侧识图与隐私](#12-端侧识图与隐私)。

### 创新点

- **地球作索引**：六类碎片统一钉回真实坐标，用「在哪」当记忆主键，这是人脑最牢的一根轴；不同类型的个人对象都收敛成同一种带坐标的点。
- **端云双脑**：端侧管挑和找、云端管写；主 agent 以 CEO 的方式把活委派给子 agent，只回收结论，不亲自吞下原始数据；model 成为成本与隐私的杠杆。
- **能力沉淀**：通用能力沉淀成 skill（11 个运行时 + 4 个开发），agent 只剩薄配置，新增 agent 不改 skill，一处实现、处处可调。
- **越用越懂你**：跨会话长期画像，子 agent 跑完把脱敏偏好写回画像，配合回流与反思，推荐前先排除已看，说中你真正的口味；还能用 agent-forge 一句话生成新的子 agent 和专属主题地图。

### 预期效果

- **已上线**：浏览器或 PWA 打开即用，已锚定 2124 部电影、1055 本书、619 位艺人、536 张带经纬度的照片，全部归一成地图上的点，实时联动、记一笔地球立刻多一个点。
- **护隐私、省成本**：原图与票据在端侧脱敏，敏感数据不出设备，离线也能用；云端只接收筛过的少量结构化输入，省 token 也更稳。
- **长远目标**：让每个人都有一颗越用越懂自己、且隐私自持的口袋地球，把散落的书、影、乐、照片、行程、心情收集、归位，在地球上拼成「你」。

> 以下各章，是上面「技术方案」与「创新点」的逐项展开。

---

## 目录

0. [项目概览](#项目概览)
1. [项目定位与一句话概述](#1-项目定位与一句话概述)
2. [命名由来与精神内核](#2-命名由来与精神内核)
3. [总体架构鸟瞰](#3-总体架构鸟瞰)
4. [五条核心理念](#4-五条核心理念)
5. [内核 harness 六部件](#5-内核-harness-六部件)
6. [混合路由四级](#6-混合路由四级)
7. [端云双脑](#7-端云双脑)
8. [子 agent 解耦范式](#8-子-agent-解耦范式)
9. [长期记忆双层与闭环](#9-长期记忆双层与闭环)
10. [统一万能记一笔 JOT](#10-统一万能记一笔-jot)
11. [技能系统](#11-技能系统)
12. [端侧识图与隐私](#12-端侧识图与隐私)
13. [圆桌议事与流水线庭审](#13-圆桌议事与流水线庭审)
14. [可观测编排](#14-可观测编排)
15. [目录导览](#15-目录导览)
16. [如何新增一个子 agent](#16-如何新增一个子-agent)
17. [设计原则总结与演进路线](#17-设计原则总结与演进路线)

---

## 1. 项目定位与一句话概述

Pocket Earth 是一座**本地空间知识库**：把六类碎片化的个人记忆，分别钉回它们在地球上的位置：

| 碎片类型 | 地理锚定方式 |
| --- | --- |
| 书 | 故事发生地 / 作者所在地 |
| 影 | 取景地 / 国别 |
| 乐 | 歌手出身城市 / 歌词中的城市 |
| 照片 | EXIF 经纬度 |
| 行程 | 私人足迹 |
| 心情 | 端侧判出的地名 |

——全部收敛成**地球上同一种带坐标的点**。地球于是成了「统一索引」：标记钉在它该在的原地，不跟着屏幕滚动跑。

这背后是一套方法论：**把地球作为方法**。人对「我在哪读到这本书」「这部电影在哪取景」的记忆，往往比「哪一天」「叫什么名字」更牢固、更可检索。于是 Pocket Earth 用**地理坐标当记忆索引**，把世界钉回它该在的地方。

驱动这一切的是 **frost-agent**：一套端云双脑的 agent 框架。**端侧小模型管「挑和找」**（选歌、选图、判意图、检索记忆、读图打标），**云端大模型管「写」**（对话、结构化补全、研究生成），**地球是把这两者的产物统一编织起来的索引**。

---

## 2. 命名由来与精神内核

**Frost** 这个名字取自罗杰·泽拉兹尼的短篇《趁生命气息逗留》（*For a Breath I Tarry*）。小说里 Frost 是被造来统治地球北半球的最强机器，却痴迷于一个无法用算力解决的问题：**「做一个人是什么感觉？」** 它倾尽一切去**理解**人类，而非占有或取代人类。

这个精神内核被一字一句刻进了 frost-agent 的设计哲学：

- **理解而非占有**：系统的目的是「懂你」，不是「替你做主」。所有产出都是建议（suggest），用户确认（confirm）才落地——绝不偷改你的数据。
- **克制委派**：主 agent FROST 像一位 CEO，把脏活累活派给专门的子 agent，自己只做意图识别、路由、结论汇总。
- **耐心沉淀**：记忆像空气一样无感累积——你每钉一个点，它就更懂你一点，但从不喧宾夺主、从不复述「我记得你说过」。

FROST 对用户永远是**同一个 Frost**：无论背后调了多少子 agent、降级了几层，对外都借同一副声音说话（见 §5 SHELL 部件）。

---

## 3. 总体架构鸟瞰

frost-agent 是一个**分层 harness**：最上是统一的对话/记一笔入口，中间是内核外壳（六部件）做路由与治理，下面是被委派的领域子 agent，再下是端云双脑两台推理引擎，所有产物最终汇入地球这条统一索引总线。

```
┌─────────────────────────────────────────────────────────────────────┐
│  UI 层   AgentChat · 各 curator 运行页 · JOT 万能记一笔 · 议事/法庭     │
│          RunTrace 实时编排树 · RunDrawer 跨运行抽屉(组件薄、lib 厚)    │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ FrostContext (now/city/userText/history)
┌───────────────────────────────▼─────────────────────────────────────┐
│  frost-agent 内核 harness  (harness/router.ts:runFrost)               │
│  ┌────────┬────────┬────────┬────────┬──────────┬──────────────────┐ │
│  │ SHELL  │ BRAIN  │ ROUTER │ MEMORY │ BOUNDARY │   SUB-AGENTS     │ │
│  │ persona│可插拔大脑│混合四级│会话+画像│validator │   注册/委派调度   │ │
│  └────────┴────────┴────────┴────────┴──────────┴──────────────────┘ │
│  横切: heartbeat 主动性 · skillForge 自进化 · health 降级可观测         │
└───────────────────────────────┬─────────────────────────────────────┘
            ┌───────────────────┼───────────────────────┐
            ▼                   ▼                       ▼
┌────────────────────┐ ┌──────────────────┐ ┌─────────────────────────┐
│ 领域子 agent (六大)  │ │ 横切能力           │ │ 技能 skill (薄能力)       │
│ music/books/movies  │ │ JOT 记一笔/议事庭审 │ │ markPlace/visionExtract  │
│ photos/travel/mood  │ │ AgentForge 造物主  │ │ enrichEntity/withRetry…  │
│ (六层流水线 sense→pin)│ │ FrostBus/SSE 流式  │ │ (skill 调 skill 无层级)   │
└─────────┬──────────┘ └────────┬─────────┘ └────────────┬────────────┘
          └────────────────────┼──────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  端云双脑 (EdgeModel 契约层)                                            │
│  端侧 Selector「挑和找」          │  云端 Brain「写」                   │
│  WebLLM Qwen3-0.6B (浏览器 WebGPU) │  qwen-plus  (/api/frost-llm 代理)  │
│  ↓三级降级 mnn→ollama→stub        │  /api/frost-llm-stream 真 SSE 逐token│
│  MNN: Qwen3-0.6B + Qwen2.5-VL-3B  │  密钥只在服务端、永不进前端 bundle    │
└───────────────────────────────┬─────────────────────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  地球 · 统一索引     userMarks (发布订阅 + localStorage 落点总线)        │
│  各 agent = 生产者写入  ·  地球图层 = 唯一消费者订阅渲染                  │
│  影→umv-/书→ubk-/行程→utr-/照片→photo- · kind 区分域 · 钉在原地不跟屏滚   │
└─────────────────────────────────────────────────────────────────────┘
```

读图要点：**纵向**是「一句话 → 路由 → 子 agent → 双脑 → 钉地球」的执行链；**横向**是骑在六个领域 curator 之上的通用能力（JOT/议事/FrostBus/AgentForge），它们不重复领域逻辑，只做编排、归一与可观测。

---

## 4. 五条核心理念

这五条理念贯穿每一个机制，既是设计取舍的依据，也是读代码时的解码钥匙。

### 4.1 端云双脑 · model 是成本与隐私的杠杆

把推理沿**职责轴**切开：端侧小模型管「挑和找」（rank/classify/embed/vision），云端大模型管「写」（生成/补全/研究）。**只有真正需要「写」的才上云。** 这一刀既省云端 token 成本，又让照片原图、OCR 原文这类敏感数据不出端。model 不再只是「更聪明」的选项，而是一根**成本与隐私的杠杆**——`frost-agent/edge/types.ts` 的 `EdgeModel` 契约把它固化成六能力。

### 4.2 CEO 委派与舱壁隔离

FROST 是 **CEO**，领域子 agent 是**专项员工**（借鉴黄佳《Harness 工程之道》的 SubAgent 委派模型）。CEO 只做意图识别、路由、结论汇总；脏活派给员工，员工在**独立上下文**里跑完整理→定位→产出，**只回传结论描述子**，不把中间噪声（几千张相册、整张影单）灌回主上下文。每个子 agent **单一职责、最小权限、嵌套 ≤ 2 层**。上下文隔离换来的是信噪比——这就是「舱壁」。

### 4.3 缺任一能力都能继续运行

降级不是异常处理的边角料，而是**正常路径**。整套系统层层兜底：四级路由（指令秒回→端侧→云脑→规则）、`stubBrain` 默认返空串触发各 agent 自带规则 fallback、`edgeSafe.withFallback` 异常返安全默认值、服务端 `pickBackend` 三级降级 `mnn→ollama→stub`。任何一环挂掉（无 WebGPU / 无模型 / 无 key / 上游抖动），系统都**不白屏**，只是体验降级。`health.recordHealth` 让每一步降级都可观测。

### 4.4 报文传输，而非共享内存

子 agent 之间、子 agent 与主 agent 之间，**靠窄契约传结构化报文**，不共享可变状态。`AgentResult`（reply/data/radioActions/trace）是统一返回报文，法庭每个阶段只向下游传「结构化小结论」（Handoff Contract）。这让 agent 可并行、可组合、可独立测试——彼此无共享内存，就没有难以追踪的耦合。

### 4.5 数据与实现解耦

领域数据（曲库、城市库、影库）与领域实现（管线、技能）分离。`harness/domain.ts` 把资源库缺失时优雅地降为空数组，agent 自动走规则 fallback；统一落点 `userMarks` 让「谁产生数据」与「谁渲染数据」彻底解耦（生产者-消费者发布订阅）；`enrichEntity` 的字段 schema 留在调用方而非塞进通用抽象。**地球本身，就是把这套编排显形的载体。**

---

## 5. 内核 harness 六部件

frost-agent 的内核不是一个聊天循环，而是一座由**六类可替换部件**组成、彼此用窄契约耦合的 harness。它们都活在 `frost-agent/harness/` 下。

### 5.1 SHELL · 人格层（统一人声）

**关键文件**：`harness/persona.ts`

`FROST_PERSONA` 定义对外身份，`HUMAN_VOICE` 是全项目人声守则——**说人话，不堆破折号、不星号加粗、不「不是 X 而是 Y」对仗、不三件套排比、不客套**。`cleanVoice` 在出口层做程序化兜底清洗。**所有 agent 借同一副声音说话**：对用户永远是一个 Frost，子 agent 从不暴露自己。人声守则是「提示层 + 出口层」双重保险。

### 5.2 BRAIN · 可插拔大脑（无 LLM 也能跑）

**关键文件**：`harness/brain.ts` · `harness/httpBrain.ts` · `harness/types.ts`

`FrostBrain` 是可插拔接口（`complete(prompt, {json, search})`）。默认是 `stubBrain` **返回空串**——这是刻意设计：让「大脑不可用」成为**正常路径**，每个子 agent 据空串自动走规则 fallback。`main.tsx` 启动时 `setFrostBrain(httpBrain)` 注入真实现，`httpBrain` 经 `POST /api/frost-llm` 服务端代理通义 **qwen-plus**——**前端永不持密钥**，`r.ok` 失败即返空串触发降级。子 agent 代码一行不改，大脑就能在 stub / 真实现间切换。

### 5.3 ROUTER · 混合路由（指令秒回 + 注册表化）

**关键文件**：`harness/router.ts`（`runFrost`）· `harness/llmRoute.ts` · `harness/intentRegistry.ts`

`runFrost` 是整个系统的总控入口，实现混合路由四级（详见 §6）。判出 intent 后经 `intentRegistry` **查表 dispatch**——`registerIntent` / `getIntentHandler` 把原本的 `switch(intent)` 收口成注册表。**新增意图 = 注册一行，内核 dispatch 不改**（声明式注册化）。末尾把 `routeTrace` 与子 agent 的 trace 拼成可见的思考痕迹。

### 5.4 MEMORY · 双层记忆（会话 + 长期画像）

**关键文件**：`harness/memory.ts` · `harness/profile.ts`

两条**物理隔离**的记忆轴：`memory.ts` 的 `formatHistory` 只管会话内**最近 6 轮**喂大脑（防上一句说下一句忘）；`profile.ts` 管**跨会话脱敏画像**——只存偏好标签计数（导演/作者/艺人/流派/城市……），**绝不存原文**，每字段按热度排序截 50。`profileFingerprint`（fnv 指纹）缓存让口味没实质变化时跳过云脑润色（成本护盾）。隐私铁律：**画像只在云脑侧读，端侧 Selector 永不接触**（详见 §9）。

### 5.5 BOUNDARY · 动作校验（suggest-then-validate）

**关键文件**：`harness/validator.ts`

子 agent 产出的 `radioActions` **只是建议**，必须过这道 Boundary 才能落地。`registerActionValidator` 按动作类型注册校验器，`validateActions` 逐个查表，**未注册一律拒**（最小权限）。这把「能产生动作」与「能执行动作」**分权**——`switch_city` 要核对 `RADIO_CITIES`、`set_playlist` 要非空——防子 agent 越界改用户数据。

### 5.6 SUB-AGENTS · 子 agent 注册与委派

**关键文件**：`frost-agent/AGENT-PROTOCOL.md`

这是 CEO 委派模型的代码级落地。它声明四条确定性调用通道：**A** 显式委派（`RUN_BY_NAME` / `HERO_BY_NAME`）、**B** 意图委派（`intentRegistry` + `routeRegex`）、**C** 心跳建议、**D** 造物主白名单（`ALLOWED_TARGETS` 必须 = `RUN_BY_NAME` 键集，否则死链）。文档第 2.2 节就是「新增子 agent 多处登记对齐清单」（详见 §16）。

### 横切三层（贯穿六部件）

- **`harness/heartbeat.ts` · 主动性**：定时 tick 读画像 top 标签生成「今日推荐」候选，`cursor` 轮换 + `dismissed` 去重，纯前端 localStorage pub/sub。恪守 **suggest-then-confirm**——只建议，一键采纳才落地。
- **`harness/skillForge.ts` · 自进化**：一句话→云脑拟声明式技能清单→`reviewSkill` 安全闸白名单校验（target ∈ `ALLOWED_TARGETS`、字段白名单、正则扫疑似代码/外链一律拒）→`installSkill`。技能只是「触发词→已有 agent」的声明式快捷方式，**不含、不执行任何代码**。
- **`harness/health.ts` · 降级可观测**：`recordHealth(step, ok, error)` 让「端侧失败→云脑→规则兜底」每步成败可记，纯内存即时态。

---

## 6. 混合路由四级

路由是 frost-agent **最体现「确定性代码路由 vs md 语义委派」取舍**的部分。它不靠模型读 description 决定调谁，而是用四级确定性路由，层层兜底（全在 `harness/router.ts:runFrost`）。

```
用户输入 (FrostContext: now/citySlug/userText/history)
   │
   ├─① 明确指令正则秒回 ── runSwitchHandler(换歌/暂停/切城)
   │    命中 = intent:switch,不动用任何模型(省 token + 延迟)
   │    trace:「指令手 · 未动用大脑」
   │
   ├─② 端侧意图预分类 ──── edgeSafe.classify(WebLLM/端侧 Qwen)
   │    架构就绪,当前 ALL_CLOUD=true 临时关闭(准确度优先)
   │    (留一行 false 即恢复真实端侧预分类痕迹)
   │
   ├─③ 云脑判意图 + 抽实体 ── llmRoute (qwen-plus)
   │    prompt 让 Qwen 判 {intent, city, reason}
   │    确定性护栏 matchCity:判了 switch 必须城市真出现在原话里
   │    否则降级 open_dj(治「放日本的音乐」被脑补成切到东京)
   │
   └─④ 规则兜底 ────────── routeRegex
        云脑不可用(stub/无 key/出错返空串)落到这里
   │
   ▼
intentRegistry.getIntentHandler(intent) 查表 dispatch
   → switchToCity / runTourDirector / runOpenDjDirector
     runDeepAnswer / runChitchat / runGeneral
   ▼
validateActions(radioActions) 逐个过 Boundary → 只留 valid
   ▼
返回 {reply, data, radioActions: valid, trace, intent}
```

**关键文件**：

- `harness/router.ts` —— `runFrost` 四级主控，末尾 `validateActions` 只放行合法动作。
- `harness/llmRoute.ts` —— 云脑泛化路由层，核心是 `matchCity` 确定性护栏（判了 switch 的城市必须真出现在原话，否则降级 `open_dj`，治国家/地域被脑补成城市）。
- `harness/intentRegistry.ts` —— 意图→处理器注册表，把 `switch(intent)` 收口成查表。

设计取舍：四级路由换来**可控、可离线/端侧跑、省 token**，代价是新增子 agent 要在 `RUN_BY_NAME` / `intentRegistry` / `ALLOWED_TARGETS` 多处手动对齐——`AGENT-PROTOCOL.md` 第 2.2 节就是这份对齐清单。`ALL_CLOUD=true` 是当前为准确度做的临时取舍（全走云脑 qwen-plus），但路由刻意保留「端侧预分类」的展示 trace 供 demo 叙事，留一行 `false` 即恢复真实端侧痕迹。

---

## 7. 端云双脑

端云双脑是整套 harness 运行其上的**双速推理底座**。它把后端全部抽象在一条 `EdgeModel` 契约之后，使端侧后端可插拔、调用点透明。

### 7.1 端侧 Selector 六能力 + 一条契约

**关键文件**：`frost-agent/edge/types.ts` · `frost-agent/edge/contract.ts`

`EdgeModel` 接口固化为**六能力**：`available` / `chat` / `classify` / `rank` / `embed` / `vision`。其中 **Selector** 是「挑和找」三件套子集——`classify`（意图预分类）、`rank`（选歌/选图/选书）、`embed`（个人记忆检索）。`vision` 做照片打标且**原图不出端**。

所有调用点只认 `contract.ts` 导出的 `edgeSafe`：`withFallback` 把每个能力包成「异常即返回安全默认值（`available→false`、`chat→''`、`rank→[]`……）并 `recordHealth`」——因此 **agent / router 从不写 try-catch**。`routed` 在其下做端侧双后端路由：文本三件套优先**浏览器内 WebLLM**，未加载则回退服务端 `/api/edge`；`embed` / `vision` 始终走 `httpEdge`。

### 7.2 两条端侧路线并存

| 路线 | 文件 | 形态 | 用途 |
| --- | --- | --- | --- |
| **B 路线** | `frost-agent/edge/webllmEdge.ts` | `@mlc-ai/web-llm` 动态 import，把 **Qwen3-0.6B**（`Qwen3-0.6B-q4f16_1-MLC`，q4f16，~400MB）整跑在浏览器 **WebGPU** 里，不出端 | 纯 PWA 端侧大脑，iOS/Chrome 通吃，点「启用」才动态下载、不进主 bundle。满足「核心交互本地运行」硬指标 |
| **A 路线** | `frost-agent/edge/httpEdge.ts` | `POST /api/edge`，按 task 分档超时（vision 35s / chat 20s / 其余 15s）+ `AbortController` | 本机 demo / 手机生产 / 无 WebGPU 环境兜底 |

B 路线关掉 `enable_thinking` 防 `<think>` 污染 `JSON.parse`；embed/vision 这类小模型不做的能力返空让路由回退。

### 7.3 三级降级 mnn → ollama → stub

**关键文件**：`frost-agent/edge/viteEdge.ts`（dev）· `server.mjs`（prod）

服务端 `pickBackend` 按 `EDGE_BACKEND`（`auto|mnn|ollama|stub`）和可达性在三档间选：`auto` 优先 MNN 可达否则 ollama 否则 stub。ollama 后端默认跑 **qwen3:0.6b**（文本）+ **qwen2.5vl:3b**（视觉）。**stub 是规则兜底**（rank 给线性递减分、classify 取首标签），让无模型时 UI 与 agent 照常工作。`classify/rank/vision` 的 prompt 整形对所有后端共用，只换「发给谁」。

### 7.4 MNN 部署链路

**关键文件**：`deploy/edge-runtime/server.py` · `deploy/edge-runtime/build-mnn.sh`

MNN sidecar 是 OpenAI 兼容最小面（`/health` `/v1/chat` `/v1/embeddings`），用 `pymnn` 跑 **MNN 格式的 Qwen3-0.6B（文本）+ Qwen2.5-VL-3B（视觉）**，借 **Arm SME2 加速**。视觉每次全新实例 + 发图前缩到 448px + `_strip_fence` 去 think / EOS / 失控尾巴 / 代码围栏。部署链路：`build-mnn.sh`（编译 MNN，开 LLM/多模态/转换器/低内存）→ `convert-quantize.sh`（原始 Qwen → MNN 4bit 量化）→ `fetch-models.sh`（拉官方已转好的包 + 关思考模式）→ `serve.sh` / `push-to-device.sh`。

### 7.5 云脑侧：写、密钥安全、retry⊥fallback

**关键文件**：`server.mjs` · `harness/httpBrain.ts`

`/api/frost-llm` 把密钥只留在服务端、**永不进前端 bundle**，json 模式时 `temperature=0` + `response_format`。关键设计：**刻意透传上游 qwen-plus 的 429/5xx 状态码**，使客户端 `enrichJSON` 的 `withRetry`（借鉴 langchain `RunnableRetry`，只对瞬时故障指数退避 + jitter、4xx 不重试）能据 `r.ok` 真正重试，而非恒 200 + 空串白丢。`/api/frost-llm-stream` 提供真 SSE 逐 token 流式（详见 §14）。

### 7.6 后端 quirk 集中收口 + 契约层零改

后端怪癖被收进 `frost-agent/provider-compat/mnn.ts`（强制纯 JSON、禁 Markdown 围栏，规避预编译 libMNN 遇 ``` 假结束符截断）、`provider-compat/qwen.ts`（ollama 关 `enable_thinking` 提速 + json format）与 `server.py` 的 `_strip_fence`，而非散落各 agent。

**核心解耦收益**：`EdgeModel` 契约层让「切 MNN 时前端零改」——把后端从 ollama 换成 MNN sidecar 只动 `viteEdge` / `server.mjs` 的 backend 分支和 `provider-compat` 适配器，`httpEdge` / `edgeSafe` / 所有 agent 调用点**一行不动**。`retry`（同目标退避治瞬时故障）与 `fallback`（换目标治持续故障）是**两条正交容错轴**——这正是从 langchain 借来的最高性价比一点。

---

## 8. 子 agent 解耦范式

每个领域（书/影/音/照片/行程/心情）都是一个**契约化、可独立调用**的子 agent，走同一条**六层流水线**，最终统一写进 `userMarks` 落点总线钉回地球。

### 8.1 六层流水线（以 `lib/movie/agent.ts:runMovieAgent` 为范本）

```
① sense    感知:text/image/manual 三种输入归一成候选片名 + 评分
② catalog  本地确定锚点:matchInCatalog 拿导演/年份/豆瓣分
③ store    本地索引复用:getKnownMovie 命中即省云脑、保一致
④ enrich   云脑(qwen-plus)补标签:仅「标签不全且没补过」才调
           (便宜的端侧先行、贵的云脑兜底)
⑤ geo      地理定位:geoResolve 取景地 > 故事地 > 国家三级回退
⑥ critic   校验与历史纠错:applyCritic + applyUserFix
           → 产出一张 draft(needsConfirm,suggest 未钉)
```

**每层失败降级不抛错**（舱壁）：云脑不可用→保留已有标签；端侧未就绪→`reason='noEdge'` 引导手动；无坐标→`needPlace` 不钉。各域目录文件名几乎镜像（`sense`/`catalog`/`tagging`/`critic`/`store`/`pin`），只是领域配置不同：`book` 多 `notes.ts`（读书笔记结构化子 agent），`travel` 用 `plan.ts`（三级排序）+ `mcp.ts`（OSM/Open-Meteo 只读）+ `stats.ts`，`photo` 因强端侧强隐私换成 `features`/`vision`/`screen`/`geoPin`。

### 8.2 suggest-then-confirm 行动层（绝不自动钉）

**关键文件**：`lib/movie/pin.ts`

`draft` 只是建议，`confirmPin` 才落地（= 黄佳书的 confirm gate / Boundary 校验）。这是「上下文隔离」在**写入侧**的体现：子 agent 把噪声（影单全貌、相册几千张中间态）留在自己上下文，只把「建议描述子」交回主 agent。换来可预期、可撤销（`unpin`），代价是每个域都写一遍 `draft→confirm` 两段。

### 8.3 关注点分离的统一落点

所有 `pin.ts` 都 `import { markPlace } from lib/skills/markPlace`。**skill 只管「落点 How」**（校验坐标→`isPinned` 去重→`spreadCoord` 抖散→`addUserMark`）；领域专属的「拼 meta / `recordSignals` 喂长期画像 / `putXxx` 落本地索引」（Who/What/Where）留在各 `agent.pin.ts`。**依赖方向锁死**：`markPlace` 放 `src/app/lib/skills/`（app 层，依赖 `userMarks`），内核 `frost-agent/skills/` 不可反向依赖 app——靠目录分层硬约束。

### 8.4 五种子 agent 形态

| 形态 | 代表 | 特征 |
| --- | --- | --- |
| **执行型** | photos-agent | 海量输入（几千张）→极少落点（几个高价值 pin），隔离上下文里扫描→打标→打分→钉，噪声不回流 |
| **流水线型 + 交接契约** | books-agent | locate→enrich→resolve→mark，前一阶段输出是后一阶段唯一合法输入；movies-agent 视是否补全在执行型/流水线型间退化 |
| **并行型（MapReduce）** | 批量整理 | 主 agent 把不同对象并行派给各 agent（彼此无共享状态），最后 Reduce 成挂回地球的视图 |
| **只读型** | deep-answer / tour-director / switch-handler | RAG 问答或纯规则/时间逻辑（`llm:false`），不产 `mark_place`，只产 `radioActions` 建议、不直接控播 |
| **团队型** | council-room / radio-24h-director / `capture/route.ts` | 多 agent 同台、调多 skill 编排、万能记一笔复用现成管线 |

### 8.5 契约化：代码即路由

每个 agent 在 `frost-agent/agents/<name>/contract.md` 用黄佳书 description 三段式（**What 功能 + Use when + Not for 防误触发**）声明 `name`/`tools`/`model`（edge|hybrid|cloud）/`type`/`permissionMode`。但本 app 是**「代码即路由」非「md 即调用」**——FROST 不读 md 决定调谁，而靠 `AGENT-PROTOCOL.md` 四条确定性通道登记一致。`lib/*/index.ts` 是各 agent 的公共出口契约（导出 `runXxxAgent`/`confirmPin`/类型 + 给 UI 的 `GEO_LABEL`/`GEO_COLOR`）：**组件薄、lib 厚**，UI 只调 `runPlan`/`runMovieAgent`，业务全在 lib。

**关键文件**：`lib/movie/agent.ts`（流水线范本）· `lib/skills/markPlace.ts`（统一落点）· `lib/movie/pin.ts`（回流范本）· `src/app/data/userMarks.ts`（落点总线）· `lib/capture/route.ts`（团队型范本）· `lib/photo/geoPin.ts`（强隐私落点变体，只存 160px 缩略 dataURL、原图不出端）。

---

## 9. 长期记忆双层与闭环

记忆是「越用越懂你」的底座，由**两条平行轴**构成，并形成一个完整闭环。

### 9.1 双层物理隔离

- **短时层** `harness/memory.ts`：只管会话内最近 6 轮（`formatHistory`），给大脑当上下文。
- **长期层** `harness/profile.ts`：跨会话沉淀的口味——结构化脱敏画像，只存偏好标签计数（`domains[domain][field] = TagCount[]`，如 `movies.directors` / `books.authors`），**绝不存原文/隐私**，每字段按热度排序截 50。**隐私铁律**：profile 只在云脑侧读，端侧 Selector（`/api/edge`）一律不接触，画像不出端到端侧模型。

### 9.2 三段闭环：回流 → 装配 → 记忆即空气

**① 回流（写）** —— `lib/movie/pin.ts`
各 agent 的 `confirmPin` 落点成功后调 `recordSignals`，把公开创作标签（国别/导演/作者/流派/城市/季节）喂回画像。movie/book 还**按真实星级加权**（5★×3、4★×2、其余×1，用 `Array(w).fill` 复制标签），**首次钉才回流**（`reason!=='exists'`）；travel/photo 用「只回流本次新钉城市」保证重确认幂等；photo 的 city 来自坐标反查、只回流非空。**故意不回流 cast 演员表**，避免画像退化成社交图谱。播种：启动时 `profileSeed.seedProfileFromLibrary()` 把现有书影音照库存一次性聚合喂 `recordSignals`（`SEED_VERSION` 幂等）。

**② 装配（读）** —— `lib/memoryRouter.ts`
`assembleMemory()` 是**唯一读出口**，四层拼装注入云脑 system：

```
L1  getCachedTasteLine   一句话口味气质(ensureNarrative 后台保鲜,fingerprint 缓存)
L2  getTasteSummary      按评分偏爱地区(taste.ts 从 bookRecords 现算)
L3  getMoodTrace         情绪足迹(mood/retrospect.ts,独立通道)
L4  getProfileSummary    标签画像(profile.ts)
```

`memoryRouter` 放 **app 层**而非内核——因为它要同时聚合内核 `profile` 与应用层 `taste`，放内核会造成「内核反向依赖应用」破坏分层。

**③ 记忆即空气（用）**
`assembleMemory` 给记忆块冠以 `MEMORY_AIR_RULES`（抄自 OpenHanako）：**自然融进回答、不复述、不说「我记得 / 你之前说过」、冲突以当前对话为准、绝不用旧记忆纠正用户**。记忆像空气一样在场而不出戏。`AgentChat.tsx` 每次对话（普通对话 + 推荐没看过两条路径）都 `assembleMemory()` 注入。

### 9.3 两个视图并存 + 反思记忆

- **L2 `taste.ts` 补盲点**：profile 按数量统计会让读得多的（中/美/日）盖过打分极高但量少的（拉美魔幻现实主义）。`taste.ts` 另算「按地区平均评分的最偏爱」，让读得少但极爱的浮上来——两个视图**并存**而非二选一。
- **L3 `mood/retrospect.ts` 独立通道**：心情是情绪足迹不是口味标签，**有意不走 `recordSignals`/`ProfileDomain`**——混进画像会污染；且排除「此处/随机落点」脏地名不造假地点。
- **反思记忆**：法庭干净裁决 `saveCase`→判例库→下次 `findSimilarCases` 类案参照；照片临界态软偏置（`lessons`/`distillLessons`/`applySoftBias` 有界软偏置）。
- **推荐去重**：已看全集当排除集 + 口味源，`checkSeen` 确定性兜底标已看（带年份），prompt 避开经典——治「推荐总推已看」。

**关键文件**：`lib/memoryRouter.ts`（读装配）· `harness/profile.ts`（写+存+摘要）· `lib/taste.ts`（L2）· `lib/mood/retrospect.ts`（L3）· `lib/profileSeed.ts`（播种）· `lib/movie/pin.ts`（回流写口）· `harness/memory.ts`（会话短时）· `components/AgentChat.tsx`（消费端）。

---

## 10. 统一万能记一笔 JOT

JOT 解决一个真实的 UX 陷阱：**用户不该先猜「该进哪个 agent」**。一个框记一切。

**关键文件**：`lib/capture/route.ts`

```
用户一句话(+可选截图)
   │
   ├─ classify()  云脑(qwen-plus)判四域 movie/book/travel/mood
   │              travel 时只抽规范地名(避免整句噪声把地理编码带偏)
   │
   ├─ 三层确定性护栏(对抗云脑误判)
   │    · 明说领域词组(「这部电影」)
   │    · 出行动词 + matchCity 命中 → 强制 travel(治「去了京都」被误判心情)
   │    · 「想去 + 某地」 → 强制 mood
   │    · 判域失败一律回落 mood(最稳兜底)
   │
   └─ runCapture()  零重造:复用各域现成管线
        runMovieAgent / runBookAgent / resolvePlace+pinManualStop / analyzeMood
        → 异构结果归一成统一 CaptureResult
        → suggest-then-confirm(先给判断卡,confirm() 才真钉)
```

JOT 的纪律是**零重造**：不重写任何抽取逻辑，只调各域现成管线归一成 `CaptureResult`。`classifyDomain` 让云脑从整句**抽规范地名**再喂地理编码，避免噪声词把「圣地亚哥」从智利首都拽到哥伦比亚同名小镇（钉错洲）。它是「团队型」子 agent 的范本，也是 CEO 总入口——免去用户先猜进哪个下属。

---

## 11. 技能系统

通用能力沉淀成 **skill**，**agent 退化成领域薄配置**（对应黄佳 §3：关注点分离 / 依赖倒置 / 单一职责 / 可组合）。

### 11.1 两个家目录 + 开发期 SKILL.md

- **运行时 skill（app 层）** `src/app/lib/skills/`：依赖 `userMarks`/`geoStickers`/画像等 app 数据。
- **运行时 skill（内核层）** `frost-agent/skills/`：只依赖 harness，如 `curatePlaylist`（从全量曲库调度歌单）。
- **开发期 skill** `.claude/skills/*/SKILL.md`：Claude Code 开发 SOP（deploy/verify/add-curator/extract），**不跑在 app 里**。

三者家目录**严格分界**，强制依赖方向单向（app→core），内核不反向依赖 app。`src/app/lib/skills/README.md` 自称「**路由器不是仓库**」（黄佳 §3.5）：只列索引（每个 skill 是什么 / 谁在用 / 依赖谁）不藏实现。

### 11.2 skill 调 skill、无层级

运行时 skill 按职能分组：输入→结构化（`visionRead`/`textExtract`/`visionExtract`/`parseInput`）、落点（`resolvePlace`/`markPlace`）、云脑&本地库（`enrichEntity`/`matchCatalog`）、端侧记忆&反思（`keyedStore`/`draftCritic`），外加 langchain 借鉴的两条 plumbing（`withRetry`/`structured`）。**核心是 skill 调 skill、无层级**：`visionExtract = visionRead + textExtract`，`textExtract` 内部调 `enrichEntity`，`draftCritic` 读 `keyedStore` 的 Corrections。**领域差异一律做成参数**（schema/噪声词/keyPath/geo.kind）不写死分支。

结果是 agent 退化成「领域薄配置」：`movie/store.ts` 只剩声明实体类型 + 绑库名几行，critic 只补一两条领域护栏。但 `enrichEntity` **故意不做通用 schema**——电影 vs 书字段不同，强塞一个通用 schema 是**泄漏抽象**，故字段 schema 留调用方（最小接口而非过度抽象）。

**关键文件**：`lib/skills/README.md` · `lib/skills/markPlace.ts` · `lib/skills/visionExtract.ts` · `lib/skills/keyedStore.ts` · `lib/skills/draftCritic.ts` · `lib/skills/enrichEntity.ts` · `lib/skills/withRetry.ts` · `frost-agent/skills/curatePlaylist.ts`。

---

## 12. 端侧识图与隐私

照片与截图是最敏感的数据，frost-agent 用一条铁律守住它：**原图只进端侧，绝不出端。**

**关键文件**：`lib/skills/visionRead.ts` · `lib/skills/visionExtract.ts` · `lib/photo/geoPin.ts`

- **唯一隐私收口** `visionRead.ts`：`edgeSafe.vision`（端侧 Qwen-VL 读字）+ 确定性脱敏正则（证件/卡号/手机）+ `Promise.race` 超时兜底（防 VL 挂起无限转圈）。**原图不出端，只有分数/标签/坐标进库。**
- **schema 当参数**：`visionExtract = visionRead(图→脱敏文本)+ textExtract(文本→字段)`，`FieldSpec` 适配任意领域——各 agent 报字段端侧照填，缺了留空**绝不编造**。
- **端侧整理相册**（photos-agent）：浏览器内 **CLIP 批量精筛** + Qwen-VL（`edgeSafe`）单图打分，原图不出端只分数/标签/坐标进库；缩图 + 全新实例 + 稳健解析把单图 120s 降到 1~2s。
- **强隐私落点** `geoPin.ts`：照片不另起图层、写进 `userMarks`（`kind:photo`），只存 160px 缩略 dataURL，`coarsenForShare` 分享时抽稀坐标。

book/notes 这类则先 `redact` 脱敏才上云——**端侧挑和找在前，云脑写在后，敏感数据被这道分工挡在端内**。

---

## 13. 圆桌议事与流水线庭审

议事/法庭是 frost-agent **编排能力的最强展示**：七个独立人设 agent + FROST 庭长，四模式同台。

**关键文件**：`council/engine.ts` · `council/courtroom/stages.ts` · `council/courtroom/courtVerify.ts`

### 13.1 四模式与法庭流水线

`council/engine.ts` 是四模式（roundtable/debate/courtroom/brainstorm）纯逻辑回合循环：`buildOrder` 排发言序（法庭 = 正反交替 + 庭长收尾，支持手动分边，两侧非空才采信否则位置二分），`callLLM` 端侧优先空则回落云端，`AbortSignal` 收敛。

`council/courtroom/stages.ts` 把群聊回合**升级成有阶段依赖的串行庭审流水线**：

```
立案争点 → 举证质证 → 法庭辩论 → 合议裁决(无条件云端 JSON) → 复核(Critic + 验证器)
```

每阶段只向下游传**结构化小结论**（Handoff Contract）；正反各至少一人否则如实提前结束；`findSimilarCases` 合议前召回类案要旨注入；`saveCase` 仅置信 ≥ 0.6 + 有要旨 + 无 critical 才入判例库——**只让干净裁决回流，形成反思记忆闭环**。合议无条件走云端 JSON，因端侧小模型 JSON 不稳。

### 13.2 确定性验证器：生成概率性、验证确定性

`council/courtroom/courtVerify.ts` 是输出侧的「下层面包」——**LLM 裁决可以抖，但能否入判例库、是否标红由零网络的确定性规则裁定**。它**自建私有 Validator 注册表**（零 import frost 全局 validator，防污染 `RADIO` 封闭枚举——舱壁 + 解耦），三条规则带 **severity 分级**：

- **证据可追溯不上**（3 字片段零重叠判杜撰）= **critical** → 不入库 + UI 标红
- 缺证据 / 缺推理链 / 置信越界 = **warning** → 降置信不阻断

「云脑判断 + 确定性护栏」的双层结构在这里再次出现：强模型做语义裁决，确定性逻辑兜底边界。

---

## 14. 可观测编排

「难点不在让模型更聪明，而在编排」——这句话在 frost-agent 里有**亲眼可见的活证据**。

### 14.1 FrostBus 事件树（借 langchain，剥到 ~40 行）

**关键文件**：`lib/observe/bus.ts`

`FrostBus` 借鉴 langchain callbacks/tracers，但只取三个抽象剥到约 40 行：带 `runId`/`parentId` 的统一事件词汇（把一次 `router→agent→skill→enrich` 串成调用树）、被动订阅、**handler 抛错绝不打断主流程**（舱壁）。`ring buffer` 让晚挂载的订阅者补 seed。`startAgentRun(label)` 返回 `{runId, phase, end}`，是各运行页接入 trace 的统一样板——运行页把 `phase` 当 `onPhase` 回调透传给底层管线。

### 14.2 一套事件、两个消费者

**关键文件**：`components/RunTrace.tsx` · `components/RunDrawer.tsx`

- `RunTrace` 管**单次**（内联运行页）：订阅 FrostBus 按 `runId` 收根（agent）+ 子（skill 阶段）事件，渲成带耗时/状态/**云·端侧·本地色徽章**的实时编排树，`deriveBadge` 从 note 派生「数据在哪算」。
- `RunDrawer` 管**跨运行**（浮窗）。
- 两者**共用同一 FrostBus**——一套事件、多个消费者。

### 14.3 真 SSE 逐 token 流式（additive 演进）

**关键文件**：`lib/streamComplete.ts` · `server.mjs` · `components/AgentChat.tsx`

新增 `/api/frost-llm-stream` 路由**不动原非流式**：服务端把上游通义 Qwen（DashScope OpenAI 兼容）的 `stream:true` SSE 逐 token 透传 `data:{token}`，客户端 `onToken` 回调累计文本。**关键取舍**：per-token **刻意不发 FrostBus**（每 token 一条会灌爆 1000 容量 ring buffer）——**流式与可观测是两条正交通道**。`AgentChat` 先推空气泡再 `onToken` 逐字填，`catch`→回落 `/api/frost-llm` 非流式→再失败给兜底文案（三级降级）。

### 14.4 人声守则（再次）

可观测之外，所有出口都过 `HUMAN_VOICE` + `cleanVoice`：**不堆破折号 / 不星号加粗 / 不「不是 X 而是 Y」/ 不三件套排比 / 不客套**——提示层 + 出口层程序化清洗，让用户看到的永远是「人话」。

---

## 15. 目录导览

读者按图索骥的两张地图：**内核**在 `frost-agent/`，**应用层**在 `src/app/`。

```
frost-agent/                         ← 内核(可移植,不依赖具体 app 数据)
├─ harness/                          六部件外壳
│  ├─ router.ts          ★ runFrost 混合路由四级总控
│  ├─ llmRoute.ts          云脑判意图 + matchCity 护栏
│  ├─ intentRegistry.ts    意图→处理器注册表
│  ├─ validator.ts         Boundary 动作校验(最小权限)
│  ├─ brain.ts / httpBrain.ts  可插拔大脑 + 云脑客户端(qwen-plus)
│  ├─ profile.ts / memory.ts   长期画像 + 会话短时
│  ├─ persona.ts           SHELL 人格 + HUMAN_VOICE 人声守则
│  ├─ heartbeat.ts / skillForge.ts / health.ts  主动性/自进化/降级追踪
│  ├─ domain.ts            领域数据入口(缺失降空数组)
│  └─ types.ts           ★ FrostContext/AgentResult/FrostBrain 契约
├─ edge/                             端侧双脑
│  ├─ types.ts           ★ EdgeModel 六能力契约
│  ├─ contract.ts        ★ edgeSafe(withFallback + routed)
│  ├─ webllmEdge.ts        B 路线 WebLLM Qwen3-0.6B
│  ├─ httpEdge.ts          A 路线 /api/edge 客户端
│  └─ viteEdge.ts          dev 中间件 pickBackend
├─ provider-compat/        mnn.ts / qwen.ts 后端 quirk 收口
├─ skills/                 内核层 skill(curatePlaylist)
├─ agents/<name>/contract.md  子 agent 契约(description 三段式)
├─ AGENT-PROTOCOL.md     ★ 主-子 agent 四条调用通道 + 对齐清单
└─ ARCHITECTURE.md         §6.1 五形态 / §6.2 mark_place 总纲

src/app/                             ← 应用层(依赖 userMarks/UI)
├─ lib/
│  ├─ movie/ book/ travel/ photo/  各域六层流水线(agent/sense/catalog/
│  │   ...                         tagging/critic/store/pin/index)
│  ├─ mood/retrospect.ts   心情回望(L3 情绪足迹)
│  ├─ capture/route.ts   ★ JOT 万能记一笔团队型路由
│  ├─ memoryRouter.ts    ★ 长期记忆读装配统一出口
│  ├─ taste.ts / profileSeed.ts  L2 偏爱地区 / 画像播种
│  ├─ skills/             ★ app 层运行时 skill(markPlace/visionExtract…)
│  ├─ observe/bus.ts     ★ FrostBus 事件总线
│  ├─ agent/             造物主 forge/manifest/engine
│  └─ streamComplete.ts    真 SSE 流式客户端
├─ council/                议事/法庭引擎(engine + courtroom/)
├─ data/userMarks.ts     ★ 统一落点总线(发布订阅 + localStorage)
└─ components/            AgentChat / RunTrace / RunDrawer(组件薄)

deploy/edge-runtime/                 ← MNN 端侧部署链路
├─ server.py               MNN sidecar(Qwen3-0.6B + Qwen2.5-VL-3B)
└─ build-mnn.sh / convert-quantize.sh / fetch-models.sh

server.mjs                           ← 生产单文件零依赖服务
                                       /api/frost-llm(qwen-plus 代理)
                                       /api/frost-llm-stream(真 SSE)
                                       /api/edge(三级降级 mnn→ollama→stub,
                                                  ollama=qwen3:0.6b + qwen2.5vl:3b)
```

带 ★ 的是「先读这些就能抓住骨架」的入口文件。

---

## 16. 如何新增一个子 agent

frost-agent 是「代码即路由」，所以新增 agent 不是写一份 md 让模型自己发现，而是照 `AGENT-PROTOCOL.md` 在**几条确定性通道登记一致**——核心是一处声明、多处对齐。

**第一步：声明契约**
在 `frost-agent/agents/<name>/contract.md` 用 description 三段式写清：

- `name` / `description`（**What 功能 + Use when 何时用 + Not for 防误触发**）
- `tools`（只列必需，最小权限）· `model`（`edge` 端侧 / `hybrid` 端云混合 / `cloud` 云端）
- `type`（执行型/流水线/并行/只读/团队）· `permissionMode`

**第二步：实现六层流水线**
在 `src/app/lib/<name>/` 镜像 `agent.ts`/`sense`/`catalog`/`tagging`/`critic`/`store`/`pin`，每层尽量调现成 skill（`markPlace`/`enrichEntity`/`visionExtract`/`draftCritic`…），curator 只写**领域配置**。`index.ts` 导出 `runXxxAgent`/`confirmPin`/`GEO_LABEL`/`GEO_COLOR`。落点统一调 `markPlace`，回流统一调 `recordSignals`。

**第三步：登记四条通道（防死链）**
照 `AGENT-PROTOCOL.md` 第 2.2 节对齐清单：

| 通道 | 登记点 | 作用 |
| --- | --- | --- |
| **A 显式委派** | `RUN_BY_NAME` / `HERO_BY_NAME` | FROST 显式按名调用 |
| **B 意图委派** | `intentRegistry`（`registerIntent` 一行）+ `routeRegex` | 自然语言路由命中 |
| **C 心跳建议** | `heartbeat` 候选 | 主动性「今日推荐」 |
| **D 造物主白名单** | `ALLOWED_TARGETS`（必须 = `RUN_BY_NAME` 键集） | 防 manifest 死链 |

**铁律**：`ALLOWED_TARGETS` 必须等于 `RUN_BY_NAME` 键集，否则造物主声明的 agent 指向不存在的 target 就成死链。**一处实现、四处登记，FROST 就能调用它。**

> 若是**用户自定义的轻 agent**（咖啡馆/演唱会/展览这类「钉地球」变体），不必写代码——走**造物主 AgentForge** 声明式生成：一句话→`forge.ts` 让 Qwen 产 `AgentManifest`（纯 JSON）→必过 `manifest.ts` 的 `reviewManifest` 安全闸（字段白名单多一字段即拒、`DANGER` 正则扫代码/外链、**绝不生成执行代码**）→`engine.ts` 通用引擎（六层骨架参数化版）解释执行，落点统一走 `userMarks`（`kind:custom`）。

---

## 17. 设计原则总结与演进路线

### 17.1 七条设计原则（一句话各一条）

1. **上下文隔离换信噪比**（舱壁）：子 agent 把噪声留在自己上下文，只回传结论描述子。
2. **工具白名单即物理边界**：`validator` 最小权限「未注册一律拒」、`reviewSkill`/`reviewManifest` 安全闸默认拒一切疑似代码/外链。
3. **model 是成本与隐私杠杆**：端侧挑和找、云脑写，敏感数据被这刀挡在端内。
4. **报文传输而非共享内存**：窄契约（`AgentResult`/Handoff Contract）传结构化报文，无共享可变状态。
5. **缺任一能力都能继续运行**：四级路由 + `stubBrain` 空串 + `withFallback` + `pickBackend` 三级降级，任何故障坍缩到可用默认值。
6. **数据与实现解耦**：`domain.ts` 缺失降空数组、`userMarks` 生产者/消费者解耦、字段 schema 留调用方。
7. **生成概率性、验证确定性**：LLM 可以抖，`courtVerify`/`matchCity`/`reviewManifest` 这些零网络的确定性规则兜底边界。

**地球，是把这套编排显形的载体**——它让用户亲眼看见「每一个碎片被钉回它该在的地方」。

### 17.2 演进路线

- **P0 ✓** 长期记忆核心闭环：回流补字段（坐标反查城市）、photo 接回流、`memoryRouter` 读装配。
- **P1 ✓** 评分加权回流（5★×3）、叙事层 `ensureNarrative` 主路径保鲜、行程截图自动提炼、跨 agent 地理联动、心情情绪智能（六色基调 + 回望 + L3 注入）、统一万能记一笔 JOT、法庭流水线 + 判例库 + 确定性验证器、`FrostBus` + 真 SSE 流式、`withRetry` 容错。
- **P2 进行中** 自主持续优化循环（每轮对抗式审查→修→build→部署）、旁路复盘/历史检索/反思记忆深化/记忆合并/导出、端侧预分类全量启用（`ALL_CLOUD=false` 切回真实端侧路由）、MNN 前端切换（契约层已留位、前端零改）。

---

**模型一览（统一只用通义 Qwen）**：云端写 = **qwen-plus**（DashScope OpenAI 兼容，`/api/frost-llm` 服务端代理、密钥永不进前端）；端侧挑和找 = 浏览器 **WebLLM Qwen3-0.6B**（`Qwen3-0.6B-q4f16_1-MLC`，~400MB，WebGPU）/ 服务端 **ollama qwen3:0.6b**（文本）+ **qwen2.5vl:3b**（视觉）/ **MNN 部署 Qwen3-0.6B（文本）+ Qwen2.5-VL-3B（视觉）**，三级降级 `mnn→ollama→stub`。

**一句话收束**：frost-agent 把「一个总 agent」拆成可替换的六部件外壳、可插拔的端云双脑、可独立委派的领域子 agent、可组合的技能与可观测的编排——所有产物最终汇入地球这条统一索引。**端侧管挑和找 · 云端管写 · 地球是统一索引。把世界钉回它该在的地方。**