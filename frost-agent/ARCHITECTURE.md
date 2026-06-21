# Frost Agent · 架构设计 v2.0

> 📖 本文是 frost-agent **内核**的架构说明。覆盖全系统（端云双脑 / 子 agent 六层流水线 / 长期记忆双层闭环 / 技能系统 / 议事庭审 / 可观测编排）的完整深度总纲见根目录 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)。

frost-agent 是 Pocket Earth 的内核：一个**把地球作为方法**的个人知识整理 agent。它把用户的书、电影、音乐、照片这些个人对象，整理、定位、钉到地球上的某个地点，让地图长成一张属于「这个人」的知识地图。

一个**总 frost-agent** 作为主 agent（CEO / Team Lead），把不同类型的对象委派给专门的 agent 子 agent；每个 agent 在隔离上下文里独立完成「整理 → 定位 → 产出落点建议」，再由 Boundary 校验后钉到地球。radio 只是其中一类对象的处理方式，不是 frost-agent 的全部。

设计原则：城市、书籍、电影、音乐、照片、个人记忆，都被重新挂回地球上的某个地点；地球是这套知识的统一索引。

> v2.0 相对 v1 的变化：从「单一领域的内容编排」升级为「多 agent 的个人知识整理」，并把我自己沉淀的子 agent 工程原则系统落到架构里（详见 [HARNESS-PRINCIPLES.md](HARNESS-PRINCIPLES.md)）。

## 1. 个人知识整理：四个 agent + 地球索引

总 frost-agent 把个人对象委派给对应的 agent 子 agent；每个 agent 产出统一的 `mark_place` 落点建议（见第 5 节），经 Boundary 校验后钉到地球。

| agent | 钉到地球的依据 | 端侧 / 云分工 | 子 agent 模式 |
|---|---|---|---|
| [`books-agent`](agents/books-agent/contract.md) | 故事发生地 / 作者所在地 + **读完日期** | 端侧抽取消歧 + 联网补全缺口 + 云写「为什么属于这座城」 | 流水线型（locate→enrich→resolve→mark，带交接契约） |
| [`movies-agent`](agents/movies-agent/contract.md) | 取景地 / 故事发生地 + 观看日期 | 端侧整理打标去重 + 联网补缺口 + 云做叙事/歧义校正 | 执行型 / 流水线型（视是否需补全） |
| [`music-agent`](agents/music-agent/contract.md) | 歌手出身地 / 歌曲所写城市 + 收听足迹 | 端侧选择/聚类/打标 + `geocode` 落经纬度 | 流水线型（读记录→端侧挑选→geocode→mark；无联网补全） |
| [`photos-agent`](agents/photos-agent/contract.md) | EXIF 定位 + 内容标签 + 拍摄日期 | **全端侧**视觉打标 + 价值打分；云仅在用户要「讲成一段」时另行触发 | 执行型（海量输入 → 极少落点） |

四个 agent 共享一条形状：**摄取个人对象 → 端侧整理（挑和找）→〔信息不全时联网补全〕→ 定位 + 日期 → `mark_place` 建议 → Boundary 校验 → 钉到地球**。它们之间没有共享状态，可由总 agent 并行委派。

**photos-agent 是「执行型」的范本**：手机对本 app 完全开放相册权限后，端侧模型扫描整本相册（几千张）、逐张打标 + 按价值打分，只有过阈值的高价值照片才被建议钉到地球；几千张输入 → 几个落点输出，信噪比极高。**隐私铁律**：全程端侧，原图与相册不出端，只有被选中照片的元数据 / 标签 / 缩略 / 坐标 / 日期进入知识库。这正是「把相册整理成个人知识库」。

## 2. 子 agent 工程基础（落到架构里的原则）

v2.0 把第 4 章的工程原则系统落到 frost-agent。完整 13 条见 [HARNESS-PRINCIPLES.md](HARNESS-PRINCIPLES.md)，这里是与本架构最相关的几条：

