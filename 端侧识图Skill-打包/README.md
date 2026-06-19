# 端侧识图 → 结构化 Skill（visionRead / visionExtract）

一套**两层、可独立移植**的端侧 skill：**给一张图，端侧把它读懂，整理成结构化数据**——原图一个字节都不出设备。

它是「为什么必须端侧」的一个样板能力，也演示了一种**用端侧能力搭 skill 的方式**：能力做成可注入的接口、领域差异做成参数、隐私在数据流里硬约束、底层原语收口一处。在我们的应用里，电影 / 书 / 旅行 / 用户自建的任意「整理器」agent 都已接入同一套 skill。

## 包内文件

| 文件 | 作用 |
|---|---|
| `visionRead.ts` | **底层原语**：原图 → 端侧视觉 → 脱敏文本。「原图只进端侧」隐私边界 + 脱敏正则的唯一收口 |
| `visionExtract.ts` | **高层**：`visionRead` + 结构化 → 扁平字段 JSON。schema 由调用方传入 |
| `example.ts` | 三种 agent 的接入示例（电影单字段 / 旅行纯文本 / 自建 agent 多字段），换两个 stub 即可跑 |
| `技术说明-端侧必要性与skill构建方式.md` | 方案/可行性文档可直接取用的一节 |
| `README.md` | 本文件 |

---

## 一、为什么这件事「必须端侧」（云替代不了）

用户的截图/相册里常含敏感信息：票据、票根、证件号、手机号、定位、二维码。要把图变成结构化数据，绕不开"先读图"这一步。关键在边界划在哪：

```
一张图 ──① 端侧视觉读图──▶ 文本 ──正则脱敏──▶ ② 结构化(端侧优先/可回退云)──▶ 结构化数据
        原图只在这一步、只进端侧        敏感号 ***          原图全程不参与第②步
        【原图一个字节都不出设备】
```

- **隐私**：第①步读图只把原图交给端侧视觉模型（Qwen-VL，经 MNN / 浏览器 WebGPU），**原图不出端**。没有端侧，就只能把原图传云——那等于把用户的票据/证件原图交出去。这是云做不到的。
- **离线 / 低延迟**：图就在设备上，端侧直接读，不依赖网络往返、不传大图。
- **核心逻辑本地 + 云协同**：读图（核心、含隐私）在端；只有端侧读出并**脱敏后的纯文本**才按需交给云做结构化。原图永不上云。
- **诚实降级**：端侧视觉未就绪时返回 `visionVia:'none'`，宁可让用户手填，**也绝不把原图送云**。降级本身就守住了隐私。

> 这是「必要级」而非「优化级」理由——不是"端侧更快更省"，而是"没有端侧就做不到（做了就泄露隐私）"。

---

## 二、两层架构

把识图拆成两层，让"原图只进端侧"这条线收口到唯一一处，上层只跟脱敏后的文本打交道：

```
                       ┌─ 电影认片（单字段）─┐
                       ├─ 书认书（单字段）  ─┤→ visionExtract ─┐
   用户自建 agent（多字段）┘                                  │ ① 调
                                                            ▼
   旅行票据（要纯文本，自己做嵌套结构化）──────────────▶ visionRead ──▶ 端侧视觉模型
                                                            （原图只到这里 + 脱敏唯一一份）
```

- **`visionRead`（底层原语）**：原图 → 端侧视觉 → 脱敏文本。隐私边界与脱敏正则**只此一份**。
- **`visionExtract`（高层）**：`visionRead` + 结构化 → 按 schema 的扁平字段。

**怎么选哪一层**：
- 要**纯文本**、之后自己做领域专属/嵌套结构化（如旅行行程含多段行程/多段住宿/多个景点）→ 用 `visionRead`。
- 要**扁平结构化字段**（片名 / 导演 / 物种 / 城市…）→ 用 `visionExtract`。

---

## 三、多个 agent 怎么接入（同一套 skill，各传自己的接口与 schema）

| agent | 用哪层 | 传入的 schema / 原因 |
|---|---|---|
| 电影认片 | `visionExtract` | `[{title:'片名'}]`，取 `fields.title` |
| 书认书 | `visionExtract` | `[{title:'书名'}]` |
| 用户自建 agent | `visionExtract` | 直接传它声明的字段表 → 白得"拍图入库"、零改 skill |
| 旅行票据 | `visionRead` | 行程是**嵌套**结构（segments/stays/spots），扁平字段套不进 → 取纯文本后自己 `structureTrip` |

完整代码见 `example.ts`。新增一个领域 = 传一份新 schema，**不改 skill**。

---

## 四、接口契约

```ts
// —— 底层 visionRead ——
interface VisionReadDeps { visionOnDevice: (imageDataUrl: string, prompt: string) => Promise<string> }  // 唯一接触原图处
interface VisionReadOptions { max?: number; redact?: boolean }
function visionRead(imageDataUrl: string, prompt: string, deps: VisionReadDeps, opts?: VisionReadOptions): Promise<string>

// —— 高层 visionExtract ——
interface FieldSpec { key: string; label: string; hint?: string }
interface VisionExtractDeps extends VisionReadDeps { structure: (prompt: string) => Promise<string>; structureOnDevice?: boolean }
interface VisionExtractInput { imageDataUrl: string; domain: string; fields: FieldSpec[]; redact?: boolean }
interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果
  raw: string;                               // 端侧读出并脱敏后的文本
  ok: boolean;
  visionVia: 'edge' | 'none';                // 视觉永远端侧
  structuredVia: 'edge' | 'cloud' | 'none';  // 单字段兜底时为 'none'
  onDevice: boolean;                         // 是否全程未上云
}
function visionExtract(input: VisionExtractInput, deps: VisionExtractDeps): Promise<VisionExtractResult>
```

---

## 五、推荐端侧模型

- **视觉（visionOnDevice）**：Qwen3-VL-2B / 4B。
- **结构化（structure）**：Qwen3.5-0.8B / 2B / 4B（端侧）；也可回退云 qwen-plus（**只过脱敏文本**）。
- **端侧框架**：MNN（Arm SME2 加速）；浏览器侧可走 WebGPU。

---

## 六、设计要点 / 问答

1. **为什么用依赖注入，而不直接写死模型调用？** 让"端侧"成为一个可替换的后端——换 MNN、换浏览器 WebGPU、换不同尺寸的 Qwen，都不动 skill。这也是它能单独成包、被第三方直接读懂的原因（书里讲的依赖倒置）。
2. **为什么脱敏写进代码、而不只在提示词里要求模型？** 提示词是"软约束"，模型可能不听；卡号/证件/手机用确定性正则在文本离开端侧前 *** 掉，是"硬约束"。两者互为双保险。
3. **领域不同怎么办？** schema（目标字段表）是参数，不是分支。电影有导演、书有作者、观鸟有物种——各传各的，一套 skill 适配任意领域。
4. **单字段时会不会白跑一次结构化？** 不会。`visionExtract` 有单字段兜底：结构化没出时，端侧读出的文本本身就是答案，直接取用，且全程未上云仍算端侧完成。
5. **端侧没装模型呢？** `visionRead` 返回 ''、`visionExtract` 返回 `visionVia:'none'`——上层请用户手填。**任何情况下原图都不会被送云。**

一句话：**端侧把图读懂、脱敏、结构化，原图始终留在设备上。** 这就是端侧的价值，也是这套 skill 想说明的方法。
