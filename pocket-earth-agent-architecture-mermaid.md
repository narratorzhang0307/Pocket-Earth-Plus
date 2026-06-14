# Pocket Earth · Agent 架构图 Mermaid 版

## 版本 A：通用 Agent 架构

```mermaid
flowchart TD
    U["用户 / 外部系统"] --> API["入口层<br/>Web / API / Chat UI"]
    API --> CTX["请求上下文<br/>身份 / 环境 / 权限 / 历史"]
    CTX --> ORCH["Agent 编排层<br/>Orchestrator / Shell"]

    ORCH --> ROUTER["Router<br/>规则快路由 / 语义路由"]
    ROUTER --> PLAN["Planner<br/>任务拆解 / 下一步动作"]

    MEM["Memory + State<br/>短期记忆 / 长期画像 / 任务状态"] -.注入.-> PLAN
    GUARD["Guardrails<br/>策略 / 权限 / 输出约束"] -.约束.-> ORCH

    PLAN --> LLM["LLM Brain<br/>理解 / 推理 / 生成"]
    LLM --> DECIDE["Decision<br/>回复 / 工具 / 子 agent / 结束"]

    DECIDE --> TOOL["Tools<br/>API / DB / 文件 / 搜索"]
    DECIDE --> SUB["Sub-agents<br/>研究 / 执行 / 评审 / 发布"]

    TOOL --> OBS["Observation<br/>工具结果"]
    SUB --> OBS
    OBS --> ORCH

    DECIDE --> BOUNDARY["Boundary<br/>suggest → validate → execute"]
    BOUNDARY --> EXEC["Execution<br/>动作落地 / 工作流"]
    EXEC --> STATE["Knowledge / Runtime State<br/>知识库 / 业务系统 / 本地状态"]
    STATE --> RESP["Final Response<br/>最终回复 / 可见结果"]
    RESP --> U

    ORCH --> TRACE["Trace + Metrics<br/>日志 / 健康 / 审计"]
```

## 版本 B：Pocket Earth 当前 frost-agent 架构

```mermaid
flowchart TD
    USER["用户一句话 / 一次操作"] --> UI["三 Tab 入口<br/>PHOTOS / EARTH / AGENTS"]

    UI --> SHELL["Shell · Frost 人格<br/>persona + HUMAN_VOICE"]
    SHELL --> ROUTER["Router · 混合路由<br/>指令秒回 / 端侧预分类 / 云脑路由 / 规则兜底"]

    ROUTER --> FAST["switch-handler<br/>播放 / 暂停 / 下一首 / 切城"]
    ROUTER --> EDGE_ROUTE["Edge Selector classify<br/>端侧预分类"]
    ROUTER --> CLOUD_ROUTE["Cloud Brain llmRoute<br/>DeepSeek 判意图 + 抽实体"]
    ROUTER --> REGEX["Regex fallback<br/>无模型也能跑"]

    MEMORY["Memory<br/>最近 6 轮对话"] -.注入.-> CLOUD_ROUTE
    PROFILE["Profile<br/>跨会话口味画像 + fingerprint 缓存"] -.只进云脑.-> CLOUD_ROUTE
    HEALTH["Health + Trace<br/>降级可观测 / thinking trace"] -.记录.-> ROUTER

    EDGE["端侧 Selector<br/>MNN → ollama → stub<br/>classify / rank / embed / vision"] --> EDGE_ROUTE
    BRAIN["云端 Brain<br/>/api/frost-llm → DeepSeek<br/>provider-compat"] --> CLOUD_ROUTE

    FAST --> REGISTRY["intentRegistry<br/>意图 → 处理器"]
    EDGE_ROUTE --> REGISTRY
    CLOUD_ROUTE --> REGISTRY
    REGEX --> REGISTRY

    REGISTRY --> MUSIC["music / radio agents<br/>open-dj / tour / 24H / deep-answer"]
    REGISTRY --> CHAT["books / movies / podcast 对话层<br/>AgentChat + 领域数据注入"]
    UI --> RUNPAGES["运行态 curator 页面<br/>photos / travel / planet / mood / council"]

    EDGE --> MUSIC
    EDGE --> RUNPAGES
    BRAIN --> MUSIC
    BRAIN --> CHAT
    BRAIN --> COUNCIL["council-room<br/>多 agent 圆桌回合引擎"]

    MUSIC --> ACTIONS["动作建议<br/>radioActions / mark_place"]
    CHAT --> ACTIONS
    RUNPAGES --> ACTIONS
    COUNCIL --> TRACE_OUT["transcript / trace"]

    ACTIONS --> BOUNDARY["Boundary · validator<br/>动作注册表 / suggest-then-validate"]
    BOUNDARY --> PLAYER["播放器 / 歌单队列"]
    BOUNDARY --> STORES["本地空间状态<br/>userMarks / planets / geoStickers"]

    STORES --> MAP["Mapbox Globe<br/>静态标记 + 用户落点 + 星球图层"]
    MAP --> RESULT["一颗会长大的个人知识地图"]
    PLAYER --> RESULT
```

## 口径摘要

- frost-agent 不是聊天机器人，而是主 Frost 编排子 curator 的 harness。
- 端侧 Selector 管「挑和找」：分类、排序、嵌入、视觉打标、照片价值打分。
- 云端 Brain 管「写」：叙事、推荐、回答、圆桌发言。
- 子 agent 只建议动作，所有落点和播放动作都必须经过 Boundary 校验。
- 所有地理产出最终汇入同一颗 Mapbox 地球：`userMarks`、`planets`、`geoStickers`。
