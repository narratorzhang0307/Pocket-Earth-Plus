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
| R1 | 2026-06-21 | correctness/robustness · lib+harness | workflow 24 找→13 确认全修：①movie cast 空值护栏 ②travel plan / enrich fetch 超时主动 abort（去重复 withTimeout 死码）③seasonOf 容错非零填充月份 ④照片 EXIF 复用免每张重复解析 ⑤无日期照片去重收窄（GPS 异地豁免 + 严阈 4）⑥mood 概览城市数过滤脏地名 + 恰好 2 地点也带第二处（MoodReview 复用同口径）⑦skillForge / heartbeat 存档损坏护栏 ⑧health 空串重载 ⑨多字节 UTF-8 chunk 边界中文损坏（viteEdge + server.mjs readBody）。build 净 + 11 文件 tsc 零新错 | 8e7f9de |
| R2 | 2026-06-21 | components · React correctness + 一致性文案 | 24 找→19 确认，应用 12 类修复：①文案统一「钉地球」（MarkerDetail/MoodReview/MusicAgentsTab·travel）②修过时注释（MyMapTab×2 / mapMarkers 七类颜色）③AGENTS 状态条计数 8→6（按 AGENTS 组 items 数，不再数混入 council/plaza 的 RUN_BY_NAME）④删不可达死分支 podcast/forge（import + Running 类型 + 两个 render 分支）⑤记一笔 confirm 加 in-flight 守卫 + try/catch（治 mood 双击重复落点 + 网络失败静默无反馈）⑥RunTrace 运行结束后停表（省已完成运行 5fps 空转重渲染）⑦端侧引擎面板挂载守卫 + finally（切走 tab 不再 setState、chat reject 不再锁死按钮）⑧删 Poem-Plant 死子树 4 文件（MyCityTab/MyGardenTab/EnvironmentDrawer/DiscoverTab）。defer 3：makeDrag cancel（热区重构有风险）+ 2 个 React18 下 no-op 的卫生项。build 净 + 无新 tsc 错 | 2eadf6c |
| R3 | 2026-06-21 | 死代码 / 未用 | 32 找→32 确认全删：删 3 孤儿文件（PodcastAgentPage/PodcastRunPage/SkillForgePage）+ 29 处未用 import/局部/类型/导出/死函数链——含 health(getHealth/subscribeHealth)、profile(clearProfile/subscribeProfile)、plays(getPlays/getTopPlayed/subscribePlays/addListenSeconds)、radio「落日」3 连死链(_localMinutes/currentSunsetCity/sunsetOrderedCities)、tour-director(pickSunsetCity+ringDist)、harness 未用谓词(hasIntentHandler/hasActionValidator/listProviders)、store(allMovies/allBooks)、structured(validateShape)、bus(emitChild)、memoryRouter(MEMORY_CAPTURE_RULES)、geoStickers(randomPlace)、persona(FrostPersona)、edgeSelector、若干未用 import/局部。build 净、无悬空引用（tsc 仅剩既有 Vite import.meta / Node Buffer 类型配置错，非本轮引入）。 | f1baaf2 |
| R4 | 2026-06-21 | 类型安全 | 1 找→1 确认（**强收敛信号**：correctness/safety 空间近枯竭）：profile.ts load() 把 domains 守卫从 `!p.domains` 收紧到「必须普通对象」——损坏/旧版 localStorage 存成 7/"x"/数组时回落 empty()，免 recordSignals 在原始值上 `domains[x] ||= {}` 崩（每次 pin/play 热路径、无上游 try/catch，会白屏）。与 heartbeat/skillForge 同款损坏存档护栏。build 净。 | cf87042 |
| R5 | 2026-06-21 | 跨轴最终打磨（perf/a11y/correctness/一致性/ux） | 14 找→7 确认全做：①**webllmEdge 关 Qwen3 思考模式** `extra_body:{enable_thinking:false}`（与 ollama/MNN 的 think:false 对齐）——浏览器端 Qwen 回复不再前缀 `<think>…</think>`，修好 rank 的 JSON.parse 崩 / classify 误匹配 / 「端侧试一句」漏推理过程（端侧 demo 路径的真 bug）②音乐播放条补真实城市封面图（对齐曲库 mini-player，原硬编码黑方块）③心情贴在地球尺度（zoom<6.5）也用六色情绪基调色 s.color（原硬编码玫红丢了「一眼读情绪分布」信号，card 白贴仍回落玫红保对比）④静态书藏书票详情补 country 字段（副标题「作者·国籍」与用户落点路径对齐）⑤MoodReview 删除键 + CouncilPage 返回键 + RunDrawer 关闭键 三个纯图标按钮补 aria-label（对齐全仓 a11y 规范）。build 净、无新 tsc 错。 | dace09f |
| R6 | 2026-06-21 | loop-until-dry 收敛确认（按关注点·全新角度） | 5 找→5 确认（**未收敛**：换关注点切分捞到 R1–R5 漏的真问题）：①**keyedStore 开库失败永久毒化数据**——dbp 缓存「resolve null」的 promise 且失败不重置，一次瞬时 IDB 失败后整会话照片/电影/读书索引 get/put/all 静默吞、写入悄悄丢；改成失败清 memo + onblocked 兜底（同 resolvePlace 不缓存瞬时故障 null 的纪律）②**/api/frost-llm 代理吞上游状态码**——server.mjs + vite.config 拿到上游 Qwen 429/5xx 仍恒返 200+空串，使 R5 给 enrichJSON 接的 withRetry 对真正的 Qwen 抖动/限流完全失效；改成 `if(!r.ok)` 透传上游状态码，重试才真正生效③sw.js 导航加 5s 弱网兜底（挂起连接先上已缓存壳、不 abort 网络，免白屏死等 OS 级 TCP 超时），SW v14→v15④TravelRunPage makePlan 补 try/catch/finally（唯一缺收口的 run 页，抛错不再卡 spinner + 消除 unhandled rejection）⑤MarkerDetail 电影无评分不再显示五颗空星（对齐书分支已有的 `!= null` 守卫）。build 净、无新 tsc 错。 | 0bae465 |
| R7 | 2026-06-21 | 安全隐私/LLM韧性/状态并发/编码/键盘（全新角度） | 18 找→11 确认全做：①**【HIGH·安全】/api/unsplash SSRF + UNSPLASH_KEY 外泄**——track URL 无 host 白名单，公网未授权可让服务器抓任意内网/云元数据 URL，并把真实 key 拼进出站请求泄漏给攻击者站点；改成只允许 `api.unsplash.com`(https)，**线上需部署 + 建议轮换 Unsplash key**②**【隐私】读书笔记 OCR 绕过脱敏收口**——直调 edgeSafe.vision 未过 redactText，OCR 原文(可能含身份证/手机号)被上云(enrichJSON)+持久化；补 redactText 补回「唯一收口」不变式③caseStore load 补数组 + verdict 校验（损坏存档不再让庭审中途崩）④withRetry 不再把用户取消(AbortError)当瞬时故障重试（超时 TimeoutError 仍重试）⑤照片钉 / ⑥心情贴 id / ⑦行程钉 三处并发或同毫秒撞 id → 重复钉 + 误删两条：重入守卫(ref) + 实时复查 + id 加随机尾⑧行程卡日期按补零比较排序（容错云脑返回的 '2026-6-9' 非零填充→日期范围不再反/错）⑨MarkerDetail 模态补 ESC 关闭 + ⑩关闭键 aria-label + ⑪RadioStage 进度条裸 div 补 role=slider/tabindex/aria-value（键盘可达）。build 净、无新 tsc 错。 | 8ff6d52 |
| R8 | 2026-06-21 | 资源泄漏/mapbox/并发/CSS/懒加载（全新角度） | 14 找→6 确认全做：①**【HIGH·可见】JOT 记一笔「已钉到地球」toast 错位 + 被底部 tab bar 遮挡**——根容器漏 `relative`、toast 漏 `z-50`（其余 5 个运行页都有）；补齐②**ensureHeavyMarkers 缓存 rejected promise**——一次瞬时 chunk 404/离线后电影·书标记整会话消失、不自愈；失败清缓存允许下次重试③AgentChat streamText 卸载时取消（清内部 interval、不再对死组件空跑约 90 次）④travel confirmArchive 重确认幂等回流（newlyPinnedCities：不再把已钉城市重复计进长期画像）⑤RadioStage 卸载拆 Web Audio 图（关 AudioContext，免反复进出累积到浏览器 6 个上限）⑥MarkerDetail 长拉丁标题加 break-words+min-w-0（不再溢出撑破卡片/挤出关闭键）。build 净、无新 tsc 错。 | d8142d6 |
| R9 | 2026-06-21 | demo 上镜打磨（首屏/空态/加载/错误态/视觉，全新角度） | 24 找→13 确认全做：①MyMapTab 统计条 MARKERS 懒加载期间带「…」、懒加载失败也置 markersReady（避免永久省略号）+ 放大后拍立得缩略图 `<img>` 补 onError 淡出（OSS 抖动不留破图）②记一笔 mood 无地名兜底文案「此处」→「未定位·暂落地图」（坐标不动、不谎称就近）③UniversalCapture 意外抛错补 toast +「跑完无结果」失败引导卡（保留轨迹树+「再记一笔」，不留孤悬空白）④RadioStage hero/mini 封面补 onError + RadioChat 接 chatBusy 显「FROST 正在想…」（云端往返不再静止像卡死）⑤MusicAgentPage 右 tab「Frost_Music」→「对话」⑥CouncilPage 抽 headcount（法庭未手选庭长时 +1，「N 人」与台上发言数一致）+ 裁断卡补正/反方结构化论据渲染（原只存盘未展示）⑦AgentForge pinMsg 升 {text,ok}（失败不再误用绿色成功色）+ 建图一无所获补中性空态卡⑧PhotosAgent 示例页假进度「端侧整理中…」→「示例载入中…」（不把 mock 说成端侧实算）。build 净、9 文件零新 tsc 错。 | 6660dcb |
