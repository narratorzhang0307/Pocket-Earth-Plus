// 感知层·精筛：端侧 CLIP 零样本（仅对不确定/钉候选跑）。浏览器本地 transformers.js（WASM/WebGPU），
// 模型权重走 hf-mirror，超时绝不卡死、失败优雅降级。【绝不走 edgeSafe.vision——那是网络调用、会让原图出端】

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); });
  return Promise.race([p, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

let pipe: any = null;
let tried = false;

// 两段式标签：① 实拍 ↔ 资料（纠偏 isUtility）② 实拍再判子类
const STAGE1 = [
  'a real photo taken by a camera',
  'a screenshot of a phone or computer screen',
  'a poster, illustration, comic or artwork',
  'a document, receipt, menu or text',
];
const STAGE2 = [
  'a scenery or landscape photo',
  'a city street or building photo',
  'a photo of a person or people',
  'a photo of food',
  'a photo of an animal or pet',
];
const TAG: Record<string, string> = {
  'a scenery or landscape photo': '风景', 'a city street or building photo': '街景',
  'a photo of a person or people': '人物', 'a photo of food': '美食', 'a photo of an animal or pet': '宠物',
};

export async function ensureVision(onStatus?: (s: string) => void): Promise<boolean> {
  if (pipe) return true;
  if (tried) return false;
  tried = true;
  try {
    onStatus?.('加载端侧模型…（首次需下载，最多 ~40s 自动跳过）');
    const load = (async () => {
      const url = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
      const t: any = await import(/* @vite-ignore */ url);
      if (t?.env) { t.env.allowLocalModels = false; try { t.env.remoteHost = 'https://hf-mirror.com'; } catch { /* 旧版无此项 */ } }
      return t.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32', {
        device: (navigator as Navigator & { gpu?: unknown }).gpu ? 'webgpu' : undefined,
      });
    })();
    pipe = await withTimeout(load, 40000);
    onStatus?.('端侧模型就绪');
    return !!pipe;
  } catch {
    pipe = null;
    tried = false;   // 不永久禁用：一次 CDN 超时后，用户联网恢复再勾选可重试加载
    onStatus?.('端侧模型加载超时/不可用，已用快速分析结果');
    return false;
  }
}

export interface VisionResult { isReal: boolean; realProb: number; utilityKind?: 'screenshot' | 'document'; subTag?: string; subKind?: 'place' | 'life' }

export async function classifyVision(canvas: HTMLCanvasElement): Promise<VisionResult | null> {
  if (!pipe) return null;
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const s1: { label: string; score: number }[] = await withTimeout(pipe(dataUrl, STAGE1), 15000);
    const get = (l: string) => s1.find((o) => o.label === l)?.score ?? 0;
    const realProb = get('a real photo taken by a camera');
    const screenshot = get('a screenshot of a phone or computer screen') + get('a poster, illustration, comic or artwork');
    const document = get('a document, receipt, menu or text');
    const isReal = realProb > Math.max(screenshot, document);
    if (!isReal) {
      return { isReal: false, realProb, utilityKind: document > screenshot ? 'document' : 'screenshot' };
    }
    // 实拍再判子类
    const s2: { label: string; score: number }[] = await withTimeout(pipe(dataUrl, STAGE2), 15000);
    const top = s2.slice().sort((a, b) => b.score - a.score)[0];
    const subTag = top && top.score > 0.3 ? TAG[top.label] : undefined;
    const subKind: 'place' | 'life' = (top?.label === 'a scenery or landscape photo' || top?.label === 'a city street or building photo') ? 'place' : 'life';
    return { isReal: true, realProb, subTag, subKind };
  } catch { return null; }
}
