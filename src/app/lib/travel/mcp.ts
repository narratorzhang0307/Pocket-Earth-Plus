// 协作层（外部数据·只读）：经 server.mjs /api/travel-mcp 代理调 OSM(地理编码/POI) + Open-Meteo(天气)。
// 前端绝不直连（守 UA / CORS / 限频）。红线：只查询，无任何下单 / 支付端点。
// 任何失败（无网 / 限频 / 超时 / 线上未代理）静默返回 null/空，调用方走本地兜底——绝不阻断主流程。
async function mcp<T>(tool: string, params: Record<string, string>): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ tool, ...params }).toString();
    const r = await fetch(`/api/travel-mcp?${qs}`, { signal: AbortSignal.timeout(11000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d && !d.error ? (d as T) : null;
  } catch { return null; }
}

// OSM 地理编码：任意城市名 → 坐标。本地字典 miss 时的兜底，让「字典外的任意城市」也能钉地球。
export async function geocodeViaOSM(city: string): Promise<{ lng: number; lat: number; name: string } | null> {
  const c = (city || '').trim(); if (!c) return null;
  const d = await mcp<{ lng: number; lat: number; name: string }>('geocode', { q: c });
  return d && isFinite(d.lng) && isFinite(d.lat) ? { lng: d.lng, lat: d.lat, name: d.name || c } : null;
}

// OSM 周边 POI（Overpass）：景点 / 餐厅 / 咖啡。给「真实地图补点」用（catalog 没有的城市）。
export async function poiViaOSM(lat: number, lng: number, kind: 'tourism' | 'restaurant' | 'cafe' = 'tourism', radius = 1500): Promise<{ name: string; lat: number; lng: number; kind: string }[]> {
  const d = await mcp<{ pois: { name: string; lat: number; lng: number; kind: string }[] }>('poi', { lat: String(lat), lng: String(lng), kind, radius: String(radius) });
  return d?.pois || [];
}

// Open-Meteo 当前天气（给行程卡配一句实时天气用）。
export async function weatherViaOSM(lat: number, lng: number): Promise<{ temp: number; code: number } | null> {
  return mcp<{ temp: number; code: number }>('weather', { lat: String(lat), lng: String(lng) });
}
