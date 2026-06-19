# 端侧识图 → 结构化 Skill（visionExtract）

一个可独立移植的 skill：**给一张图 + 一份「目标字段表」，端侧把图读懂、整理成匹配该字段表的结构化 JSON**。

它是「为什么必须端侧」的一个样板能力，也演示了一种**用端侧能力搭 skill 的方式**：能力做成可注入的接口、schema 做成参数、隐私在数据流里硬约束。

---

## 一、为什么这件事「必须端侧」（云替代不了）

用户的截图/相册里常含敏感信息：票据、票根、证件号、手机号、定位、二维码。要把图变成结构化数据，绕不开"先读图"这一步。

本 skill 的数据流（关键在边界划在哪）：

```
一张图 ──① 端侧视觉模型读图──▶ 文本 ──正则脱敏──▶ ② 结构化(端侧优先/可回退云)──▶ 结构化 JSON
        原图只在这一步、且只进端侧            敏感号 ***          原图全程不参与第②步
        【原图一个字节都不出端】
```

- **隐私**：第①步读图只把原图交给端侧视觉模型（Qwen-VL，经 MNN / 浏览器 WebGPU），**原图不出端**。没有端侧，就只能把原图传云——那等于把用户的票据/证件原图交出去。这是云做不到的。
- **离线 / 低延迟**：图就在设备上，端侧直接读，不依赖网络往返、不传大图。
- **核心逻辑本地 + 云协同**：读图（核心、含隐私）在端；只有端侧读出并**脱敏后的纯文本**才按需交给云做结构化。原图永不上云。
- **诚实降级**：端侧视觉未就绪时返回 `visionVia:'none'`，宁可让用户手填，**也绝不把原图送云**。降级本身就守住了隐私。

---

## 二、设计要点

1. **schema 是参数，不是写死的**。不同领域字段不同（电影有导演、书有作者、没有演员），所以目标字段表 `fields` 由调用方传入。一套 skill 适配任意领域；新领域零改本 skill。
2. **两段流水线**：① 端侧视觉读图 → 文本；② 文本 → JSON。两步解耦——读图必须端侧（隐私），结构化可端侧可云（只过脱敏文本）。
3. **依赖倒置**：本 skill 只依赖两个注入进来的接口（`visionOnDevice`、`structure`），不依赖任何具体实现或框架。换实现即可整体移植——这也是它能单独打包的原因。
4. **确定性脱敏**：卡号/证件/手机用正则在喂给第②步之前就 *** 掉，不靠模型自觉。

---

## 三、接口契约

```ts
interface FieldSpec { key: string; label: string; hint?: string }   // 一个目标字段

interface VisionExtractDeps {
  visionOnDevice: (imageDataUrl: string, prompt: string) => Promise<string>;  // 端侧视觉（唯一接触原图处）
  structure:      (prompt: string) => Promise<string>;                        // 文本→JSON（端侧或云）
  structureOnDevice?: boolean;
}

interface VisionExtractInput { imageDataUrl: string; domain: string; fields: FieldSpec[]; redact?: boolean }

interface VisionExtractResult {
  fields: Record<string, string>;            // 按 fields.key 填好的结构化结果
  raw: string;                               // 端侧读出并脱敏后的文本
  ok: boolean;
  visionVia: 'edge' | 'none';                // 视觉永远端侧
  structuredVia: 'edge' | 'cloud' | 'none';
  onDevice: boolean;                         // 是否全程端侧
}

function visionExtract(input: VisionExtractInput, deps: VisionExtractDeps): Promise<VisionExtractResult>
```

---

## 四、用法（接上端侧 Qwen-VL + 结构化模型）

```ts
import { visionExtract } from './visionExtract';

const result = await visionExtract(
  {
    imageDataUrl,            // 用户选的图（dataURL）
    domain: '野生鸟类',
    fields: [
      { key: 'species', label: '物种' },
      { key: 'habitat', label: '生境' },
      { key: 'place',   label: '观测地', hint: '城市或地点' },
    ],
  },
  {
    // 端侧视觉：接你的端侧 Qwen-VL（MNN / 浏览器 WebGPU / 本机服务）
    visionOnDevice: (img, prompt) => myEdgeQwenVL(img, prompt),
    // 结构化：端侧文本模型优先；没有就接云 Qwen（只过脱敏文本）
    structure: (prompt) => myQwen(prompt),
    structureOnDevice: false,
  },
);
// → { fields: { species:'白鹭', habitat:'湿地', place:'杭州' }, onDevice:false, ... }
```

可推荐的端侧模型：Qwen3-VL-2B/4B（视觉）+ Qwen3.5-0.8B/2B/4B（结构化），端侧框架 MNN（Arm SME2 加速）。结构化也可走云 Qwen（仅脱敏文本上云）。

---

## 五、它怎么落到一个真实应用里

在本项目（一个把个人对象钉到地球上的应用）里：
- 任意一个「整理器」agent（电影 / 书 / 用户自建的咖啡馆·鸟类 agent…）都调它把截图读成结构化草稿；
- 自建 agent 直接把自己声明的字段表传进来 → **无需各写一套识图逻辑，一处实现、处处可调**；
- 读出的结构化草稿走「先建议、你确认才落地」的流程，确认后钉到地图。

一句话：**端侧把图读懂、脱敏、结构化，原图始终留在设备上。** 这就是端侧的价值，也是这套 skill 想说明的方法。
