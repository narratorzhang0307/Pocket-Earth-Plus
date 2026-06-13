import { useEffect, useReducer, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import img2 from '../../imports/image-2.png';
import img3 from '../../imports/image-3.png';
import img4 from '../../imports/image-4.png';
import img5 from '../../imports/image-5.png';
import { ImageWithFallback } from './figma/ImageWithFallback';
import EarthMap from './EarthMap';
import { type MarkerKind, KIND_COLOR, toGeoJSON } from '../data/mapMarkers';
import { getUserMarks, subscribeUserMarks } from '../data/userMarks';
import MapLegend from './MapLegend';

// 合并：静态标记（音乐/照片/电影）+ 用户运行时落点（各 agent 写入），实时给地球图层
function buildMarksData() {
  const base = toGeoJSON();
  const extra = getUserMarks().map((m) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
    properties: { kind: m.kind, label: m.label || '' },
  }));
  return { type: 'FeatureCollection' as const, features: [...base.features, ...extra] };
}

interface MyMapTabProps {
  onViewInAR?: () => void;
}

// 西湖（杭州）—— 地图默认聚焦点，初始缩放到能看到湖周街道
const WEST_LAKE_CENTER: [number, number] = [120.140, 30.246];
const INITIAL_ZOOM = 13.6;

// —— 缩放阈值 ——
// 照片 / 紫色图钉 / 文字卡片 / 连线：放大到街道级别才出现
const DETAIL_START = 11.5;
const DETAIL_FULL = 13.0;
// 街道网格：只在街道级别出现；缩小到一定程度直接消失
const GRID_START = 12.5;
const GRID_FULL = 13.5;
// 网格随地图缩放而缩放（贴在地面上的感觉）
const GRID_REF_ZOOM = 14;
const GRID_BASE_CELL = 48;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 球面两点中心角（度）：地球缩小时用于隐藏转到背面的点
function centralAngleDeg(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const cosc =
    Math.sin(lat1 * r) * Math.sin(lat2 * r) +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return Math.acos(Math.max(-1, Math.min(1, cosc))) / r;
}

