---
name: add-curator-agent
description: 加一个新的「整理器」curator agent（把某领域对象钉到地球：咖啡馆/演唱会/餐厅/展览…）。当用户说"加个 X 整理器 / 新 curator / 仿照 movie 做个 X agent"时用。六层骨架，每层尽量调现成 skill，curator 只写领域配置。Not for：用户自定义的轻 agent（走造物主 AgentForge manifest 声明式生成，零代码）、非"钉地球"类 agent。
allowed-tools:
  - Read
  - Grep
  - Glob
  - Edit
  - Write
  - Bash(npm run build:*)
  - Bash(node:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git push:*)
---
# 加一个 curator agent（把某领域对象钉地球）

**参考型 skill**：指导"在 `src/app/lib/<域>/` 建一个六层整理器"的标准流程。范本看 `src/app/lib/movie/`（最完整）。

## 先决：要 curator 还是造物主 manifest？
- **轻 / 用户自定义 / 字段少** → 不写代码，走**造物主**（AgentForge）：声明 `domain + tagFields + geoStrategy`，由 `agent/engine.ts` 的 `runCustomAgent` / `runCustomAgentFromImage` 跑。**优先这个**。
- **一等领域 / 要本地库 / 要专属 UI 与更重逻辑** → 才用本 SOP 建六层 curator。

## 六层骨架（每层调现成 skill，curator 只写领域配置）
| 层 | 文件 | 调哪个 skill | curator 只写（领域配置）|
|---|---|---|---|
| 类型 | `types.ts` | — | `Tags ⟂ GeoTarget` 两条正交输出 + `Draft` + `Input`；`GeoKind` 领域专属 |
| 感知 | `sense.ts` | `parseInput`（一句话）/ `visionExtract`（截图）| domain 名、字段 schema、噪声词 |
| 本地库 | `catalog.ts` | `matchCatalog` | 本地数据 + 记录类型（可选，有锚点数据才建）|
| 记忆 | `store.ts` | `keyedStore` + `correctionsStore` | 库名(`pe-xxx`)、实体类型 |
| 云脑 | `tagging.ts` | `enrichEntity` | 补全 prompt/schema、`geoResolve` 策略 |
| 反思 | `critic.ts` | `draftCritic`(clampDraft/clampYear/applyUserFix/mergeKnown) | 领域护栏 + 落点 `geo.kind` |
| 落点 | `pin.ts` | `markPlace` + `resolvePlace` | kind→颜色/标签、meta 拼装 |
| 编排 | `agent.ts` | 串以上 | 六步流水线（见下）|

> skill 速查见 `src/app/lib/skills/README.md`（路由器）。新增的领域无关能力按 [[extract-skill]] 抽。

## 编排流水线（agent.ts 的形状，照 movie/agent.ts）
```
感知 sense → ② 本地库 matchInCatalog → ③ 本地索引 getKnown + mergeKnown
→ ④ 云脑补全(缺标签且没补过才调 enrich) → ⑤ 地理 geoResolve → ⑥ 校验 applyCritic+applyUserFix
→ 产出 draft(suggest, 未钉, needsConfirm)
```
确认才钉：`pin.ts` 的 `confirmPin` 走 `markPlace`。

## 必守的几个模式
- **建议→确认才落地**：agent 只产 `draft`（未钉），`needsConfirm` 低置信/纯手填/无坐标时为真；用户确认才 `markPlace`。
- **舱壁**：单级失败降级、**不抛错**（云脑挂了保留已有、端侧没就绪走手填）。
- **Tags ⟂ Geo**：内容标签与落点是两条**正交**输出，别耦合。
- **幂等记忆**：看过/钉过的重跑 `getKnown` 命中即复用，不重调云脑。
- **原图只进端侧**：截图认对象走 `visionExtract`（原图不出端），见 skills/README「端侧看图两条线」。

## 验证 + 提交
- `npm run build` 净 + 纯逻辑 `node` 单测；UI 改动见 [[verify-in-preview]]。
- `[Plus]` 前缀、只 add 自己文件、推私有 origin；**绝不碰公开仓库**；避开热区（见 [[extract-skill]] 红线）。
- 默认纯新增不部署；要上线见 [[deploy-pocket-earth]]。
