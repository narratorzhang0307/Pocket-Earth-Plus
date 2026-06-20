# Frost Agent · 设计框架 v2.0

`frost-agent` 是 Pocket Earth 的内核：一个**把地球作为方法**的个人知识整理 agent。一个总 frost-agent 作为主 agent，把用户的书、电影、音乐、照片这些个人对象，委派给专门的 agent 子 agent；每个 agent 端侧整理、定位，产出 `mark_place` 落点建议，经 Boundary 校验后钉到地球，让地图长成一张属于「这个人」的知识地图。

底层是一套可插拔的多 agent Harness：统一接收自然语言，路由到专门的子 agent，生成带「人格声音」的回复、可见的 thinking trace 与结构化动作建议，再由 Boundary 校验后执行。

- **零运行时 npm 依赖**：harness 与 agents 都是纯 TypeScript 逻辑。
- **数据可注入**：默认不内置任何数据，宿主注入。
- **模型可插拔**：默认 stub brain；注入 `httpBrain` 即接真实 LLM，无 key 时自动规则兜底。
- **端侧优先**：选择 / 打标 / 价值打分这类「挑和找」走端侧，个人数据（尤其相册原图）不出端。

> v2.0 目标架构（Router → Skill → Sub-agent → Tool，主 frost-agent 编排四个 agent，端侧 + 云双速模型）见 [ARCHITECTURE.md](ARCHITECTURE.md)；落到架构里的子 agent 工程原则见 [HARNESS-PRINCIPLES.md](HARNESS-PRINCIPLES.md)。

> 这是设计框架代码 + 契约文档，radio 是其中一类对象的处理方式，不是 frost-agent 的全部。

## 1. 能做什么

| 能力 | 子 agent | 说明 |
|---|---|---|
| 播放控制 | `agents/switch-handler` | “下一首 / 上一首 / 暂停 / 继续 / 切到某城”等明确命令，不调用 LLM |
| 巡游编排 | `agents/tour-director` | 按城市时区计算此刻最临近日落的城市与巡游顺序（纯逻辑） |
| 开放式 DJ | `agents/open-dj-director` | 把书、作者、心情、场景转成声音需求，生成跨城歌单 |
| 24H 编排 | `agents/radio-24h-director` | 从现在到午夜逐城择歌，生成节目表与理由 |
| 文化问答 | `agents/deep-answer` | 城市/作者/作品/曲目背后的问答；Brain/RAG 接入位 + fallback |
| 闲聊陪伴 | `agents/chitchat` | 接住打招呼、情绪表达和随口聊天 |
| 通用兜底 | `agents/general` | 处理无法归类的问题，自然引导回核心能力 |
| 可见 trace | `AgentResult.trace` | 暴露路由、委派、策展过程，让判断过程可见 |

每个 runtime 子 agent 返回统一结构：

```ts
AgentResult<T> = {
  agent: string;
  reply: string;          // 用户听见的「人格声音」
  data: T;                // UI 可渲染的结构化结果
  radioActions: RadioAction[]; // 动作建议（执行前必过 validator）
  trace?: string[];       // 可见的委派过程
}
```

支持的动作建议（仅为建议，执行前必须经 `harness/validator.ts` 校验）：

```ts
{ type: 'switch_city'; slug: string }
{ type: 'play' } | { type: 'pause' }
{ type: 'next_track' } | { type: 'prev_track' }
{ type: 'set_playlist'; trackIds: string[] }
```

## 2. 运行链路

用户输入进入 `runFrost(ctx)` 后：

1. 宿主传入 `FrostContext`：当前时间、当前城市、用户文本、最近对话。
2. `router.ts` 先用 `switch-handler` 做快速正则匹配。
3. 命中明确命令 → 立即返回，不动用模型。
4. 否则 `llmRoute.ts` 经可插拔 Brain 判断 intent 并抽取城市。
5. Brain 不可用 / 返回空串 → Router 用正则兜底路由。
6. 按 intent 委派到对应子 agent。
7. 子 agent 返回 reply / data / radioActions / trace。
8. `validator.ts` 校验动作类型、城市 slug、歌单非空。
9. 宿主只执行通过校验的动作，并展示回复与 trace。

```text
User text
  -> runFrost(ctx)
  -> switch-handler 快速路径
  -> llmRoute 经 Brain
  -> 正则兜底（Brain 不可用时）
  -> dispatch 到子 agent
  -> AgentResult
  -> validateActions(radioActions)
  -> 宿主 UI / 播放器
```

### Harness 三层

| 层 | 文件 | 作用 |
|---|---|---|
| Shell | `harness/persona.ts` | 对外人格与声音；用户始终听见统一人格，而非内部子 agent |
| Brain | `harness/router.ts`, `llmRoute.ts`, `brain.ts`, `httpBrain.ts` | 混合路由、LLM 接口、模型代理与 fallback |
| Boundary | `harness/validator.ts` | 校验所有动作，防止子 agent 越权执行 |

短时记忆由 `harness/memory.ts` 处理：最近若干轮对话格式化后传给 Brain，保证同一会话不前后割裂。
领域模型在 `harness/domain.ts`：定义 `RadioCity` / `RadioTrack` 类型与可注入的 `RADIO_CITIES`。

## 3. 集成方式

### 3.1 调用核心入口