export default function MyMapTab({ onViewInAR }: MyMapTabProps) {
  // 每个标定点固定到西湖周边真实经纬度（WGS84，源自 OpenStreetMap / Wikidata）
  const annotations = [
    { id: 1, lng: 120.14703, lat: 30.260901, place: '断桥残雪', date: '03.14', text: '风卷着灰尘', dir: 'right', dx: 30, dy: -20, img: img2, imgProps: { w: 60, h: 80, rot: -5, dx: -20, dy: 30 } },
    { id: 2, lng: 120.1416133, lat: 30.2542019, place: '平湖秋月', date: '03.15', text: '霓虹闪烁的夜晚', dir: 'left', dx: -40, dy: 20, img: img3, imgProps: { w: 70, h: 70, rot: 8, dx: 40, dy: -10 } },
    { id: 3, lng: 120.1405, lat: 30.2408, place: '三潭印月', date: '03.18', text: '我听到心跳', dir: 'right', dx: 35, dy: 15, img: img4, imgProps: { w: 80, h: 60, rot: -3, dx: -50, dy: 40 } },
    { id: 4, lng: 120.13739, lat: 30.23439, place: '花港观鱼', date: '03.20', text: '雨滴打在柏油路', dir: 'left', dx: -20, dy: -30, img: img5, imgProps: { w: 65, h: 85, rot: 6, dx: 25, dy: 35 } },
    { id: 5, lng: 120.14501, lat: 30.23388, place: '雷峰塔', date: '03.21', text: '沉默的公交站牌', dir: 'left', dx: -35, dy: -10 },
    { id: 6, lng: 120.12868, lat: 30.25217, place: '曲院风荷', date: '03.22', text: '远方的车灯', dir: 'right', dx: 25, dy: -25 },
  ];

  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // 地图标记图层：哪些类型可见（音乐 / 照片），由左下角图例开关控制
  const [visibleKinds, setVisibleKinds] = useState<Set<MarkerKind>>(() => new Set<MarkerKind>(['music', 'photo', 'movie']));
  const toggleKind = (k: MarkerKind) =>
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  // 纯平移时 zoom 不变，需要强制重渲染来更新投影位置
  const [, tick] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!map) return;
    const onMove = () => {
      setZoom(map.getZoom());
      tick();
    };
    map.on('move', onMove);
    map.on('zoom', onMove);
    onMove();
    return () => {
      map.off('move', onMove);
      map.off('zoom', onMove);
    };
  }, [map]);

  // mapbox 原生标记图层：贴地 / 背面遮挡 / 重叠碰撞都交给 mapbox（symbol 图层 + 方块图标）
  useEffect(() => {
    if (!map) return;
    const setup = () => {
      if (map.getSource('marks')) return;
      (Object.entries(KIND_COLOR) as [MarkerKind, string][]).forEach(([k, color]) => {
        const id = 'sq-' + k;
        if (map.hasImage(id)) return;
        const s = k === 'movie' ? 11 : 18;       // 电影点小一点
        const inner = k === 'movie' ? 5 : 6;
        const off = Math.round((s - inner) / 2);
        const cv = document.createElement('canvas');
        cv.width = s; cv.height = s;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = color; ctx.fillRect(off, off, inner, inner);
        map.addImage(id, ctx.getImageData(0, 0, s, s));
      });
      map.addSource('marks', { type: 'geojson', data: buildMarksData() as never });
      map.addLayer({
        id: 'mark-layer',
        type: 'symbol',
        source: 'marks',
        layout: {
          'icon-image': ['concat', 'sq-', ['get', 'kind']],
          'icon-allow-overlap': false,
          'text-field': ['case', ['==', ['get', 'kind'], 'music'], ['get', 'label'], ''],
          'text-font': ['Arial Unicode MS Regular'],
          'text-size': 9,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#00ff88', 'text-halo-color': '#000', 'text-halo-width': 1.2 },
      } as never);
    };
    if (map.isStyleLoaded()) setup();
    else map.once('style.load', setup);
  }, [map]);

  // 图层开关：按可见类型过滤 mapbox 标记图层
  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (!map.getLayer('mark-layer')) return;
      map.setFilter('mark-layer', ['in', ['get', 'kind'], ['literal', [...visibleKinds]]] as never);
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [map, visibleKinds]);

  // tab1 ⇄ tab2 联动：各 agent 写入用户落点后，实时刷新地球图层数据
  useEffect(() => {
    if (!map) return;
    const refresh = () => {
      const src = map.getSource('marks') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(buildMarksData() as never);
    };
    return subscribeUserMarks(refresh);
  }, [map]);

  // 细节层（照片/紫点/文字/连线）显隐程度
  const detail = clamp01((zoom - DETAIL_START) / (DETAIL_FULL - DETAIL_START));
  // 网格显隐程度（低于 GRID_START 直接为 0 → 消失）
  const gridOpacity = clamp01((zoom - GRID_START) / (GRID_FULL - GRID_START));
  // 绿点尺寸：远小近大
  const dotSize = Math.round(lerp(7, 16, clamp01((zoom - 4) / (13.5 - 4))));

  // 网格：尺寸随缩放、位置随平移（贴地）
  const cellPx = GRID_BASE_CELL * Math.pow(2, zoom - GRID_REF_ZOOM);
  const gridAnchor = map ? map.project(WEST_LAKE_CENTER) : { x: 0, y: 0 };
  const mapCenter: [number, number] = map
    ? [map.getCenter().lng, map.getCenter().lat]
    : WEST_LAKE_CENTER;

  return (
    <div className="flex flex-col h-full bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Top Bar Status */}
      <div className="flex justify-between items-center px-4 py-2 border-b-2 border-black bg-[#EAEAEA]">
        <div className="font-pixel text-[8px] uppercase">Connection: Secure</div>
        <div className="font-pixel text-[8px] text-[#00ff88]">SYS.ONLINE</div>
      </div>

      {/* Header Area */}
      <div className="px-4 py-4 border-b-2 border-black bg-white">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">MY MAP</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          城市属于我们。<br />
          <span className="opacity-60 text-[9px] font-pixel block mt-1">The city, filling with your poems.</span>
        </p>
      </div>

      {/* Stat Strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88]">
        <div className="font-pixel text-[8px] flex justify-between items-center tracking-wider">
          <span>TREES: 47</span>
          <span className="opacity-50">|</span>
          <span>CITY LIT: 23%</span>
          <span className="opacity-50">|</span>
          <span>DISTRICTS: 5</span>
        </div>
      </div>

      {/* Map Canvas Hero */}
      <div className="relative flex-1 bg-black border-b-2 border-black overflow-hidden shadow-inner">
        {/* Earth globe base layer (Pocket Earth / Mapbox globe) */}
        <EarthMap className="z-0" center={WEST_LAKE_CENTER} zoom={INITIAL_ZOOM} onReady={setMap} />

        {/* 街道网格：仅街道级别出现，随地图缩放/平移，缩小到阈值以下直接消失 */}
        {gridOpacity > 0.01 && (
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(0,0,0,0.6) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(0,0,0,0.6) 1px, transparent 1px)
              `,
              backgroundSize: `${cellPx}px ${cellPx}px`,
              backgroundPosition: `${gridAnchor.x}px ${gridAnchor.y}px`,
              opacity: gridOpacity * 0.4,
            }}
          />
        )}

        {/* 斜向街道线 + 标记圈：与网格一同淡入淡出 */}
        {gridOpacity > 0.01 && (
          <svg
            className="absolute inset-0 z-[1] w-full h-full pointer-events-none"
            style={{ opacity: gridOpacity * 0.18 }}
          >
            <path d="M 0 50 L 400 250 M 0 200 L 400 50 M -100 300 L 500 100 M 0 400 L 400 350 M 200 0 L 100 500 M 300 0 L 200 500" stroke="black" strokeWidth="2" fill="none" />
            <path d="M 50 0 L 50 500 M 150 0 L 150 500 M 250 0 L 250 500" stroke="black" strokeWidth="3" strokeDasharray="5,5" fill="none" />
            <circle cx="45%" cy="38%" r="15" fill="none" stroke="#ff00ff" strokeWidth="1" strokeDasharray="2,2" />
            <circle cx="22%" cy="63%" r="20" fill="none" stroke="#ff00ff" strokeWidth="1" strokeDasharray="2,2" />
          </svg>
        )}

        {/* 标定点图层（地理锚定） */}
        {map && annotations.map((ann) => {
          const p = map.project([ann.lng, ann.lat]);
          // 地球缩小时，隐藏转到背面的点
          if (zoom < 5 && centralAngleDeg(mapCenter, [ann.lng, ann.lat]) > 78) return null;
          const showDetail = detail > 0.01;
          const inner = Math.max(2, Math.round(dotSize * 0.375));

          return (
            <div
              key={ann.id}
              className="absolute z-10 pointer-events-none"
              style={{ left: `${p.x}px`, top: `${p.y}px` }}
            >
              {/* 连线层（仅细节可见时） */}
              {showDetail && (
                <svg className="absolute overflow-visible w-0 h-0 z-0 pointer-events-none" style={{ opacity: detail }}>
                  <line x1="0" y1="0" x2={ann.dx} y2={ann.dy} stroke="black" strokeWidth="1.5" />
                  {ann.img && ann.imgProps && (
                    <line x1="0" y1="0" x2={ann.imgProps.dx} y2={ann.imgProps.dy} stroke="#ff00ff" strokeWidth="1" strokeDasharray="3,3" />
                  )}
                </svg>
              )}

              {/* 绿点标记（始终存在；远小近大） */}
              <div
                className="absolute -translate-x-1/2 -translate-y-1/2 bg-black flex items-center justify-center border border-black shadow-[1px_1px_0px_#00ff88] z-10"
                style={{ width: `${dotSize}px`, height: `${dotSize}px` }}
              >
                <div className="bg-[#00ff88]" style={{ width: `${inner}px`, height: `${inner}px` }}></div>
              </div>

              {/* 照片（含紫色图钉）：仅街道级别出现 */}
              {showDetail && ann.img && ann.imgProps && (
                <div
                  className="absolute bg-white p-1 border border-black shadow-[3px_3px_0px_rgba(0,0,0,0.8)] z-0"
                  style={{
                    width: `${ann.imgProps.w}px`,
                    height: `${ann.imgProps.h}px`,
                    transform: `translate(${ann.imgProps.dx}px, ${ann.imgProps.dy}px) rotate(${ann.imgProps.rot}deg)`,
                    opacity: detail,
                  }}
                >
                  {/* 紫色图钉（只有放大看清街道后才存在） */}
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border border-black shadow-sm z-10"></div>
                  <ImageWithFallback src={ann.img} alt={ann.text} className="w-full h-full object-cover grayscale opacity-90 contrast-125 border border-black/20" />
                </div>
              )}

              {/* 文字卡片：仅街道级别出现 */}
              {showDetail && (
                <div
                  className="absolute bg-white border-[1.5px] border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] p-1.5 w-max z-10"
                  style={{
                    left: ann.dir === 'right' ? `${ann.dx}px` : 'auto',
                    right: ann.dir === 'left' ? `${-ann.dx}px` : 'auto',
                    top: `${ann.dy - 10}px`,
                    opacity: detail,
                  }}
                >
                  <div className="font-pixel text-[6px] text-black/60 mb-1 tracking-widest">{ann.date} • LOC_SYNC</div>
                  <div className="text-[11px] font-bold leading-none">{ann.text}</div>
                </div>
              )}
            </div>
          );
        })}

        {/* 标记点（音乐绿 / 照片青）由 mapbox symbol 图层原生渲染，见上方 useEffect */}

        {/* 左下角图例 + 图层开关（绿=音乐 / 青=照片，可开闭）*/}
        <MapLegend visibleKinds={visibleKinds} onToggle={toggleKind} />
      </div>
    </div>
  );
}
