# Pocket Earth · 口袋地球

> 一个**本地空间知识库**：把你的书、电影、音乐、照片、行程，全部钉回它们在地球上的那个地点，让一颗地球长成只属于你的知识地图。
>
> 内核是 **frost-agent**——一套「把地球作为方法」的多智能体编排框架（Harness），是我自己对 agent harness 工程的一套实践与思考。

---

## 一、它是什么

市面上的知识工具用**双向链接**（Obsidian）或**数据库**（Notion）组织信息。Pocket Earth 换了一根索引轴——**地理坐标**。

人脑记「在哪」往往比记「哪天 / 叫什么」更牢。所以这里的每一条记录都被重新挂回它的地点：

- 一本书钉到它的**故事发生地**（《百年孤独》→ 马孔多 / 阿拉卡塔卡）；
- 一部电影钉到它的**国别 / 取景地**（按豆瓣观影记录落到电影之都）；
- 一首歌钉到**歌手出身地 / 歌曲所写的城市**；
- 一张照片按**经纬度**归位，高价值的才留下；
- 一段行程走完，每个停留点变成地球上的**私人足迹**；
- 你甚至可以一句话造一颗**主题星球**（「日落星球」「鸟类星球」）；
- 或在赛博漫游时，把**此刻的心情**贴到世界某个角落，自带经纬度、永远钉在那里。

> 一句话：**把地球作为方法，让空间成为记忆的索引。**

---

## 二、三个 Tab

应用是一个手机尺寸的像素风界面，底部三个 Tab：

| Tab | 名称 | 内容 |
|---|---|---|
| 左 | **PHOTOS · 照片** | 同一批照片按时间戳以「时间 / 日历 / 杂志」三视图**自适应**呈现；杂志点开是**手帐双页翻书**（缩略图灰度、触碰彩色） |
| 中 | **🌐 地球** | Mapbox 地球；五类标记 + 用户星球；放大看**拍立得照片贴**，左上角加号可贴**自带经纬度的心情贴**；点开看详情 |
| 右 | **AGENTS · FROST-AGENT** | 多智能体控制台：6 curator + 自定义星球 + 圆桌议事 + 心情漫游，全部可运行 |

中间的地球是**统一索引**——所有 agent 的产出最终都落在这里。

---

## 三、frost-agent 架构全景（核心）

frost-agent 不是一个聊天机器人，而是一套**主智能体编排子智能体**的 Harness。下面这张图是它的全貌——一次请求如何流过整套 harness、由两台引擎驱动、全程自带降级：

```
                          用户一句话 / 一次操作
                                   │
                 ┌─────────────────▼─────────────────┐
                 │  Shell · 人格(persona)             │  对外永远同一个声音
                 │  + 人声守则(HUMAN_VOICE：说人话)    │
                 └─────────────────┬─────────────────┘
                                   │
                 ┌─────────────────▼─────────────────┐
                 │         Router · 混合路由           │
                 │  ① 明确指令      → 正则秒回         │
                 │  ② 端侧预分类    → 命中秒回 ┄┄┄┄┄┄┄┼┄┄► 端侧 Selector
                 │  ③ 云脑读意图+抽实体 ┄┄┄┄┄┄┄┄┄┄┄┄┄┼┄┄► 云 Brain
                 │  ④ 规则兜底                         │
                 │  〔意图 → 处理器：intentRegistry〕  │
                 └────┬───────────────────────┬───────┘
              委派 dispatch               注入 inject
                  │                           │
     ┌────────────▼────────────┐  ┌───────────▼───────────┐
     │  Sub-agents 子 agent     │  │  Memory + Profile      │
     │  curators · directors    │  │  会话记忆 + 跨会话画像  │
     │  · COUNCIL 圆桌议事      │  │  (fingerprint 缓存)    │
     └────────────┬────────────┘  └────────────────────────┘
         只「建议」动作 / 产出落点
     ┌────────────▼────────────┐
     │  Boundary · 校验          │  suggest-then-validate
     │  〔动作校验注册表〕       │
     └────────────┬────────────┘
            合法才落地
                  ▼
   地球落点 / 回复(带 trace 思考痕迹) / 动作   ← 出口再过「人声守则」清洗

══ 两台引擎（贯穿全程，model 是成本与隐私的杠杆）══════════════
  端侧 Selector「挑 / 找」              云 Brain「写」
   classify · rank · embed · vision      complete()
   MNN × Qwen(Arm SME2) · 离线隐私       DeepSeek(服务端代理, 密钥不入前端)
   契约 EdgeModel + edgeSafe(兜底+health)  provider-compat 单入口(加模型=加一文件)
   三级降级：mnn → ollama → stub          无 key → 规则兜底
```

