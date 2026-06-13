# frost-agent v2.0 子 agent 工程原则（提炼自《Harness 工程之道》第 4 章）

下面 13 条原则，每条按「原则 → 在 frost-agent v2.0 里怎么落地」组织。落地部分直接对应现有四层架构（Router → Skill → Sub-agent → Tool）及跨层能力（云 Brain · 端侧 Selector · 长期记忆 · Boundary）。

---

## 1. 上下文隔离换信噪比：让噪声死在子 agent 里

**原则**：子 agent 拥有独立上下文窗口，读到的文件、命令输出、中间推理全部封锁在其内部，只把提炼后的结论回流主对话。这是舱壁模式（Bulkhead），从根本上解决主对话信噪比下降与「注意力稀释」。

**在 frost-agent v2.0 里怎么落地**：`research` / `curate` 角色是天然的噪声重灾区——`research` 要吞 web 抓取与 PDF 全文，`curate` 要扫整个候选池。这些原始素材绝不能进 `persona.ts` 维护的主对话。每个子 agent 在独立上下文里消化原料，只向主对话回传结构化结论（如「已入库 8 段，3 段需人工复核」）。主对话因此始终干净，长会话也不会因噪声触发上下文压缩而丢掉用户记忆与项目约定。

---

## 2. 工具白名单 = 物理边界，不是 prompt 里的请求

**原则**：每个子 agent 配一份工具白名单，未列出的工具（Edit / Write / Bash）对它不可见、不可调用。这是最小权限原则的物理实现，不依赖「请不要修改文件」这类易被忽视的措辞。`permissionMode: plan` 再加一道系统级只读保障。

**在 frost-agent v2.0 里怎么落地**：第 4 节缺口明确指出「`contract.md` 里的 `tools:` 目前只是文档，没有真正的工具注册表」——这正是必须补的洞。把 `tools:` 做成真实函数注册表（演进路径第 2 步），按 `permissionMode` 授权：`research` 拿 `web/PDF` 检索 + `read_kb`（只读）；`curate` 拿 `edge-select` + `user-memory` 读取，但拿不到 `notion`/`map` 写入；只有 `publish` 才被授予写入工具。这样即便 Brain 误判意图，curate 也物理上无法写 Notion。

---

## 3. model 字段是成本/隐私杠杆 —— 对应端侧 Selector vs 云 Brain

**原则**：model 是被低估的成本杠杆。格式检查、日志过滤、分类这类模式化任务用轻量模型（Haiku 级）即可，深度推理与生成才用高性能模型（Sonnet/Opus）。「不需要聘请首席架构师来跑单元测试。」

**在 frost-agent v2.0 里怎么落地**：这把杠杆在 frost-agent 里被升级为「双速模型」这条架构主轴：端侧 `Selector` 管「挑和找」（选歌/选图/选书/意图预分类/RAG 检索），云 `Brain` 管「写」（叙事/文化抽象/播报串词）。每个子 agent 的契约应显式声明走哪条路：`curate` 的排序走 `Selector.rank()`，`script` 的串词生成走 `Brain.complete()`。端侧路径不仅省成本，还带来隐私（个人偏好与相册不出端）与离线两重收益——这是纯 model 选型给不了的。意图预分类用端侧小分类器挡在云路由之前，长尾才落到云。

---

## 4. 执行型模式：海量输入 → 极少输出，正好是照片整理

**原则**：执行型子 agent 是日常最常用模式，核心是「信噪比优化」：输入海量（数百行/数千文件），只输出精炼结论（几行）。设计核心是对输出格式的严格约束——「禁止包含完整日志，仅输出摘要」。这是外观模式（Facade）。

**在 frost-agent v2.0 里怎么落地**：`photos-curator`（相册整理）就是教科书级执行型场景：输入是上千张照片的端侧图文匹配（CLIP 类）结果，输出只是「为这次行程选出的 6 张 + 每张一句地点标注」。落地要点有两条：一是匹配/排序全部走端侧 `Selector`，原始照片与 embedding 不出端、不进主对话；二是在该子 agent 的契约里把 `Output` 钉死成结构化摘要（选中项 + 理由 + 地点锚点），严禁回传整个候选池的打分明细。主对话只见到那 6 张的结论。

---

## 5. 流水线型 + 交接契约（Handoff Contract）：对应书籍信息补全

**原则**：流水线型适用于有明确阶段依赖的任务（定位→修复→验证→报告），每阶段输出即下阶段输入，顺序不可颠倒。可靠运行的基石是**交接契约**：每阶段输出格式必须与下阶段输入要求严格匹配（如 bug-locator 的「根本原因文件」「修复方向」恰是 bug-fixer 的必需输入）。这是责任链模式 / Unix 管道。各阶段工具权限还随职责动态收紧。

