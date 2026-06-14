import { useEffect, useReducer, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { ImageWithFallback } from './figma/ImageWithFallback';
import EarthMap from './EarthMap';
import { type MarkerKind, KIND_COLOR, toGeoJSON, MAP_MARKERS, photoById, movieById, bookById } from '../data/mapMarkers';
import { getUserMarks, subscribeUserMarks } from '../data/userMarks';
import { getPlanets, getVisiblePlanets, subscribePlanets, togglePlanet, removePlanet } from '../data/planets';
import { trackDownload } from '../data/themePlanet';
import { showcasePhotos } from '../data/photos';
import { getMoodStickers, addMoodSticker, removeMoodSticker, subscribeMood, resolveMoodPlace, pickStickerColor, pickRot } from '../data/geoStickers';
import { Plus, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import MapLegend from './MapLegend';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';

// 星球图层数据：把所有「可见星球」的照片摊平成 circle 要素（每点带星球色）
function planetsToGeoJSON() {
  const features = [];
  for (const pl of getVisiblePlanets()) {
    for (const ph of pl.photos) {
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [ph.lng, ph.lat] },
        properties: { id: ph.id, planetId: pl.id, color: pl.color },
      });
    }
  }
  return { type: 'FeatureCollection' as const, features };
}
function planetPhotoById(id: string) {
  for (const pl of getPlanets()) { const ph = pl.photos.find((x) => x.id === id); if (ph) return ph; }
  return null;
}

// 合并：静态标记（音乐/照片/电影/书）+ 用户运行时落点（各 agent 写入），实时给地球图层
function buildMarksData() {
  const base = toGeoJSON();
  const extra = getUserMarks().map((m) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [m.lng, m.lat] },
    properties: { kind: m.kind, label: m.label || '', id: m.id },
  }));
  return { type: 'FeatureCollection' as const, features: [...base.features, ...extra] };
}

// 照片标记（含 thumb/full，已带散开坐标）—— 放大后做缩略预览用
const PHOTO_MARKERS = MAP_MARKERS.filter((m) => m.kind === 'photo');
const PREVIEW_ZOOM = 5.5; // 放大到此缩放以上，照片以缩略图预览

