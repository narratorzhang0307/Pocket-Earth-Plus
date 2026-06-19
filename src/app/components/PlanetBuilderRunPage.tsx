import { useReducer, useState, useEffect } from 'react';
import { ChevronLeft, Sparkles, Globe2, X, RefreshCw } from 'lucide-react';
import { parseTheme, fetchPlanetPhotos, localPlanetPhotos } from '../data/themePlanet';
import { addPlanet, appendPhotos, getPlanets, subscribePlanets, removePlanet, togglePlanet, nextPlanetColor } from '../data/planets';

// planet-builder 运行页 —— 自定义「星球」agent。
// 用户说一句主题（日落星球 / 鸟类星球…）→ 端侧解析成英文检索词 + 纬度带 → Unsplash 抓图 →
// 按主题落点钉成一颗新星球（独立彩色图层），与 tab1 地球联动；点开看大图（含 Unsplash 署名）。

interface Props { onBack: () => void }
const ACCENT = '#ff7a00';
const SUGGESTIONS = ['日落星球', '鸟类星球', '极光星球', '樱花星球', '沙漠星球', '城市夜景'];

const ERR_MSG: Record<string, string> = {
  no_key: '未配置 Unsplash 密钥（在 .env 添加 UNSPLASH_ACCESS_KEY）',
  network: '网络连不上 Unsplash，请重试',
  empty: '没找到这个主题的照片，换个说法试试',
  no_query: '请先输入一个主题',
};
const errText = (e: string) => ERR_MSG[e] || (e.startsWith('unsplash_4') ? 'Unsplash 额度用尽（每小时 50 次），稍后再试' : '出错了，请重试');