**在 frost-agent v2.0 里怎么落地**：书籍信息补全是天然流水线，对应现有 `writer-book`：`research`（探资料→知识库，工具=web/PDF/read_kb，只读+写库）→ `curate`（在候选书目/段落上选择排序，工具=edge-select+user-memory，只读）→ `script`（生成结构化条目与播报稿，工具=Brain）→ `publish`（写 Notion/地图，唯一持写入权）。关键是为每对相邻角色定义交接契约：`research` 必须输出带稳定字段的知识条目（如 `{title, author, source_url, geo_anchor, summary}`），否则 `curate` 无法排序、`publish` 无法挂回地图。契约写进各自 `contract.md` 的 `Output` 段，并随阶段动态收权（只有 `publish` 能写）。

---

## 6. 并行型模式：多个 curator 同时跑，前提是子任务完全独立

**原则**：当需要从多个独立维度剖析同一对象时用并行型（MapReduce）。严格前提：子任务之间无共享状态、无依赖。主 agent 做 Map（分发）+ Reduce（汇总）。优势是专业化——3 个「专才」在各自维度做到 90 分，胜过一个「全能」70 分。

**在 frost-agent v2.0 里怎么落地**：批量整理个人对象时，可并行派出多个 curator：`music-curator`（音乐）、`photos-curator`（照片）、`books-curator`（书）、`movies-curator`（电影）。它们查同一个用户画像但互不依赖、不共享中间状态，可真正并行跑，由主 agent（Router 层）在 Reduce 阶段汇总成一份挂回地球的综合视图。落地约束：并行的前提是这些 curator 之间没有交接契约依赖——一旦出现「必须先选完书才能选配乐」这种依赖，就退回流水线型，不要硬并行。（未来可新增的 curator，如 `city-walk`、`museum-curator`，同理注册即并入。）

---

## 7. 子 agent 定义 Who/What/Where/Output，Skill 定义 How/Standard

**原则**：清晰的职责划分——子 agent（.md 契约）负责战略层：Who（身份）、What（任务）、Where（工作边界）、Output（交付形式）；Skill（SKILL.md）负责战术层：How（流程步骤）、With What（脚本/模板）、By What Standard（规范）、Quality（验收标准）。子 agent 是知识的灵活消费者，Skill 是可迁移的知识模块。

**在 frost-agent v2.0 里怎么落地**：现有 `contract.md` 已经写了 Who/What/Where/Output——保留并坚持这条边界。把「方法与标准」从契约里剥出来做成可插拔 Skill manifest：例如一份 `geo-anchoring` Skill 定义「如何把对象挂回地球某地点」的标准流程与字段规范，`research`/`curate`/`publish` 都可消费同一份 Skill；一份 `poem-style` Skill 定义播报串词的语气与模板，被 `script` 加载。这样新增 `museum-curator` 时，子 agent 只声明「我是谁、产出什么」，方法直接装配现成 Skill，注册即用、不改内核。

---

## 8. 报文传输而非共享内存：主 agent 显式搬运结论

**原则**：子 agent 之间无法直接通信——每个只能拿到主 agent 显式传递的内容，看不到主对话历史，也感知不到其他子 agent。这是「报文传输」不是「共享内存」。所以每阶段输出必须高度结构化，主 agent 才能准确提取并转发。

**在 frost-agent v2.0 里怎么落地**：第 5 条的流水线之所以能跑，靠的就是这条机制。`research` 的知识条目不会自动流到 `publish`——必须由 Router/主 agent 把 `research` 的 `Output` 提取出来、嵌入 `publish` 的任务描述。这对 frost-agent 的「trace 一等输出」是加分项：搬运动作本身就是可见的委派轨迹。设计要求：所有子 agent 的 `Output` 必须是机器可解析的结构（JSON/固定字段），禁止回传自由散文,否则主 agent 无法可靠转发,流水线断裂。

---

## 9. 嵌套 ≤ 2 层，超过即重新分解任务

**原则**：子 agent 可相互调用且模式可组合（流水线某阶段内嵌并行），但嵌套建议控制在两层以内。每加一层都加剧信息损耗、调试难度指数上升。需要 3 层以上嵌套通常是信号：任务分解方式有缺陷，应扁平化为并行或流水线。

**在 frost-agent v2.0 里怎么落地**：允许的组合，例如 `research` 阶段内部并行派 `web-fetcher` 与 `pdf-extractor`（这是第 1 层流水线 + 第 2 层并行，到顶）。要警惕的是把「Skill 派生子 agent（context:fork）」再嵌进已经两层深的流水线，悄悄变成三层。Router 应对委派深度设硬上限 2；若某个 skill 的编排逻辑需要更深，说明该 skill 的子 agent 角色划分（research/curate/script/publish 四角色）粒度不对,应重新切分而非加深嵌套。