// 点击标记 → 取详情（用户落点优先，其次静态查找表）
function resolveDetail(id: string, kind: MarkerKind, label: string): MarkerDetailData | null {
  const um = getUserMarks().find((m) => m.id === id);
  if (um) {
    const meta = (um.meta || {}) as Record<string, unknown>;
    if (kind === 'movie') return { kind, title: um.label, original: String(meta.original || ''), director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number, rating: meta.rating as number, date: String(meta.date || ''), synopsis: String(meta.synopsis || '') };
    if (kind === 'book') return { kind, title: um.label, author: String(meta.author || ''), place: String(meta.place || ''), year: meta.year as number, note: String(meta.note || '') };
    if (kind === 'travel') return { kind, title: um.label, city: String(meta.city || ''), tag: String(meta.tag || ''), note: String(meta.note || ''), date: String(meta.date || '') };
    if (kind === 'photo') return { kind, full: String(meta.full || ''), thumb: String(meta.thumb || ''), city: String(meta.city || um.label || '') };
    return { kind: 'music', title: um.label };
  }
  if (kind === 'photo') { const p = photoById.get(id); return p ? { kind, full: p.full, thumb: p.thumb, city: (p.city || '').split(',')[0], authorName: p.author, authorLink: p.authorLink, photoLink: p.photoLink } : null; }
  if (kind === 'movie') { const m = movieById.get(id); return m ? { kind, title: m.title, original: m.original, director: m.director, country: m.country, year: m.year, rating: m.rating, date: m.date, synopsis: m.synopsis } : null; }
  if (kind === 'book') { const b = bookById.get(id); return b ? { kind, title: b.title, author: b.author, place: b.country, year: b.year, synopsis: b.synopsis, date: b.date, rating: b.rating } : null; }
  if (kind === 'music') return { kind, title: label, city: label };
  return null;
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
    { id: 1, lng: 120.14703, lat: 30.260901, place: '断桥残雪', date: '03.14', text: '风卷着灰尘', dir: 'right', dx: 30, dy: -20, img: showcasePhotos[0]?.thumb, imgProps: { w: 60, h: 80, rot: -5, dx: -20, dy: 30 } },
    { id: 2, lng: 120.1416133, lat: 30.2542019, place: '平湖秋月', date: '03.15', text: '霓虹闪烁的夜晚', dir: 'left', dx: -40, dy: 20, img: showcasePhotos[1]?.thumb, imgProps: { w: 70, h: 70, rot: 8, dx: 40, dy: -10 } },
    { id: 3, lng: 120.1405, lat: 30.2408, place: '三潭印月', date: '03.18', text: '我听到心跳', dir: 'right', dx: 35, dy: 15, img: showcasePhotos[2]?.thumb, imgProps: { w: 80, h: 60, rot: -3, dx: -50, dy: 40 } },
    { id: 4, lng: 120.13739, lat: 30.23439, place: '花港观鱼', date: '03.20', text: '雨滴打在柏油路', dir: 'left', dx: -20, dy: -30, img: showcasePhotos[3]?.thumb, imgProps: { w: 65, h: 85, rot: 6, dx: 25, dy: 35 } },
    { id: 5, lng: 120.14501, lat: 30.23388, place: '雷峰塔', date: '03.21', text: '沉默的公交站牌', dir: 'left', dx: -35, dy: -10 },
    { id: 6, lng: 120.12868, lat: 30.25217, place: '曲院风荷', date: '03.22', text: '远方的车灯', dir: 'right', dx: 25, dy: -25 },
  ];

  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // 地图标记图层：哪些类型可见（音乐 / 照片），由左下角图例开关控制
  const [visibleKinds, setVisibleKinds] = useState<Set<MarkerKind>>(() => new Set<MarkerKind>(['music', 'photo', 'movie', 'book', 'travel']));
  const toggleKind = (k: MarkerKind) =>
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  // 纯平移时 zoom 不变，需要强制重渲染来更新投影位置
  const [, tick] = useReducer((x) => x + 1, 0);
  // 心情贴：左上角加号 → 写心情 → 端侧判经纬度 → 钉到地图
  const [moodOpen, setMoodOpen] = useState(false);
  const [moodText, setMoodText] = useState('');
  const [moodBusy, setMoodBusy] = useState(false);
  // 点击标记后的详情弹层
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);

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
        const px = 2;                            // 2x 画布更清晰
        const total = k === 'movie' ? 11 : 18;   // 恢复原来的尺寸
        const off = k === 'movie' ? 2 : 4;        // 原来每边 movie 3 / 其它 6，粗边框缩小三分之一 → 2 / 4
        const sw = total * px;
        const bw = off * px;
        const cv = document.createElement('canvas');
        cv.width = sw; cv.height = sw;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sw, sw);
        ctx.fillStyle = color; ctx.fillRect(bw, bw, sw - bw * 2, sw - bw * 2);
        map.addImage(id, ctx.getImageData(0, 0, sw, sw), { pixelRatio: px });
      });
      map.addSource('marks', { type: 'geojson', data: buildMarksData() as never });
      map.addLayer({
        id: 'mark-layer',
        type: 'symbol',
        source: 'marks',
        layout: {
          'icon-image': ['concat', 'sq-', ['get', 'kind']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.28, 4, 0.42, 7, 0.7, 11, 1],
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
      // 星球图层：圆点（区别于基础类的方块），颜色按星球取自要素属性，允许重叠
      if (!map.getSource('planets')) {
        map.addSource('planets', { type: 'geojson', data: planetsToGeoJSON() as never });
        map.addLayer({
          id: 'planet-layer',
          type: 'circle',
          source: 'planets',
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, 6, 5, 13, 9],
            'circle-stroke-width': 1.2,
            'circle-stroke-color': '#000',
            'circle-opacity': 0.95,
          },
        } as never);
      }
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

  // 星球图层联动：建立 / 开关 / 删除星球后刷新图层 + 重渲染（图例 / 预览）
  useEffect(() => {
    if (!map) return;
    const refresh = () => {
      const src = map.getSource('planets') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(planetsToGeoJSON() as never);
      tick();
    };
    return subscribePlanets(refresh);
  }, [map]);

  // 心情贴变化 → 重渲染（DOM 叠层，钉地理坐标）
  useEffect(() => subscribeMood(() => tick()), []);

  // 点击标记 → 弹出详情；悬停变手型
  useEffect(() => {
    if (!map) return;
    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const d = resolveDetail(String(f.properties.id), f.properties.kind as MarkerKind, String(f.properties.label || ''));
      if (d) setSelected(d);
    };
    const onPlanetClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const ph = planetPhotoById(String(f.properties.id));
      if (!ph) return;
      setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link });
      trackDownload(ph.downloadLocation); // 看大图触发 Unsplash 合规埋点
    };
    const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { map.getCanvas().style.cursor = ''; };
    const bind = () => {
      if (map.getLayer('mark-layer')) {
        map.on('click', 'mark-layer', onClick);
        map.on('mouseenter', 'mark-layer', enter);
        map.on('mouseleave', 'mark-layer', leave);
      }
      if (map.getLayer('planet-layer')) {
        map.on('click', 'planet-layer', onPlanetClick);
        map.on('mouseenter', 'planet-layer', enter);
        map.on('mouseleave', 'planet-layer', leave);
      }
    };
    if (map.isStyleLoaded() && map.getLayer('mark-layer')) bind();
    else map.once('idle', bind);
    return () => {
      map.off('click', 'mark-layer', onClick);
      map.off('mouseenter', 'mark-layer', enter);
      map.off('mouseleave', 'mark-layer', leave);
      map.off('click', 'planet-layer', onPlanetClick);
      map.off('mouseenter', 'planet-layer', enter);
      map.off('mouseleave', 'planet-layer', leave);
    };
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

  // 贴心情：端侧从文字判地名 → 经纬度（判不出用当前地图中心）→ 钉下并飞过去
  const submitMood = async () => {
    const t = moodText.trim();
    if (!t || moodBusy) return;
    setMoodBusy(true);
    const center: [number, number] = map ? [map.getCenter().lng, map.getCenter().lat] : WEST_LAKE_CENTER;
    const { place, lng, lat } = await resolveMoodPlace(t, center);
    const id = 'mood-' + Date.now();
    addMoodSticker({ id, lat, lng, text: t, place, color: pickStickerColor(t), rot: pickRot(id) });
    setMoodText(''); setMoodOpen(false); setMoodBusy(false);
    if (map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 3.2) });
  };

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

        {/* 标记点由 mapbox symbol 图层原生渲染；点击弹详情见上方 useEffect */}

        {/* 放大后照片缩略预览（DOM 叠层，仅渲染视口内、可见、有图的照片，点开看大图） */}
        {map && zoom >= PREVIEW_ZOOM && visibleKinds.has('photo') && (() => {
          const b = map.getBounds();
          const out: React.ReactNode[] = [];
          const phash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
          // 拍立得照片贴：白边 + 紫钉（星球用星球色钉）+ 方形/竖版随机 + 黑白，触碰变彩色
          const polaroid = (key: string, lng: number, lat: number, thumb: string, h: number, pin: string, onClick: () => void) => {
            const pt = map.project([lng, lat]);
            const tall = h % 2 === 0; const rot = (h % 7) - 3;
            return (
              <button key={key} onClick={onClick}
                className="absolute z-[15] bg-white p-1 pb-2.5 border border-black/50 shadow-[2px_3px_6px_rgba(0,0,0,0.4)] active:scale-95"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: '58px', transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-black" style={{ background: pin }} />
                <div className={`w-full ${tall ? 'aspect-[3/4]' : 'aspect-square'} overflow-hidden bg-[#d8d8d6]`}>
                  <img src={thumb} className="w-full h-full object-cover grayscale hover:grayscale-0 active:grayscale-0 transition-all duration-500" loading="lazy" />
                </div>
              </button>
            );
          };
          for (const m of PHOTO_MARKERS) {
            if (!m.thumb) continue;
            if (!b || !b.contains([m.lng, m.lat])) continue;
            out.push(polaroid('pv-' + m.id, m.lng, m.lat, m.thumb, phash(m.id), '#ff00ff',
              () => setSelected({ kind: 'photo', full: m.full, thumb: m.thumb, city: (m.label || '').split(',')[0], authorName: m.author, authorLink: m.authorLink, photoLink: m.photoLink })));
            if (out.length >= 70) break;
          }
          for (const pl of getVisiblePlanets()) {
            for (const ph of pl.photos) {
              if (!b || !b.contains([ph.lng, ph.lat])) continue;
              out.push(polaroid('pp-' + ph.id, ph.lng, ph.lat, ph.thumb, phash(ph.id), pl.color,
                () => { setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link }); trackDownload(ph.downloadLocation); }));
              if (out.length >= 130) break;
            }
            if (out.length >= 130) break;
          }
          return out;
        })()}

        {/* 心情贴：缩小时收成小图钉（和标记点一样钉在地球，不浮动），放大才展开成卡片 */}
        {map && getMoodStickers().map((s) => {
          if (zoom < 5 && centralAngleDeg(mapCenter, [s.lng, s.lat]) > 78) return null;
          const pt = map.project([s.lng, s.lat]);
          if (zoom < 6.5) {
            // 小图钉：居中锚定在落点（与方块标记同机制），尺寸随缩放走，地球尺度下和方块点一样小
            const sz = Math.max(6, Math.min(13, Math.round(2 + zoom * 1.7)));
            return (
              <button
                key={s.id}
                title={s.text}
                onClick={() => map.flyTo({ center: [s.lng, s.lat], zoom: 8 })}
                className="absolute z-[18] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black shadow-[1px_1px_0_rgba(0,0,0,0.4)] pointer-events-auto active:scale-90"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${sz}px`, height: `${sz}px`, background: '#ff00ff' }}
              />
            );
          }
          return (
            <div key={s.id} className="absolute z-[18] -translate-x-1/2 -translate-y-full group pointer-events-auto" style={{ left: `${pt.x}px`, top: `${pt.y}px` }}>
              <div className="relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.6)] px-2 py-1.5 max-w-[150px]" style={{ background: s.color, transform: `rotate(${s.rot}deg)` }}>
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
                <div className="text-[11px] leading-snug text-black font-medium break-words">{s.text}</div>
                <div className="font-pixel text-[6px] text-black/55 tracking-wider mt-1">◍ {s.place} · 心情贴</div>
                <button onClick={() => removeMoodSticker(s.id)} className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-black border border-black text-white items-center justify-center hidden group-hover:flex">
                  <X className="w-2.5 h-2.5" strokeWidth={3} />
                </button>
              </div>
              <div className="w-px h-2 bg-black/50 mx-auto" />
            </div>
          );
        })}

        {/* 左上角：贴一条心情 */}
        <div className="absolute top-3 left-3 z-20 pointer-events-auto">
          {moodOpen ? (
            <div className="bg-white border-2 border-black shadow-[2px_2px_0_#000] p-2 w-[210px]">
              <div className="font-pixel text-[7px] tracking-widest mb-1.5 text-black/55">此刻的心情 · MOOD</div>
              <textarea value={moodText} onChange={(e) => setMoodText(e.target.value)} rows={2} placeholder="留下此刻的心情（可带地名）…" className="w-full border-2 border-black px-2 py-1 text-[11px] bg-[#EAEAEA] focus:outline-none resize-none" />
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => { setMoodOpen(false); setMoodText(''); }} className="flex-1 border-2 border-black bg-white text-[10px] py-1 active:translate-y-px">取消</button>
                <button onClick={submitMood} disabled={moodBusy || !moodText.trim()} className="flex-1 border-2 border-black bg-[#ffe08a] text-[10px] font-bold py-1 active:translate-y-px disabled:opacity-40">{moodBusy ? '识别中…' : '钉下 ◍'}</button>
              </div>
              <div className="font-pixel text-[6px] text-black/40 mt-1 leading-snug">端侧判地名 → 钉地理坐标，缩放不跟跑</div>
            </div>
          ) : (
            <button onClick={() => setMoodOpen(true)} title="贴一条心情" className="w-10 h-10 bg-[#ffe08a] border-2 border-black shadow-[2px_2px_0_#000] flex items-center justify-center active:translate-y-px">
              <Plus className="w-5 h-5" strokeWidth={3} />
            </button>
          )}
        </div>

        {/* 左下角图例 + 图层开关（基础五类方块 + 用户星球圆点，可开闭）*/}
        <MapLegend
          visibleKinds={visibleKinds}
          onToggle={toggleKind}
          planets={getPlanets()}
          onTogglePlanet={togglePlanet}
          onRemovePlanet={removePlanet}
        />
      </div>

      {/* 标记详情弹层（照片灯箱 / 电影票根 / 藏书票 / 行程足迹 / 音乐城市） */}
      <AnimatePresence>
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}