export default function PlanetBuilderRunPage({ onBack }: Props) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => subscribePlanets(force), []);

  const [theme, setTheme] = useState('');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parse, setParse] = useState<{ query: string; band: [number, number] } | null>(null);
  const [refilling, setRefilling] = useState<string | null>(null);
  const [fellLocal, setFellLocal] = useState(false);   // 本轮是否用了本地照片库兜底

  const planets = getPlanets();

  const build = async (input?: string) => {
    const name = (input ?? theme).trim();
    if (!name || building) return;
    setBuilding(true); setError(null); setParse(null); setFellLocal(false);
    const parsed = await parseTheme(name);
    setParse(parsed);
    const { photos, error: err } = await fetchPlanetPhotos(parsed.query, parsed.band, 24);
    let finalPhotos = photos;
    if (err || !photos.length) {
      // 舱壁降级：Unsplash 挂了就用本地世界照片库凑一颗，照样钉星球
      const local = localPlanetPhotos(parsed.band, 24);
      if (local.length) { finalPhotos = local; setFellLocal(true); }
      else { setError(err || 'empty'); setBuilding(false); return; }
    }
    addPlanet({ id: 'pl-' + Date.now(), name, query: parsed.query, color: nextPlanetColor(), band: parsed.band, photos: finalPhotos });
    setTheme('');
    setBuilding(false);
  };

  const refill = async (id: string) => {
    const pl = planets.find((p) => p.id === id);
    if (!pl || refilling) return;
    setRefilling(id);
    const { photos } = await fetchPlanetPhotos(pl.query, pl.band, 24);
    if (photos.length) appendPhotos(id, photos);
    setRefilling(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b-2 border-black bg-white shrink-0">
        <button onClick={onBack} className="w-8 h-8 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-pixel text-[11px] tracking-wider truncate">PLANET-BUILDER</div>
        </div>
        <Globe2 className="w-4 h-4" strokeWidth={2.5} style={{ color: ACCENT }} />
      </div>

      {/* Stat strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black shrink-0" style={{ color: ACCENT }}>
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>星球 {planets.length}</span><span className="opacity-40">|</span>
          <span>照片 {planets.reduce((n, p) => n + p.photos.length, 0)}</span><span className="opacity-40">|</span>
          <span>UNSPLASH · 端侧解析</span>
        </div>
      </div>

      {/* 输入 */}
      <div className="px-3 py-2.5 border-b-2 border-black bg-white shrink-0 space-y-2">
        <div className="flex gap-2">
          <input
            value={theme} onChange={(e) => setTheme(e.target.value)} disabled={building}
            onKeyDown={(e) => e.key === 'Enter' && build()}
            placeholder="说一个主题，如「日落星球」「鸟类星球」…"
            className="flex-1 min-w-0 border-2 border-black px-2 py-1.5 text-[12px] bg-[#EAEAEA] focus:outline-none focus:bg-white disabled:opacity-50"
          />
          <button onClick={() => build()} disabled={building || !theme.trim()}
            className="flex items-center gap-1 border-2 border-black px-2.5 py-1.5 text-[11px] font-bold shadow-[1px_1px_0_#000] active:translate-y-px text-black disabled:opacity-40" style={{ background: ACCENT }}>
            <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} /> {building ? '建立中' : '建立星球'}
          </button>
        </div>
        {/* 建议主题 */}
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => build(s)} disabled={building}
              className="text-[10px] px-2 py-0.5 border-2 border-black bg-white text-black/65 hover:bg-black/5 active:translate-y-px disabled:opacity-40">{s}</button>
          ))}
        </div>
        {/* 端侧解析 trace */}
        {(building || parse) && (
          <div className="text-[10px] text-black/55 leading-snug bg-[#E2E2E0] border border-black/20 px-2 py-1">
            {building && !parse && <span className="animate-pulse">端侧解析主题 → 检索词…</span>}
            {parse && <>⊙ 端侧解析：<b>{parse.query}</b> · 纬度带 [{parse.band[0]}, {parse.band[1]}]{building && <span className="animate-pulse"> · 抓图中…</span>}</>}
          </div>
        )}
        {error && (
          <div className="text-[11px] text-[#d23b3b] leading-snug">
            ✕ {errText(error)}
            {error === 'empty' && <span className="text-black/50"> · 试试：日落 / 海洋 / 星空</span>}
          </div>
        )}
        {fellLocal && !building && (
          <div className="text-[10px] text-[#a05a2c] leading-snug">⊙ Unsplash 暂不可用 · 已用本地世界照片库凑成这颗星球</div>
        )}
      </div>

      {/* 已建立的星球 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {planets.length === 0 && !building && (
          <div className="border-2 border-black bg-white p-4 shadow-[2px_2px_0_rgba(0,0,0,0.85)] text-center">
            <Globe2 className="w-6 h-6 mx-auto mb-2" strokeWidth={2} style={{ color: ACCENT }} />
            <div className="text-[12px] font-bold mb-1">还没有星球</div>
            <div className="text-[11px] text-black/55 leading-snug">说一个主题，agent 会去 Unsplash 抓一组照片，按主题落点钉成一颗星球，钉到中间的地球上。</div>
          </div>
        )}
        {planets.map((pl) => (
          <div key={pl.id} className="border-2 border-black bg-white shadow-[2px_2px_0_rgba(0,0,0,0.85)]">
            <div className="px-2.5 py-1.5 border-b-2 border-black flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border border-black shrink-0" style={{ background: pl.color }} />
              <span className="text-[13px] font-bold truncate flex-1">{pl.name}</span>
              <span className="font-pixel text-[7px] text-black/45">{pl.photos.length} 张</span>
              <button onClick={() => togglePlanet(pl.id)} className={`font-pixel text-[7px] border border-black px-1.5 py-0.5 active:translate-y-px ${pl.visible ? 'bg-black text-[#7CFF6B]' : 'text-black/50'}`}>{pl.visible ? '显示' : '隐藏'}</button>
              <button onClick={() => refill(pl.id)} disabled={refilling === pl.id} className="text-black/40 hover:text-black active:translate-y-px disabled:opacity-40" title="再抓一批"><RefreshCw className={`w-3.5 h-3.5 ${refilling === pl.id ? 'animate-spin' : ''}`} strokeWidth={2.5} /></button>
              <button onClick={() => removePlanet(pl.id)} className="text-black/30 hover:text-[#d23b3b] active:translate-y-px"><X className="w-3.5 h-3.5" strokeWidth={3} /></button>
            </div>
            <div className="p-1.5 grid grid-cols-5 gap-1">
              {pl.photos.slice(0, 20).map((ph) => (
                <div key={ph.id} className="aspect-square overflow-hidden border border-black/30 bg-[#d8d8d6]" style={{ background: ph.color }}>
                  <img src={ph.thumb} alt={ph.alt} loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                </div>
              ))}
            </div>
            <div className="px-2.5 py-1 font-pixel text-[7px] text-black/35 tracking-wider border-t border-black/10">检索词 {pl.query} · 已钉地球 · 图片来自 Unsplash</div>
          </div>
        ))}
      </div>
    </div>
  );
}