它由下面这些部件组成，跑在「端侧 Selector + 云 Brain」两台引擎上。逐部分讲清：

### 3.0 为什么叫 frost-agent（一脉相承）

名字取自罗杰·泽拉兹尼的科幻短篇《趁生命气息逗留》：弗洛斯特（Frost）是被造出来统治地球的最强机器，人类早已消失，它却对「人」着了迷——一件不复存在的事物，它想弄懂「做一个人，是什么感觉」。它的做法，和这个产品惊人地一脉相承：

| 小说里的 Frost | 我们的 frost-agent · Pocket Earth |
|---|---|
| 以整个地球为疆域，去理解「人」 | **把地球作为方法**，以地理坐标当记忆索引 |
| 委派下属漫游机、莫德尔，在全球挖掘、带回一本本书与文物 | 委派 **curator**，把书 / 影 / 乐 / 照 / 行程 / 心情的碎片钉回地球 |
| 从一把刀、一首诗、一幅画…的碎片里，拼「做人是什么感觉」 | 从你的生活碎片里，在口袋星球上拼「你是谁」 |
| 自己不下场，靠委派去理解世界 | 主 agent 不吞数据，**CEO 委派子 agent** |
| 克制、耐心，为理解而非占有 | 跨会话画像「越用越懂你」，目的是懂你、不替你做主 |

一句话：它收集碎片去理解「人」，我们收集你的碎片去拼出「你」。这股「想读懂、靠委派、为理解而非控制」的劲，就是把内核命名为 Frost 的理由。

### 3.1 CEO 委派模型：主智能体 → 子智能体（curator）

一个**总 frost-agent** 扮演 CEO：它不亲自吞下所有原始数据，而是把不同类型的对象**委派**给专门的 curator 子智能体；每个 curator 在**独立上下文**里完成「整理 → 定位 → 产出落点建议」，只把**结论**回流，而非过程中的全部细节。

这套机制的三重价值，对应软件工程的三条原则：

- **隔离（Isolation）** — 整理一整本相册、抓取一整批网页的噪声，被封锁在 curator 自己的上下文里，主对话只接收结构化结论。如同操作系统的进程隔离 / 舱壁模式，从根上解决信噪比问题。
- **约束（Constraint）** — 每个 curator 只拿它真正需要的工具（最小权限）；写入 / 落点类动作必须经 Boundary 校验。工具白名单即物理边界。
- **可组合（Composable）** — curator 是契约化的、可独立调用、可并行委派的单元，互相之间没有共享状态。

> 详见内核文档 [`frost-agent/ARCHITECTURE.md`](frost-agent/ARCHITECTURE.md) 与 [`frost-agent/HARNESS-PRINCIPLES.md`](frost-agent/HARNESS-PRINCIPLES.md)。

### 3.2 自带降级的 mini-harness（六个部件）

| 部件 | 文件 | 作用 |
|---|---|---|
| **Shell** 人格 | `harness/persona.ts` | 统一对外声音；用户始终面对同一个「人」；内含 `HUMAN_VOICE` 人声守则（全 agent 说人话，见 3.7） |
| **Brain** 云脑 | `harness/{brain,httpBrain}.ts` · `provider-compat/` | 可插拔 `complete()`；stub 返回空串 → **全链路无 LLM 也能跑**；密钥只在服务端；请求体走 provider-compat 单入口 |
| **Selector** 端侧 | `edge/{contract,httpEdge}.ts` · `provider-compat/{qwen,mnn}.ts` | 端侧「挑/找」（见 3.4）；契约 `EdgeModel` + `edgeSafe`（带兜底 + health） |
| **Router** 路由 | `harness/{router,intentRegistry,llmRoute}.ts` | 混合路由 + 意图注册表 + 端侧预分类（见 3.3） |
| **Memory + Profile** 记忆 | `harness/{memory,profile}.ts` | 会话级记忆 + **跨会话长期口味画像**（fingerprint 缓存，见 3.6） |
| **Boundary** 边界 | `harness/validator.ts` | 子 agent 只**建议**动作，过校验才落地；动作校验注册表（suggest-then-validate） |
| **Sub-agents** 子智能体 | `agents/*` · `src/app/council/` | curator / director / 圆桌；每个 = 职责契约 + 实现（五种形态见 3.5） |
| **Health** 健康 | `harness/health.ts` | 按步骤记成败，让降级**可观测**而非静默 |