- **上下文隔离换信噪比**：agent 把整理一整本相册 / 一整批网页的噪声封锁在自己的独立上下文里，只把结构化结论回流主对话（舱壁模式）。
- **工具白名单 = 物理边界**：每个 agent 只拿它真正需要的工具（最小权限）；写入类工具只授予 `publish` 角色。
- **model 是成本/隐私杠杆**：升级为「双速模型」——端侧 Selector 管「挑和找」，云 Brain 管「写」（见第 6 节）。
- **5 种模式**：照片整理 = 执行型（海量输入→极少输出）；书籍补全 = 流水线型 + 交接契约（Handoff Contract）；多 agent 同时跑 = 并行型（MapReduce）。
- **子 agent 定义 Who/What/Where/Output，Skill 定义 How/Standard**：现有 `contract.md` 正是这条边界的落地。
- **报文传输非共享内存**：agent 之间不直接通信，主 agent 显式搬运上一段的结构化结论到下一段；这也使委派轨迹（trace）天然可见。
- **嵌套 ≤ 2 层**、**Token 经济学（输入 ≫ 输出才委派）**、**中断恢复（长任务把中间产物落盘）**：约束总 agent 的编排粒度。

## 3. 现状：一套自带降级的 mini harness

当前实现由六个部件组成（v1 已落地，v2.0 在其上扩展）：

| 部件 | 文件 | 作用 |
|---|---|---|
| Shell | `harness/persona.ts` | 统一对外人格与声音；用户始终听见同一个声音，而非内部子 agent |
| Brain | `harness/brain.ts`, `httpBrain.ts` | 可插拔 `FrostBrain.complete()`；stub 返回空串，全链路无 LLM 也能跑；密钥只在服务端 |
| Router | `harness/router.ts`, `llmRoute.ts` | 混合路由：规则秒回 → LLM 抽意图 → 规则兜底 |
| Memory | `harness/memory.ts` | 会话级记忆（最近若干轮） |
| Boundary | `harness/validator.ts` | 子 agent 只「建议」动作，过校验才落地 |
| Sub-agents | `agents/*` | 每个 = `contract.md`（职责契约）+ 实现；含 runtime agent 与离线 pipeline |

需要保留的设计资产：契约式子 agent（Who/What/Where/Output）、「只建议、后校验」边界、全链路降级、混合路由、trace 作为核心产出。

## 4. 现状约束：三处把框架绑定在单一领域上的硬编码

1. **意图是写死的枚举** `FrostIntent`（`harness/types.ts`），同时被 `router` 与 `llmRoute` 依赖 —— 新增能力要改内核。
2. **动作词表只有 `RadioAction`**，`validator` 也只认这一套 —— 其它对象（书 / 电影 / 照片）没有自己的落点动作。
3. **领域数据只有 `RADIO_CITIES`**，被 router / llmRoute / validator 及多数 agent 直接 `import`。

另有两个缺口：`contract.md` 里的 `tools:` 目前只是文档，没有真正的工具注册表；`memory` 只有会话级，没有跨会话的长期个人记忆。

## 5. 目标分层架构

```
总 frost-agent（主 agent · CEO / Team Lead）
  └─ Router  路由：选 Skill → skill 内选 agent
       └─ Skill  技能（可插拔 manifest）：library / cinema / music / gallery …
            └─ Sub-agent  agent（契约式：Who/What/Where/Output）
                 └─ Tool  工具（注册表，最小权限授权）

跨层能力（贯穿四层）：云 Brain · 端侧 Selector · 长期记忆 · Boundary
```

### 5.1 Router · 路由
由「选意图」升级为「先选 Skill，再在 skill 内按 agent 的 description 语义匹配委派」。意图枚举不再写死在内核，而是各 skill 自己声明。端侧意图预分类挡在云路由之前。

### 5.2 Skill · 技能（可插拔 manifest）
每个 skill 声明：领域对象类型 + 数据源、意图集、它的 agent 列表、**自己的动作词表 + 校验器**、可选 persona。新增对象类型（书 / 电影 / 照片）= 注册一个 skill，不改内核 —— 这同时解开第 4 节的三处硬编码。

### 5.3 Sub-agent · agent（契约式）
四种通用角色：`research`（探索补全）/ `curate`（端侧选择整理）/ `script`（云生成叙述）/ `publish`（落点发布）。四个 agent 子 agent（books / movies / music / photos）就是这套角色在不同对象上的具体形态，契约见 `agents/*/contract.md`。

### 5.4 Tool · 工具（注册表，做实）
把 `tools:` 声明变成真实函数注册表，按 `permissionMode` 授权：`read_user_library / read_album / web_search / geocode / edge_*`（端侧选择打标）/ `mark_place`（写入，仅 publish 角色经 Boundary）。

## 6. 主 frost-agent 编排与统一动作

