import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import { ImageWithFallback } from './figma/ImageWithFallback';
import EarthMap from './EarthMap';
import { type MarkerKind, KIND_COLOR, toGeoJSON, MAP_MARKERS, photoById, movieById, bookById, ensureHeavyMarkers } from '../data/mapMarkers';
import { getUserMarks, getUserMarksByKind, subscribeUserMarks, removeUserMark } from '../data/userMarks';
import { buildTripLines, getTrip } from '../lib/travel';
import { getPlanets, getVisiblePlanets, subscribePlanets, togglePlanet, removePlanet } from '../data/planets';
import { trackDownload } from '../data/themePlanet';
import { showcasePhotos } from '../data/photos';
import { getMoodStickers, addMoodSticker, removeMoodSticker, updateMoodStickerPos, commitStickers, seedStickers, subscribeMood, resolveMoodPlace, pickStickerColor, pickRot } from '../data/geoStickers';
import { applyOverride, setOverride, commitOverrides, subscribeOverrides } from '../data/markerOverrides';
import { Plus, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import MapLegend from './MapLegend';
import MarkerDetail, { type MarkerDetailData } from './MarkerDetail';

// 星球图层数据：把所有「可见星球」的照片摊平成 circle 要素（每点带星球色）
function planetsToGeoJSON() {
  const features = [];
  for (const pl of getVisiblePlanets()) {
    for (const ph of pl.photos) {
      const [lng, lat] = applyOverride(ph.id, ph.lng, ph.lat); // 拖动校正后的落点
      features.push({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
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
  // 静态标记：应用拖动校正后的落点
  const baseFeats = base.features.map((f) => {
    const c = f.geometry.coordinates as [number, number];
    const [lng, lat] = applyOverride(String(f.properties.id), c[0], c[1]);
    return { ...f, geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] } };
  });
  const extra = getUserMarks().map((m) => {
    const [lng, lat] = applyOverride(m.id, m.lng, m.lat);
    return {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [lng, lat] },
      properties: { kind: m.kind, label: m.label || '', id: m.id },
    };
  });
  return { type: 'FeatureCollection' as const, features: [...baseFeats, ...extra] };
}

// 照片标记（含 thumb/full，已带散开坐标）—— 放大后做缩略预览用
const PHOTO_MARKERS = MAP_MARKERS.filter((m) => m.kind === 'photo');
const PREVIEW_ZOOM = 5.5; // 放大到此缩放以上，照片以缩略图预览

// 点击标记 → 取详情（用户落点优先，其次静态查找表）
function resolveDetail(id: string, kind: MarkerKind, label: string): MarkerDetailData | null {
  const um = getUserMarks().find((m) => m.id === id);
  if (um) {
    const meta = (um.meta || {}) as Record<string, unknown>;
    if (kind === 'movie') return { kind, title: um.label, original: String(meta.original || ''), director: String(meta.director || ''), country: String(meta.country || ''), year: meta.year as number, rating: meta.rating as number, date: String(meta.date || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), cast: Array.isArray(meta.cast) ? (meta.cast as string[]) : [], place: String(meta.place || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'book') return { kind, title: um.label, author: String(meta.author || ''), place: String(meta.place || ''), year: meta.year as number, note: String(meta.note || ''), synopsis: String(meta.synopsis || meta.plot || ''), genre: String(meta.genre || ''), movement: String(meta.movement || ''), translator: String(meta.translator || ''), country: String(meta.country || ''), geoKind: String(meta.geoKind || '') };
    if (kind === 'travel') {
      const tripId = String(meta.tripId || '');
      const trip = tripId ? getTrip(tripId) : null;
      return { kind, markId: um.id, title: um.label, city: String(meta.city || ''), tag: String(meta.tag || ''), note: String(meta.note || ''), date: String(meta.date || ''), tripId: tripId || undefined, trip: trip && trip.stops.length > 1 ? trip : undefined };
    }
    if (kind === 'photo') return { kind, full: String(meta.full || ''), thumb: String(meta.thumb || ''), city: String(meta.city || um.label || '') };
    if (kind === 'council') return { kind, title: um.label, verdict: String(meta.verdict || ''), confidence: meta.confidence as number, ruleEstablished: String(meta.ruleEstablished || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    // custom：用户自建 agent 的落点。通用渲染——meta 里带 agent 身份 + 标签，地球不认识具体哪个 agent。
    if (kind === 'custom') return { kind, title: um.label, agentName: String(meta.agentName || ''), emoji: String(meta.emoji || '📍'), domain: String(meta.domain || ''), color: String(meta.color || '#ff8a3d'), tags: (meta.tags && typeof meta.tags === 'object') ? (meta.tags as Record<string, string>) : {}, note: String(meta.note || ''), place: String(meta.place || ''), date: String(meta.date || '') };
    return { kind: 'music', title: um.label, city: String(meta.city || '') };
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

// 标定点：固定到西湖周边真实经纬度（WGS84，源自 OpenStreetMap / Wikidata）。
// 其中的「文字卡片」现已解耦为可拖动便贴（见 seedStickers）；此处保留绿点 + 照片 + 连线。
const ANNOTATIONS = [
  { id: 1, lng: 120.14703, lat: 30.260901, place: '断桥残雪', date: '03.14', text: '一株黄色的树变成了许多飞燕', dir: 'right', dx: 30, dy: -20, img: showcasePhotos[0]?.thumb, imgProps: { w: 60, h: 80, rot: -5, dx: -20, dy: 30 } },
  { id: 2, lng: 120.1416133, lat: 30.2542019, place: '平湖秋月', date: '03.15', text: '傍晚的光线金黄而辽远', dir: 'left', dx: -40, dy: 20, img: showcasePhotos[1]?.thumb, imgProps: { w: 70, h: 70, rot: 8, dx: 40, dy: -10 } },
  { id: 3, lng: 120.1405, lat: 30.2408, place: '三潭印月', date: '03.18', text: '月光啊，忧伤，美丽，静寂', dir: 'right', dx: 35, dy: 15, img: showcasePhotos[2]?.thumb, imgProps: { w: 80, h: 60, rot: -3, dx: -50, dy: 40 } },
  { id: 4, lng: 120.13739, lat: 30.23439, place: '花港观鱼', date: '03.20', text: '友好的夜晚被点亮', dir: 'left', dx: -20, dy: -30, img: showcasePhotos[3]?.thumb, imgProps: { w: 65, h: 85, rot: 6, dx: 25, dy: 35 } },
  { id: 5, lng: 120.14501, lat: 30.23388, place: '雷峰塔', date: '03.21', text: '只有湖中的一对天鹅', dir: 'left', dx: -35, dy: -10, img: showcasePhotos[4]?.thumb, imgProps: { w: 82, h: 60, rot: -4, dx: -28, dy: 32 } },
  { id: 6, lng: 120.12868, lat: 30.25217, place: '曲院风荷', date: '03.22', text: '一切的峰巅沉寂', dir: 'right', dx: 25, dy: -25, img: showcasePhotos[5]?.thumb, imgProps: { w: 84, h: 60, rot: 5, dx: 32, dy: 30 } },
];

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
  const annotations = ANNOTATIONS;

  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // 地图标记图层：哪些类型可见（初始全部 7 类，由左下角图例开关切换）
  const [visibleKinds, setVisibleKinds] = useState<Set<MarkerKind>>(() => new Set<MarkerKind>(['music', 'photo', 'movie', 'book', 'travel', 'council', 'custom']));
  // 电影/书标记懒加载完成后翻转，触发统计与图层重算
  const [markersReady, setMarkersReady] = useState(false);
  // 状态条实时统计：当前可见图层的标记数 + 去重城市数（随左下角图层开关 / 懒加载补点变化）
  const visibleMarkers = useMemo(() => MAP_MARKERS.filter((m) => visibleKinds.has(m.kind)), [visibleKinds, markersReady]);
  const cityCount = useMemo(
    () => new Set(visibleMarkers.filter((m) => m.kind === 'music' || m.kind === 'photo').map((m) => (m.label || '').split(',')[0].trim()).filter(Boolean)).size,
    [visibleMarkers],
  );
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
  const [moodStyle, setMoodStyle] = useState<'color' | 'card'>('color'); // 「+」可产出两种便贴：彩色 / 白卡片
  // 点击标记后的详情弹层
  const [selected, setSelected] = useState<MarkerDetailData | null>(null);

  // 刷新 mapbox 两个源（拖动落点后让底层方块/圆点跟到新位置；不在拖动每帧调用，避免大量要素重建卡顿）
  const refreshMapSources = () => {
    if (!map) return;
    const ms = map.getSource('marks') as mapboxgl.GeoJSONSource | undefined;
    if (ms) ms.setData(buildMarksData() as never);
    const ps = map.getSource('planets') as mapboxgl.GeoJSONSource | undefined;
    if (ps) ps.setData(planetsToGeoJSON() as never);
    const ls = map.getSource('tripLines') as mapboxgl.GeoJSONSource | undefined;
    if (ls) ls.setData(buildTripLines() as never);
  };

  // 通用 DOM 拖动：便贴与照片拍立得共用。记录被拖 id、「光标↔锚点」初始偏移、update/commit 回调。
  // 拖动中只走 update（更新内存 + 重渲染重投影），松手才 commit 落盘并刷新底层源。
  const dragRef = useRef<{ id: string; ox: number; oy: number; moved: boolean; update: (id: string, lat: number, lng: number) => void; commit: () => void } | null>(null);
  const suppressClick = useRef(false); // 拖动过则吞掉随后那次 click（避免误开详情/灯箱）
  const beginDrag = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }, update: (id: string, lat: number, lng: number) => void, commit: () => void) => {
    if (!map) return;
    e.stopPropagation();
    suppressClick.current = false;
    const r = map.getContainer().getBoundingClientRect();
    dragRef.current = { id, ox: e.clientX - r.left - anchor.x, oy: e.clientY - r.top - anchor.y, moved: false, update, commit };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !map) return;
    d.moved = true;
    const r = map.getContainer().getBoundingClientRect();
    const ll = map.unproject([e.clientX - r.left - d.ox, e.clientY - r.top - d.oy]);
    d.update(d.id, ll.lat, ll.lng);
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (d.moved) { d.commit(); refreshMapSources(); suppressClick.current = true; }
    dragRef.current = null;
  };
  // 便贴拖动入口（update 用经纬度顺序 lat,lng → 心情贴存储）
  const stickerDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, updateMoodStickerPos, commitStickers);
  // 照片拖动入口（update 转成覆盖存储的 lng,lat 顺序）
  const photoDragStart = (e: React.PointerEvent, id: string, anchor: { x: number; y: number }) =>
    beginDrag(e, id, anchor, (pid, lat, lng) => setOverride(pid, lng, lat), commitOverrides);

  // 一次性把「已有的白色 LOC_SYNC 卡片」种入便贴库 → 解耦成可拖动的白卡片便贴
  useEffect(() => {
    seedStickers(
      ANNOTATIONS.map((a) => ({
        id: 'seed-' + a.id, lat: a.lat, lng: a.lng, text: a.text, place: a.place,
        color: '#ffffff', rot: pickRot('seed-' + a.id), variant: 'card' as const, date: a.date,
      })),
    );
  }, []);

  // 地图就绪后，懒加载电影/书标记（含 douban 大 JSON），补进 marks 源 + 刷新统计。
  // 不拖慢首屏地图渲染；详情查找表（movieById/bookById）也在此填好，点开标记即可拿到简介。
  // 竞态安全：若懒加载先于 marks 源建立而 resolve，则等地图 idle 后再刷新。
  useEffect(() => {
    if (!map) return;
    let alive = true;
    ensureHeavyMarkers()
      .then(() => {
        if (!alive) return;
        setMarkersReady(true);
        if (map.getSource('marks')) refreshMapSources();
        else map.once('idle', () => { if (alive) refreshMapSources(); });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [map]);

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
      // 行程连线层（在标记层之下）：同 tripId 的落点按 seq 连成虚线轨迹
      map.addSource('tripLines', { type: 'geojson', data: buildTripLines() as never });
      map.addLayer({
        id: 'trip-line-layer',
        type: 'line',
        source: 'tripLines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ff3b6b',
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 8, 2.5, 13, 4],
          'line-opacity': 0.7,
          'line-dasharray': [2, 1.5],
        },
      } as never);
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
      const ls = map.getSource('tripLines') as mapboxgl.GeoJSONSource | undefined;
      if (ls) ls.setData(buildTripLines() as never);
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
  // 位置覆盖变化（拖动校对落点）→ 重渲染：DOM 照片即时重投影；底层方块/圆点在松手时由 refreshMapSources 刷新
  useEffect(() => subscribeOverrides(() => tick()), []);

  // 点击标记 → 弹出详情；悬停变手型；按下拖动 → 校正落点（音乐/书/电影/行程方块 + 星球圆点）
  useEffect(() => {
    if (!map) return;
    // 拖动过则吞掉随后那次 click（避免误开详情）；每次 mousedown 重置，纯点击不受影响
    let suppressMark = false;
    let suppressPlanet = false;
    let dragging = false; // 拖动中：抑制 enter/leave 改光标

    const onClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (suppressMark) { suppressMark = false; return; }
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const d = resolveDetail(String(f.properties.id), f.properties.kind as MarkerKind, String(f.properties.label || ''));
      if (d) setSelected(d);
    };
    const onPlanetClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (suppressPlanet) { suppressPlanet = false; return; }
      const f = e.features && e.features[0];
      if (!f || !f.properties) return;
      const ph = planetPhotoById(String(f.properties.id));
      if (!ph) return;
      setSelected({ kind: 'photo', full: ph.full, thumb: ph.thumb, city: ph.alt || '照片', authorName: ph.author, authorLink: ph.authorUrl, photoLink: ph.link });
      trackDownload(ph.downloadLocation); // 看大图触发 Unsplash 合规埋点
    };
    const enter = () => { if (!dragging) map.getCanvas().style.cursor = 'pointer'; };
    const leave = () => { if (!dragging) map.getCanvas().style.cursor = ''; };

    // mapbox 原生特征拖动工厂：按下捕获要素 id → 拖动更新覆盖并 rAF 刷新源 → 松手落盘
    const writeSource = (sourceId: string, buildData: () => unknown) => {
      const s = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
      if (s) s.setData(buildData() as never);
    };
    const makeDrag = (sourceId: string, buildData: () => unknown, onDownReset: () => void, onMovedSet: () => void) => {
      let id: string | null = null;
      let moved = false;
      let raf = 0;
      let ll: mapboxgl.LngLat | null = null;
      const apply = () => {
        raf = 0;
        if (!id || !ll) return;
        setOverride(id, ll.lng, ll.lat);
        writeSource(sourceId, buildData);
      };
      const move = (e: mapboxgl.MapMouseEvent) => {
        if (!id) return;
        moved = true;
        ll = e.lngLat;
        if (!raf) raf = requestAnimationFrame(apply); // rAF 节流，避免每帧重建大量要素
      };
      // 松手挂在 window：拖到 DOM 叠层 / 窗口外松手也能收尾（否则点会「黏」在光标上、监听泄漏）
      const up = () => {
        map.off('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        dragging = false;
        map.getCanvas().style.cursor = '';
        if (id && moved && ll) {          // 冲刷最后一帧，确保松手处落点写入并落盘（修 rAF 丢帧）
          setOverride(id, ll.lng, ll.lat);
          writeSource(sourceId, buildData);
          commitOverrides();
          onMovedSet();
        }
        id = null; ll = null;
      };
      const down = (e: mapboxgl.MapLayerMouseEvent) => {
        const f = e.features && e.features[0];
        if (!f || !f.properties) return;
        e.preventDefault(); // 阻止地图平移，改为拖动这个点
        onDownReset();
        id = String(f.properties.id);
        moved = false;
        ll = null;
        dragging = true;
        map.getCanvas().style.cursor = 'grabbing';
        map.on('mousemove', move);
        window.addEventListener('mouseup', up, { once: true });
      };
      return down;
    };
    const onMarkDown = makeDrag('marks', buildMarksData, () => { suppressMark = false; }, () => { suppressMark = true; });
    const onPlanetDown = makeDrag('planets', planetsToGeoJSON, () => { suppressPlanet = false; }, () => { suppressPlanet = true; });

    const bind = () => {
      if (map.getLayer('mark-layer')) {
        map.on('click', 'mark-layer', onClick);
        map.on('mousedown', 'mark-layer', onMarkDown);
        map.on('mouseenter', 'mark-layer', enter);
        map.on('mouseleave', 'mark-layer', leave);
      }
      if (map.getLayer('planet-layer')) {
        map.on('click', 'planet-layer', onPlanetClick);
        map.on('mousedown', 'planet-layer', onPlanetDown);
        map.on('mouseenter', 'planet-layer', enter);
        map.on('mouseleave', 'planet-layer', leave);
      }
    };
    if (map.isStyleLoaded() && map.getLayer('mark-layer')) bind();
    else map.once('idle', bind);
    return () => {
      map.off('click', 'mark-layer', onClick);
      map.off('mousedown', 'mark-layer', onMarkDown);
      map.off('mouseenter', 'mark-layer', enter);
      map.off('mouseleave', 'mark-layer', leave);
      map.off('click', 'planet-layer', onPlanetClick);
      map.off('mousedown', 'planet-layer', onPlanetDown);
      map.off('mouseenter', 'planet-layer', enter);
      map.off('mouseleave', 'planet-layer', leave);
    };
  }, [map]);

  // 细节层（照片/紫点/文字/连线）显隐程度
  const detail = clamp01((zoom - DETAIL_START) / (DETAIL_FULL - DETAIL_START));
  // 网格显隐程度（低于 GRID_START 直接为 0 → 消失）
  const gridOpacity = clamp01((zoom - GRID_START) / (GRID_FULL - GRID_START));

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
    const d = new Date();
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    addMoodSticker({
      id, lat, lng, text: t, place, rot: pickRot(id),
      variant: moodStyle,
      color: moodStyle === 'card' ? '#ffffff' : pickStickerColor(t),
      date: moodStyle === 'card' ? date : undefined,
    });
    setMoodText(''); setMoodOpen(false); setMoodBusy(false);
    if (map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 3.2) });
  };

  return (
    <div className="flex flex-col h-full bg-[#EAEAEA] font-sans relative overflow-hidden">
      {/* Top Bar Status */}
      <div className="flex justify-center items-center h-[30px] px-4 border-b-2 border-black bg-[#EAEAEA]">
        <div className="font-pixel text-[10.4px] uppercase tracking-widest leading-none">POCKET EARTH</div>
      </div>

      {/* Header Area */}
      <div className="px-4 py-4 border-b-2 border-black bg-white">
        <h1 className="font-pixel text-xl uppercase tracking-wider mb-2">MY MAP</h1>
        <p className="text-xs text-black/70 tracking-wide font-medium">
          城市属于我们<br />
          <span className="text-black/70 text-[9px] font-pixel block mt-1">The city, filling with your poems.</span>
        </p>
      </div>

      {/* Stat Strip */}
      <div className="px-4 py-2.5 border-b-2 border-black bg-black text-[#00ff88]">
        <div className="font-pixel text-[9px] flex justify-center items-center gap-3 tracking-widest">
          <span>MARKERS: {visibleMarkers.length}</span>
          <span className="opacity-50">·</span>
          <span>CITIES: {cityCount}</span>
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

              {/* 照片（含紫色图钉）：仅街道级别出现 */}
              {showDetail && ann.img && ann.imgProps && (
                <div
                  className="group pointer-events-auto cursor-pointer absolute bg-white p-1 border border-black shadow-[3px_3px_0px_rgba(0,0,0,0.8)] z-0"
                  style={{
                    width: `${ann.imgProps.w}px`,
                    height: `${ann.imgProps.h}px`,
                    transform: `translate(${ann.imgProps.dx}px, ${ann.imgProps.dy}px) rotate(${ann.imgProps.rot}deg)`,
                    opacity: detail,
                  }}
                >
                  {/* 紫色图钉（只有放大看清街道后才存在） */}
                  <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border border-black shadow-sm z-10"></div>
                  <ImageWithFallback src={ann.img} alt={ann.text} className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-active:grayscale-0 opacity-90 group-hover:opacity-100 contrast-125 transition-all duration-500 border border-black/20" />
                </div>
              )}

              {/* 文字卡片已解耦为可拖动的「白卡片便贴」（见心情贴图层 / seedStickers） */}
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
          // 拍立得照片贴：可鼠标拖动重新摆放（解耦校对落点）；未拖动则点击看大图
          const polaroid = (key: string, oid: string, lng: number, lat: number, thumb: string, h: number, pin: string, onClick: () => void) => {
            const [olng, olat] = applyOverride(oid, lng, lat); // 拖动校正后的落点
            const pt = map.project([olng, olat]);
            const tall = h % 2 === 0; const rot = (h % 7) - 3;
            return (
              <button key={key}
                aria-label="查看照片大图"
                onPointerDown={(e) => photoDragStart(e, oid, pt)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onClick(); }}
                className="absolute z-[15] bg-white p-1 pb-2.5 border border-black/50 shadow-[2px_3px_6px_rgba(0,0,0,0.4)] active:scale-95 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: '58px', transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-black" style={{ background: pin }} />
                <div className={`w-full ${tall ? 'aspect-[3/4]' : 'aspect-square'} overflow-hidden bg-[#d8d8d6]`}>
                  <img src={thumb} alt="" className="w-full h-full object-cover grayscale hover:grayscale-0 active:grayscale-0 transition-all duration-500" loading="lazy" draggable={false} />
                </div>
              </button>
            );
          };
          for (const m of PHOTO_MARKERS) {
            if (!m.thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('pv-' + m.id, m.id, m.lng, m.lat, m.thumb, phash(m.id), '#ff00ff',
              () => setSelected({ kind: 'photo', full: m.full, thumb: m.thumb, city: (m.label || '').split(',')[0], authorName: m.author, authorLink: m.authorLink, photoLink: m.photoLink })));
            if (out.length >= 70) break;
          }
          // 用户自己钉的照片（照片整理 agent 写入 userMarks）：青钉拍立得，点开看缩略大图
          for (const m of getUserMarksByKind('photo')) {
            const meta = (m.meta || {}) as Record<string, unknown>;
            const thumb = String(meta.thumb || '');
            if (!thumb) continue;
            const [mlng, mlat] = applyOverride(m.id, m.lng, m.lat);
            if (!b || !b.contains([mlng, mlat])) continue;
            out.push(polaroid('um-' + m.id, m.id, m.lng, m.lat, thumb, phash(m.id), '#00e5ff',
              () => setSelected({ kind: 'photo', full: String(meta.full || thumb), thumb, city: String(meta.city || m.label || '我的照片') })));
            if (out.length >= 130) break;
          }
          for (const pl of getVisiblePlanets()) {
            for (const ph of pl.photos) {
              const [plng, plat] = applyOverride(ph.id, ph.lng, ph.lat);
              if (!b || !b.contains([plng, plat])) continue;
              out.push(polaroid('pp-' + ph.id, ph.id, ph.lng, ph.lat, ph.thumb, phash(ph.id), pl.color,
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
                aria-label={`心情：${s.text}`}
                onClick={() => map.flyTo({ center: [s.lng, s.lat], zoom: 8 })}
                className="absolute z-[18] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black shadow-[1px_1px_0_rgba(0,0,0,0.4)] pointer-events-auto active:scale-90"
                style={{ left: `${pt.x}px`, top: `${pt.y}px`, width: `${sz}px`, height: `${sz}px`, background: '#ff00ff' }}
              />
            );
          }
          // 放大后：展开成卡片，鼠标可拖动重新摆放（白卡片 / 彩色两种风格）
          const isCard = s.variant === 'card';
          return (
            <div
              key={s.id}
              className="absolute z-[18] -translate-x-1/2 -translate-y-full group pointer-events-auto cursor-grab active:cursor-grabbing select-none touch-none"
              style={{ left: `${pt.x}px`, top: `${pt.y}px` }}
              onPointerDown={(e) => stickerDragStart(e, s.id, pt)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
            >
              <div
                className={`relative border-2 border-black shadow-[2px_3px_0_rgba(0,0,0,0.6)] px-2 py-1.5 max-w-[160px] ${isCard ? 'bg-white' : ''}`}
                style={{ ...(isCard ? {} : { background: s.color }), transform: `rotate(${s.rot}deg)` }}
              >
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-black" />
                {isCard ? (
                  <>
                    <div className="font-pixel text-[6px] text-black/60 mb-1 tracking-widest">{s.date} • LOC_SYNC</div>
                    <div className="text-[11px] font-bold leading-none text-black break-words">{s.text}</div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] leading-snug text-black font-medium break-words">{s.text}</div>
                    <div className="font-pixel text-[6px] text-black/55 tracking-wider mt-1">◍ {s.place} · 心情贴</div>
                  </>
                )}
                <button
                  aria-label="删除这条心情"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeMoodSticker(s.id)}
                  className="absolute -top-2.5 -right-2.5 w-4 h-4 bg-black border border-black text-white items-center justify-center hidden group-hover:flex"
                >
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
              {/* 风格切换：彩色心情贴 / 白色 LOC_SYNC 卡片 */}
              <div className="flex gap-1.5 mb-1.5">
                <button onClick={() => setMoodStyle('color')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'color' ? 'bg-[#ffe08a] font-bold' : 'bg-white text-black/55'}`}>彩色</button>
                <button onClick={() => setMoodStyle('card')} className={`flex-1 border-2 border-black text-[9px] py-0.5 ${moodStyle === 'card' ? 'bg-black text-white font-bold' : 'bg-white text-black/55'}`}>白卡片</button>
              </div>
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

        {/* 左下角图例 + 图层开关（基础各类方块 + 用户星球圆点，可开闭）*/}
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
        {selected && <MarkerDetail data={selected} onClose={() => setSelected(null)} onRemove={(id) => { removeUserMark(id); refreshMapSources(); }} />}
      </AnimatePresence>
    </div>
  );
}