整套架构的灵魂是**优雅降级**：云脑不可用 → 规则兜底；端侧未就绪 → stub；端侧后端三级回落 `mnn → ollama → stub`；OSS 不可达 → 回落示例资源。任何一环断了，产品依然能跑。

### 3.3 Router：混合路由（省钱省延迟 + 接得住没预料的问法）

```
用户自然语言
   │
   ├─① 明确指令？        → 正则秒回（不动用任何模型）
   │
   ├─② 端侧能粗分？      → 端侧 classify 命中合法意图 → 秒回（不动云脑，省 token+提速）
   │
   ├─③ 否 → 云脑读意图    → LLM 判意图 + 抽实体（泛化长尾）
   │
   └─④ 大脑不可用        → 正则兜底
                    │
                    ▼  委派 → Boundary 校验动作 → 返回（带 trace 轨迹）
```

意图 → 处理器走 `intentRegistry` 注册表：**新增一类意图 = 注册一个处理器，内核 dispatch 不改**（动作校验同理走 validator 注册表）。每一步判断都进入 **trace**（思考轨迹），在 UI 里可见——委派过程天然透明。

### 3.4 端云双脑：端侧「挑和找」，云端「写」

这是 Pocket Earth 把「本地」二字落到实处的关键，也是 Token 经济学与隐私的杠杆：

| | 端侧 Selector（`/api/edge`） | 云端 Brain（`/api/frost-llm`） |
|---|---|---|
| 角色 | **挑 / 找 / 分类 / 排序 / 视觉打标** | **写 / 叙事 / 推荐 / 作答** |
| 模型 | MNN × Qwen3.5(文本) / Qwen3-VL(视觉)，Arm SME2 加速、离线；备选 ollama | DeepSeek（服务端代理，密钥不入前端） |
| 接口 | 契约入口 `edgeSafe.classify / rank / embed / vision / chat`（带兜底 + health） | `complete()` |
| 用在哪 | 意图预分类、选歌 / 选 POI 排序、照片价值打标、地名识别、截图理解 | 各 curator 对话作答、推荐、串词 |
| 兼容 / 降级 | `provider-compat/{qwen,mnn}` 集中 quirk；三级回落 `mnn → ollama → stub` | provider-compat 单入口；无 key → 规则兜底 |
| 隐私 | **原图 / 相册 / 画像不出端**，只有元数据 / 标签 / 坐标进知识库 | 只接收已脱敏的结构化输入 |

端侧未就绪时，`edgeSafe` 安全返回空值并记 health，调用方自动走规则兜底。完整端侧部署（编译 / 转换量化 / sidecar / 调优）见 [`deploy/edge-runtime/`](deploy/edge-runtime/)。

### 3.5 五种子智能体类型 → 映射到本项目

我把常见的子 agent 形态归纳成五种，在 Pocket Earth 里都有对应：

| 类型 | 含义 | 本项目实例 |
|---|---|---|
| **执行型** | 高噪声海量输入 → 极少高价值输出 | `photos-curator`：扫描整本相册（几千张）→ 仅过阈值的高价值照片钉地球 |
| **流水线型** | 串行处理链 + 交接契约 | music / books：读记录 → 端侧挑选 → geocode 定位 → mark 落点 |
| **并行型** | MapReduce，多专家同时跑 | 流派归类用 12 个子 agent 并行分类 619 位艺人；多 curator 可并行委派 |
| **只读型** | 安全的观察者（只读不写） | 探查 / 检索类委派（如代码探查用 Explore agent） |
| **团队型** | 自组织协作 | 总 frost-agent 编排多 curator 协同；**圆桌议事**让一群 agent 同台辩论（见第五节）|

### 3.6 长期画像（Profile）：越用越懂你

`memory.ts` 管「会话内最近几轮」，`profile.ts` 管「跨会话沉淀下来的口味」——两者平行。