---

## 10. Token 经济学：输入 >> 输出才委派，输入≈输出就别委派

**原则**：无状态 API 每轮都重传全部上下文历史，噪声会被反复传输 N 次。委派的决策准则是输入/输出体量比——高价值场景（输入 >> 输出，如数百行日志提炼 5 行）才用子 agent；低价值场景（输入≈输出，如改一个函数）直接在主对话做更划算。注意 Prompt Caching 会削弱纯成本收益，但上下文窗口保护与响应质量提升是缓存替代不了的。

**在 frost-agent v2.0 里怎么落地**：给 Router 一条委派启发式——比较候选任务的输入/输出比。`research`（吞整本 PDF、整批网页）、相册整理（吞上千张图）属于高价值场景，必须隔离。而「把已选好的一段串词润色一句」这种输入≈输出的轻任务，直接走主对话 + 云 Brain，不要为它新起子 agent 承担通信开销。把这条判断显式写进 Skill manifest 的路由规则里,避免对每个动作都无脑委派。

---

## 11. 中断恢复：长任务把中间产物持久化到文件

**原则**：子 agent 若因网络波动或手动终止而中断，内存中的中间成果会丢失。对耗时长或关键的任务，让子 agent 把中间产物持久化到文件（如 `.claude-work/log-analysis.md` 记录已分析区间与发现）；重启时新子 agent 先读该文件、定位断点、续作，避免从头重来。

**在 frost-agent v2.0 里怎么落地**：`research` 探索一座城市/一本书可能跑很久且依赖外部网络，最该上持久化检查点。约定一个工作目录（如 `.frost-work/<skill>/<object>.progress.md`），`research` 边抓边写已入库条目与游标；中断后重启的子 agent 先读进度文件,从断点续抓,而不是重抓全网。这条与现有「全链路降级」精神一致：把不确定的外部依赖产生的状态落到确定性的磁盘上。`publish` 同理——已发布到 Notion 的条目要记账,避免重复发布。

---

## 12. description 是路由广告牌：让 Router 能语义匹配并自动委派

**原则**：子 agent 的 `description` 是「广告牌」，是主 agent 任务路由的核心依据。主 agent 扫描所有已注册子 agent 的 description，按用户意图与描述的语义相似度自动委派，无需用户显式点名。

**在 frost-agent v2.0 里怎么落地**：这正对应第 3.1 节 Router 升级——「先选 Skill，再在 skill 内路由」。每个 skill 的 manifest 声明意图集，每个子 agent 契约里写清晰的 `description`，让端侧意图分类器先做粗选 skill、再在 skill 内按 description 语义匹配选子 agent。规则快路由先挡明确指令（「放电台」），自然语言长尾才交给语义匹配。description 写得准，才能既享自动委派的便利，又不误派。

---

## 13. 一切动作过校验器：委派权与执行权分离

**原则**（衔接最小权限 + 流水线动态收权，落到 frost-agent 的既有资产上）：子 agent 即便被授予写入工具，其产出也应是「动作建议」，由独立的校验环节决定是否真正落地——把「想做什么」与「准许做什么」拆开，构成主系统的安全防火墙，单个子任务的混乱或幻觉不污染、不破坏全局。

**在 frost-agent v2.0 里怎么落地**：保留并泛化现有「只建议、后校验」边界（第 4.3 节）。每个 skill 注册自己的动作词表 + 校验器（取代单一 `RadioAction`/`validator`），内核统一在动作落地前调用。即 `publish` 子 agent 输出的是「拟写入 Notion 的条目建议」，必须过该 skill 的校验器（字段完整性、地图锚点合法、版权/隐私口径）才真正写入。这样工具白名单管「能调用什么」，校验器管「调用结果准不准落地」,两道闸叠加,即便子 agent 幻觉出一个不存在的地点也会被挡在发布之前。

---

**覆盖核查**：上下文隔离与信噪比(1)、工具白名单最小权限(2/13)、model 作为成本/隐私杠杆=端侧 Selector vs 云 Brain(3)、5 种模式——执行型=海量输入→极少输出=照片整理(4)、流水线型+交接契约 Handoff Contract=书籍信息补全(5)、并行型=多 curator 同时跑(6)、只读型与团队型作为模式谱系两端在(4/6/9)中带出、子 agent 定义 Who/What/Where/Output 而 Skill 定义 How/Standard(7)、报文传输非共享内存(8)、嵌套≤2(9)、Token 经济学(10)、中断恢复持久化(11)，均已落点到 frost-agent 现有四层架构与演进路径。

源文件：`/tmp/book-ch4.txt`、`/Users/zhangcheng/Desktop/Pocket Earth/frost-agent/ARCHITECTURE.md`