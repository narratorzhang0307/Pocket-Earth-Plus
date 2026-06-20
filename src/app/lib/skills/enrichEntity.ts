// 可复用 Skill（app 层）· 结构化补全 / 向云脑要 JSON（enrich）
// 抽出被反复复制的「调云脑拿一段结构化 JSON + 稳健解析」plumbing：
//   · extractJSON —— 容错抽 JSON（容忍 ```json 包裹、前后废话；first{…last}），movie/tagging、engine、
//     research、forge 各自抄过一份，统一到这里。
//   · enrichJSON —— 组装 system+prompt → /api/frost-llm(json) → 带超时 → extractJSON，返回对象或 null。
// 关注点分离：本 skill 管「LLM→JSON」的 How；各 curator 的字段 schema / 系统提示 / 结果映射是领域专属，留在调用方
//   （电影 导演/演员/流派 vs 书 作者/译者 字段不同，强行塞进一个"通用 schema"会是泄漏抽象，故不做）。
// 任何要"让云脑按结构吐数据"的 agent/场景都可复用。app 层 skill（打 /api/frost-llm，与 curator 同层）。

/** 从 LLM 文本里容错抽出 JSON（容忍代码块包裹与前后废话）。对象优先→数组→整段，取第一个能解析的。失败返回 null。 */
export function extractJSON<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const tryParse = (s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
  // 对象优先（多数调用方要对象）：first{…last}——避免 prose 里的杂散 [ 把贪婪匹配撑大致解析失败；无对象再退数组；再退整段。
  const obj = body.indexOf('{') !== -1 ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : null;
  const arr = body.indexOf('[') !== -1 ? body.slice(body.indexOf('['), body.lastIndexOf(']') + 1) : null;
  return tryParse(obj) ?? tryParse(arr) ?? tryParse(body.trim());
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export interface EnrichInput { prompt: string; system?: string; timeoutMs?: number }

/** 向云脑要一段结构化 JSON（强约束 json + 超时 + 稳健解析）。失败 → null（调用方走兜底，舱壁）。 */
export async function enrichJSON<T = Record<string, unknown>>(input: EnrichInput): Promise<T | null> {
  try {
    const r = await withTimeout(fetch('/api/frost-llm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: input.prompt, system: input.system, json: true }),
    }), input.timeoutMs ?? 20000);
    const data = await r.json();
    return extractJSON<T>(String(data?.text || ''));
  } catch { return null; }
}