- **怎么来**：库存一次性播种（影 / 书 / 乐 / 照聚合成导演 / 作者 / 流派 / 城市等口味标签，幂等）+ 你每记一条增量追加。
- **成本护盾**：`fingerprint` 缓存——口味没实质变化就不重算、不动云脑（对应「记忆压缩」思路）。
- **隐私边界**：画像只拼进**云脑** `system`，端侧 classify 一律不接触，**不出端到端侧模型**。
- **显形**：控制台顶部一句话「你的口味 · ……」，由跨域偏好综合而来。

### 3.7 人声守则（HUMAN_VOICE）：让每个 agent 说人话

`persona.ts` 里一份总纲领，约束**所有**对外说话的 agent（curator 对话 / 圆桌发言 / 口味画像）：不堆破折号、不用星号加粗、不写「不是 X 而是 Y」的对仗反否、不凑排比与空泛溢美、不加客套开场白。**双保险**：提示层写进每个 system，出口层 `cleanVoice` 再程序化清洗（模型没听话也兜得住）。

### 3.8 端侧整理照片：看图打分 → 锚定地球（真机权限模型）

photos-curator 是「执行型」子 agent 的样板——典型的**高噪声海量输入 → 极少高价值输出**：

```
相册(几千张) ─► 端侧视觉模型(MNN × Qwen-VL) 逐张看图
                  │  评分(收藏价值 0–100) + 打标(城市/类别) + 判定(保留/待定/可删)
                  ├─► 高价值：按经纬度锚定到中间的地球 + 日历（两 tab 联动）
                  ├─► 重复：标记清理（只标记，不删原图）
                  └─► 低价值：折叠
```

- **看图是真端侧**：控制台「端侧看图打分」按钮调 `edgeSafe.vision`，本机视觉模型真看照片给出分数 + 理由（如「端侧实判 65 分 · 风景氛围好但人物模糊不清」），不是预置分。
- **网页 demo 的图源**：用 OSS 照片库（世界日落照片）实跑，验证端侧打分链路。
- **真机上的权限模型**：在实际端侧手机运行时，需要用户授予这个端侧 agent **手机的全部权限**（相册 / 相机 / 定位），agent 才能访问手机里的照片 → 在**端侧本地**完成打分与打标 → 把高价值照片**锚定到中间的地球**。**原图与判断全程在端、不出端**——这正是端侧方案相对纯云的隐私价值：照片不上传，只有「分数 / 标签 / 坐标」这类元数据进入知识库。

---

## 四、Agent 一览（数据层 + 对话层）

控制台（右 Tab）里全部 agent 都可点击运行。其中四个采用**双 Tab 结构**——左「数据层」（你的名录），右「对话层」（懂你数据的领域 agent）：

| Agent | 数据层（左 Tab） | 对话层（右 Tab） | 落到地球 |
|---|---|---|---|
| **music-curator** | 曲库：621 首按 **地域 / 城市 / 歌手 / 流派** 四维归类 | 与 FROST 电台 DJ 对话，端侧排序选歌、云写串词 | 歌手出身地 / 歌曲城市（绿） |
| **books-curator** | 书架：EX LIBRIS 藏书票名录 | 读书 agent，基于你读过的书推荐 / 串主题 | 故事发生地（紫） |
| **movies-curator** | 片库：ADMIT ONE 电影票根流（豆瓣 2124 部） | 观影 agent，懂你的豆瓣口味 | 国别 / 电影之都（琥珀） |
| **podcast-curator** | 城市播客库（可播放） | 城市 agent，讲一座城的夜晚与文化 | —（叙事为主） |
| **photos-curator** | 端侧持续整理：整理报告 / 重复清理 / 高价值（单页·执行型） | — | 经纬度归位（青） |
| **travel-curator** | 端侧按喜好规划逐日行程（单页） | — | 完成行程 → 私人足迹（玫红） |
| **planet-builder** | 自定义 agent：一句话造主题星球（Unsplash 抓图） | — | 按主题纬度带散布成新图层 |
| **mood-curator** | 心绪漫游：写下赛博浏览各地的心情 | — | 端侧判地名 → 心情贴钉地理坐标 |

> 此外还有 **圆桌议事**（多 agent 同台讨论 / 辩论 / 法庭，见第五节）—— 不落地球，是另一种 agent 协作形态。

每个对话层都**数据接地**——把你该领域的记录注入提示，所以「我读过的书里哪些讲孤独」会真的引用你书架上的《百年孤独》《雪国》《老人与海》逐一点评，而不是泛泛而谈。