### 6.1 编排（对应书里的 5 种模式）
- **并行型（MapReduce）**：批量整理时，总 agent 把不同对象并行派给各 agent（彼此独立、无共享状态），最后 Reduce 汇总成一张挂回地球的视图。
- **流水线型 + 交接契约**：books-agent 的 `locate → enrich → resolve → mark`，前一阶段输出是后一阶段唯一合法输入。
- **执行型**：photos-agent 在隔离上下文里把几千张相册收敛成几个高价值落点。
- **报文传输**：agent 之间不共享内存，总 agent 显式搬运每段的结构化结论。
- **嵌套 ≤ 2**：允许「流水线某阶段内并行」，再深就重新切分角色。

### 6.2 统一动作词表：`mark_place`
取代单一 `radioActions`。所有 agent 的落点都收敛到一个动作：

```ts
mark_place({
  entity: { kind: 'book' | 'movie' | 'music' | 'photo', title, ... },
  lat, lng,           // 合法经纬度（geocode / EXIF 产出）
  date,               // 读完 / 观看 / 收听 / 拍摄日期
  tags: string[],     // 端侧打标
  note?: string,      // 云生成的一句关系说明（统一可选；books-agent 按设计必生成）
})
```

动作只是**建议**。Boundary 校验经纬度合法性、去重（同对象同地点不重复钉）、以及照片的**价值阈值**，通过才真正钉到地球。radio 的播放类动作（`switch_city / play / set_playlist …`）作为 music skill 自己的动作词表保留。

### 6.3 Boundary（泛化）
「只建议、后校验」边界保留并泛化：每个 skill 注册自己的动作校验器，内核统一在落地前调用。工具白名单管「能调用什么」，校验器管「调用结果准不准落地」，两道闸叠加 —— 即便 agent 端侧模型给出一个不存在的地点或一张废片，也会在钉到地球前被挡下。

## 7. 双速模型：端侧 Selector + 云 Brain

- **端侧 `Selector`**：选择 / 排序 / 打标 / 嵌入 / 价值打分 —— 选歌、选图、选书、意图预分类、RAG 检索。建议新增与 `FrostBrain` 平行的接口：

```ts
interface Selector {
  rank(query: string, candidates: Item[]): Promise<Item[]>;
  embed(texts: string[]): Promise<number[][]>;
  classify(text: string, labels: string[]): Promise<string>;
}
```

- **云 `Brain`**：质量敏感的「写」—— 叙事、文化抽象、为什么这本书属于这座城（沿用 `FrostBrain`）。

一句话：**端侧管「挑和找」，云管「写」。** 端侧路径还带来隐私（个人偏好与相册不出端）、成本与离线三重收益 —— 这对 photos-agent 是硬约束：原图与相册永不出端，云永远拿不到原图。

## 8. 长期记忆
`memory` 从「会话级」扩展为「会话 + 画像」：个人偏好、阅读 / 观影 / 收听史、收藏与其向量表示。`curate` 与 `script` 都查询画像，使落点与叙述是为「这个人」整理的，而非通用生成。原始记录留端侧，只上送用于「写」的最小片段。

## 9. 演进路径 v2.0（增量，不重写）

1. 抽出 `Skill` 注册表，把 radio 收敛为一个 skill（intent / action / validator / data 都挂其名下），内核不再 `import RADIO_CITIES`。
2. 把 `tools:` 做成真实 Tool 注册表，按 `permissionMode` 授权；先落地 `read_user_library / read_album / web_search / geocode / mark_place`。
3. 统一动作词表到 `mark_place`，Boundary 增加去重与照片价值阈值校验。
4. 落地四个 agent（books / movies / music / photos）的运行时实现，契约已就位（`agents/*-agent/contract.md`）。
5. 新增 `Selector` 端侧接口（先用云 stub 占位），把 curate 的选择 / 打分改走 Selector。
6. 长期记忆从会话级扩到画像级，接入 curate 与 script。

## 10. 边界与口径

- 前端不保存模型密钥；密钥只从服务端环境变量读取。
- 子 agent 只输出动作建议，所有动作必过校验器。
- 模型不可用时，核心体验仍能通过规则与确定性逻辑运行。
- 个人数据（相册、阅读 / 观影 / 收听史）默认留端侧；端侧整理，只上送用于「写」的最小片段，原始数据不出端。
- 知识库语料不默认打包进前端，规避体积 / 版权 / 隐私风险。
- 资料层只检索整理合法、公开或授权素材；音乐层生成风格标签、候选歌单与播报串词，产品化时可接 Apple MusicKit、授权音乐库或用户自有音乐源。
