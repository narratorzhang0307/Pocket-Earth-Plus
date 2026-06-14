import { MARKER_KINDS, type MarkerKind } from '../data/mapMarkers';
import type { Planet } from '../data/planets';
import { X } from 'lucide-react';

// 地球左下角图例 + 图层开关：标明每种颜色代表什么，点一下开/闭该类点。
// 上段=基础五类（从 MARKER_KINDS 自动列出），下段=用户建立的「星球」（圆点，可开关 / 删除）。

interface Props {
  visibleKinds: Set<MarkerKind>;
  onToggle: (k: MarkerKind) => void;
  planets?: Planet[];
  onTogglePlanet?: (id: string) => void;
  onRemovePlanet?: (id: string) => void;
}

export default function MapLegend({ visibleKinds, onToggle, planets = [], onTogglePlanet, onRemovePlanet }: Props) {
  return (
    <div className="absolute bottom-3 left-3 z-20 bg-white/90 backdrop-blur-md border border-black shadow-[1px_1px_0_rgba(0,0,0,0.5)] p-2 pointer-events-auto select-none max-w-[160px]">
      <div className="font-pixel text-[7px] tracking-widest mb-1.5 text-black/55">LAYERS · 图层</div>
      <div className="space-y-1">
        {MARKER_KINDS.map((k) => {
          const on = visibleKinds.has(k.kind);
          return (
            <button
              key={k.kind}
              onClick={() => onToggle(k.kind)}
              className={`flex items-center gap-2 w-full transition-opacity active:translate-y-px ${on ? '' : 'opacity-35'}`}
            >
              {/* 方块（细黑边 + 满彩色，呼应地图上的标记点）*/}
              <div className="w-3 h-3 shrink-0 border border-black" style={{ background: k.color }} />
              <span className="font-pixel text-[8px] leading-none">{k.label}</span>
              <span className="ml-auto pl-2 font-pixel text-[6px] text-black/40 leading-none">{on ? 'ON' : 'OFF'}</span>
            </button>
          );
        })}
      </div>

      {/* 星球段（圆点，区别于基础类的方块）*/}
      {planets.length > 0 && (
        <>
          <div className="font-pixel text-[7px] tracking-widest mt-2 mb-1.5 text-black/55">PLANETS · 星球</div>
          <div className="space-y-1">
            {planets.map((p) => (
              <div key={p.id} className={`flex items-center gap-2 w-full ${p.visible ? '' : 'opacity-35'}`}>
                <button onClick={() => onTogglePlanet?.(p.id)} className="flex items-center gap-2 min-w-0 flex-1 active:translate-y-px">
                  <div className="w-3 h-3 shrink-0 rounded-full border border-black" style={{ background: p.color }} />
                  <span className="font-pixel text-[8px] leading-none truncate">{p.name}</span>
                  <span className="ml-auto pl-1 font-pixel text-[6px] text-black/40 leading-none shrink-0">{p.photos.length}</span>
                </button>
                {onRemovePlanet && (
                  <button onClick={() => onRemovePlanet(p.id)} className="shrink-0 text-black/30 hover:text-[#d23b3b] active:translate-y-px"><X className="w-2.5 h-2.5" strokeWidth={3} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