---

## 五、多 Agent 圆桌议事（COUNCIL）

除了「各司其职的 curator」，还有第二种协作形态：让一群 agent **同台讨论**。圆桌议事（控制台 → COUNCIL）是一个**与各 curator 解耦**的独立模块，用「频道群聊」式的多 agent 同台机制，UI 是 Pocket Earth 自己的像素风。

**你来组局**：8 个独立 agent（读书官 / 影评人 / 选曲师 / 摄影眼 / 旅人 / 造星者 / 庭长 / 抬杠侠），各有领域人设、像素头像与口头梗。点头像选谁入场，出一个议题，挑一种模式：

- 🪑 **圆桌** — 各抒己见、出谋划策
- 🗣️ **自由辩论** — 针锋相对、互相反驳
- ⚖️ **法庭** — 正方 / 反方举证质证，最后庭长裁断
- 💡 **头脑风暴** — 放飞脑洞、互相接梗

**机制（频道群聊式的纯前端回合引擎，见 `src/app/council/engine.ts`）**：

- **频道即真相** → 内存里的 transcript；每个 agent 发言前，把最近若干条群聊上下文注入它的 prompt（标明谁说了什么），独立生成发言。
- **有序轮转** → 一个发言序列（轮流 / 法庭正反交替 + 庭长收尾），一次发言 = 一次 LLM 调用，串行推进。
- **收敛** → 固定轮数 + 用户随时**喊停**（AbortSignal），从机制上避免 agent 之间无限互相回复。

**云端 / 端侧可切**：☁ 云端用 DeepSeek（辩论质量最好）；🖥 端侧用本地 Qwen（**离线可用、隐私不出端**），端侧未就绪时自动回落云端。

解耦体现在：独立目录 `src/app/council/`（`agents` 花名册 + `engine` 回合引擎）+ 独立组件（`PixelAvatar` / `CouncilPage`），只调用已有的 `/api/frost-llm` 与 `/api/edge`，不碰任何 curator 代码。

---

## 六、联动与地图

### 6.1 tab1 ⇄ tab2 实时联动

```
各 agent 产出落点 ──► userMarks / planets （localStorage 发布订阅 store）
                              │  subscribe
                              ▼
                     MyMapTab 合并：静态标记 + 用户落点 + 星球图层
                              │  source.setData()
                              ▼
                       地球图层实时刷新（无需刷新页面）
```

在「观影」里记一部电影、在「读书」里记一本书、走完一段行程、造一颗星球、贴一条心情——地球上立刻多出对应的点。

### 6.2 标记 + 拍立得 + 心情贴

- **五类基础标记**（mapbox symbol 方块图层，碰撞合并、缩小只显其一、放大散开）：音乐 `#00ff88` / 照片 `#00e5ff` / 电影 `#ffb000` / 书 `#b388ff` / 行程 `#ff3b6b`。
- **用户星球**（mapbox circle 圆点图层，每颗一色），与方块在形状上即可区分。
- **拍立得照片贴**：放大到一定缩放，照片以拍立得呈现（白边 + 紫钉 + 方形 / 竖版随机 + 黑白触碰彩色），全球城市可见，杭州亦有。
- **心情贴**（左上角加号）：写一句心情 → 端侧判地名 → 钉到该经纬度。**自带经纬度**，地球缩放 / 平移到任意程度都钉在原地、不跟屏幕跑；localStorage 持久（`geoStickers` store，与「心情漫游」agent 同一份）。
- **点击看详情**：照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 城市；星球照片含 Unsplash 署名。
- **图例**：左下角两段式（基础类 + 星球），可逐层开关 / 删除。

---

## 七、数据来源

| 数据 | 来源 | 是否入库 |
|---|---|---|
| 观影记录 | 豆瓣导出 2124 条 → `src/app/data/douban-movies.json` | ✅ 入库 |
| 音乐流派表 | 端侧并行分类 619 位艺人 → `src/app/data/music-genres.json` | ✅ 入库 |
| 电台资料库 | 96 城 621 曲（音频 / 封面 / 文稿） | ❌ 私有，`resource-library/` |
| 读书 | 18 部文学种子（豆瓣读书导出为空时的兜底） | ✅ 入库 |
| 照片坐标 / 时间 | `photo-places.json`（真实城市坐标，含杭州）+ `photo-dates.json`（伪造时间 2020–2025，驱动三视图自适应） | ✅ 入库 |
| 照片图源 | 本地图池（缩略 + 高清两版） | ❌ 私有 |
| 心情贴 | 用户运行时手写，端侧判地名（`geoStickers` localStorage） | 本地 |
| 星球照片 | Unsplash 搜索（CDN 直链，不下载、不落 OSS，合规署名） | 运行时抓取 |