```ts
import { runFrost } from './harness/router';

const res = await runFrost({
  now: new Date(),
  userText: text,
  citySlug,
  history,
});
// res.reply / res.trace / res.data / res.radioActions(已过 validator)
```

### 3.2 注入真实 Brain

默认 stub brain 不调用模型。要接真实 LLM，在启动时注入：

```ts
import { setFrostBrain } from './harness/brain';
import { httpBrain } from './harness/httpBrain';

setFrostBrain(httpBrain);
```

服务端需提供 `/api/frost-llm`（dev 用 vite middleware，prod 用 Node API）；密钥只从服务端环境变量读取（如 `DASHSCOPE_API_KEY`），不进前端 bundle；无 key / 失败时返回空串，agent 自动走 fallback。

### 3.3 数据源

城市/曲目库由 `data/radio.ts` 经 `import.meta.glob` 从 `resource-library/cities/*.json` 自动加载（私有数据不入库；缺失时为空数组，agent 走规则 fallback）。放好 JSON 即驱动整条链路：

```ts
import { RADIO_CITIES, resolveTracksByIds } from './harness/domain'; // 等同 data/radio
// 每城 JSON 至少需要 slug / cityName / ianaTz|tzOffset / station / cover / tracks
```

`tour-director`、`radio-24h-director` 依赖时区与曲目；`open-dj-director` 依赖跨城曲库；`deep-answer` 可用城市文稿做 fallback。

### 3.4 扩展一个新子 agent

1. 在 `agents/<agent-name>/` 写 `contract.md`（职责 / 触发 / 输入输出 / 边界）。
2. 实现 `index.ts`，返回统一 `AgentResult<T>`。
3. 如需新 intent，扩展 `harness/types.ts` 的 `FrostIntent`。
4. 在 `harness/router.ts` 增加 dispatch 分支。
5. 如需 LLM 路由，在 `harness/llmRoute.ts` 的 prompt 与 allowed intent 中加入新类型。
6. 新增动作则先扩展 `RadioAction`，再更新 `validator.ts`。

原则：子 agent 只**建议**动作、不直接改播放器状态；对外始终保持统一人格。

## 4. 子 agent 清单

每个子 agent = 一个自包含文件夹：`contract.md`（职责/边界/输出契约）+ 实现。

| 子 agent | 职责 | 类型 | 状态 |
|---|---|---|---|
| `switch-handler` | 换歌 / 暂停 / 继续 / 上下首 / 切城等明确指令 | 运行时 · 纯逻辑 | 已落地 |
| `tour-director` | 算此刻哪座城在日落、巡游顺序、何时切城 | 运行时 · 纯逻辑 | 已落地 |
| `open-dj-director` | 把书、心情、场景抽象成声音需求，生成歌单 | 运行时 · LLM 增强 + fallback | 已落地 |
| `radio-24h-director` | 一键生成从现在到午夜的节目表 | 运行时 · 纯逻辑综合判断 | 已落地 |
| `deep-answer` | 城市 / 作者 / 作品 / 曲目文化问答 | 运行时 · Brain/RAG 接入位 + fallback | 已落地 |
| `chitchat` | 闲聊和情绪陪伴 | 运行时 · LLM 增强 + fallback | 已落地 |
| `general` | 通用兜底，处理未知或宽泛问题 | 运行时 · LLM 增强 + fallback | 已落地 |
| `music-pipeline` | 曲目目录、音频 URL、`audio.db` 写回 | 离线流水线 | 部分落地 |
| `script-tts-pipeline` | DJ 文稿口语化、TTS 音频、字幕、写库 | 离线流水线 | 部分落地 |
| `writer-book` | 本地书/笔记抽取分块，形成 RAG 语料 | 离线流水线 | 分块落地，向量检索待接 |

v2.0 新增的 agent 子 agent（把个人对象钉到地球，契约就位、待实现）：

| 子 agent | 职责 | 端侧 / 云 | 模式 | 状态 |
|---|---|---|---|---|
| [`books-agent`](agents/books-agent/contract.md) | 把读过的书钉到故事地/作者地 + 读完日期；信息不全联网补全 | 端侧抽取 + 联网补 + 云写 | 流水线型 | 契约就位 |
| [`movies-agent`](agents/movies-agent/contract.md) | 把看过的电影钉到取景地/故事地 + 观看日期 | 端侧整理 + 联网补 | 执行型 / 流水线型 | 契约就位 |
| [`music-agent`](agents/music-agent/contract.md) | 把听过的音乐钉到歌手出身地/歌曲城市 + 收听足迹 | 端侧选择聚类 + geocode | 流水线型 | 契约就位 |
| [`photos-agent`](agents/photos-agent/contract.md) | 端侧整本相册打标打分，只把高价值照片钉到地球 | 全端侧（原图不出端） | 执行型 | 契约就位 |

## 5. 设计原则与边界

- 前端不保存模型密钥。
- 子 agent 不直接控制播放器，只输出 `radioActions` 建议。
- 所有动作必须经 `validator.ts`。
- 模型不可用时，核心体验仍能通过规则与确定性逻辑运行。
- RAG 语料不默认打包进前端，规避体积 / 版权 / 隐私风险。
- 所有子 agent 对外统一成一个人格声音，不向用户暴露内部模块名。