> 后端代理（dev 中间件，密钥只在服务端）：`/api/frost-llm`（DeepSeek）、`/api/edge`（端侧）、`/api/unsplash`（主题抓图）。

---

## 八、目录结构

```
src/app/
  components/        # 界面：三个 Tab + 各 agent 运行页 + 地图 + 详情弹层
    MyMapTab / MarkerDetail / MapLegend          # 地球与标记
    MusicCuratorPage / BooksCuratorPage / …      # 双 Tab 容器（数据层 + 对话层）
    CuratorTabsPage / AgentChat                  # 通用双 Tab 与通用对话层
    PhotosCuratorRunPage / TravelRunPage / PlanetBuilderRunPage / MoodRunPage
    CouncilPage / PixelAvatar                    # 多 agent 圆桌议事 + 像素头像
    MagazineBook                                 # 杂志点开后的手帐双页翻书
  council/          # 圆桌议事（解耦）：agents 花名册 + engine 回合引擎
  data/             # 解耦数据层：movies / books / musicCatalog / photos / travel
                    # userMarks / planets / geoStickers（联动 store）/ themePlanet / photoCuration / mapMarkers
                    # photo-places + photo-dates（坐标 + 伪造时间，驱动三视图自适应）

frost-agent/        # 内核 Harness（详见其 ARCHITECTURE.md / HARNESS-PRINCIPLES.md）
  harness/          # persona / brain / router / llmRoute / memory / validator / types
  agents/           # 子 agent：switch-handler / tour-director / open-dj-director / …
  edge/             # 端侧 Selector：types / httpEdge / viteEdge（ollama 路由 + stub 兜底）
  planet/           # viteUnsplash（/api/unsplash 代理）
  data/radio.ts     # 电台资料库装载

resource-library/   # 私有资料库（城市 / 照片 / 音频，gitignore 不入库）
```

---

## 九、运行

```bash
npm install

# 配置密钥（均可选；不配则自动降级到规则 / 兜底资源）
cp .env.example .env
#   VITE_MAPBOX_TOKEN     地球底图
#   DEEPSEEK_API_KEY      云端 Brain（对话 / 串词）
#   UNSPLASH_ACCESS_KEY   星球抓图

npm run dev
```

可选：本地装 [ollama](https://ollama.com) 并拉取 `qwen3:0.6b` / `qwen2.5vl:3b`，端侧 Selector 即真跑（否则走 stub 兜底）。

---

## 十、设计原则（我对 agent harness 的思考）

- **上下文隔离换信噪比**：海量输入的整理留在子 agent 内部，主对话只见结论（舱壁模式）。
- **工具白名单即边界**：最小权限；落点动作必经 Boundary 校验。
- **model 是成本 / 隐私杠杆**：端侧管挑和找、云端管写；隐私数据不出端。
- **报文传输而非共享内存**：curator 之间不直接通信，主 agent 显式搬运结论；trace 因此天然可见。
- **优雅降级是第一公民**：无 LLM / 无端侧 / 无网络，产品都还能跑。
- **数据与实现解耦**：换数据只换数据源，三视图、地图点、归类自动重排。

---

## 后记 · 关于 agent harness 的一点思考

做这个项目，我越来越确信：agent 工程的难点不在「让模型更聪明」，而在**编排**——怎么把一个大任务拆给一群各司其职的子 agent，怎么在上下文隔离、最小权限、优雅降级之间找到平衡。

frost-agent 就是我对这件事的一次完整实践：主 agent 当 CEO 只接结论不接噪声、子 agent 拿契约和最小工具、端侧管挑选、云端管生成、任何一环断了产品都还能跑。地球只是把这套编排「显形」的载体——所有 agent 的产出都落在同一颗地球上，编排过程因此天然可见。

这些原则都是我自己在反复踩坑后沉淀下来的，也还在继续打磨，欢迎一起讨论。
