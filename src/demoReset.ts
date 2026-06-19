// ───────────────────────────────────────────────────────────────────────────
// Demo 重置模式（必须最先执行）：每次加载（刷新 / 新开标签页）清空本应用的运行时数据，
// 让页面回到干净的初始演示态。目的——线上 demo 谁试玩谁的数据互不残留、互不影响：
// 任何人新建的 agent、钉的点、改的画像 / 评分 / 听歌记录…刷新即清零，不写进任何人的数据里。
//
// 边界（关键）：只清【本应用自己】的数据：
//   · localStorage：所有 `pe.` / `pe-` 前缀的 key（userMarks / profile / 自建 agent / 各偏好…）
//   · IndexedDB：所有 `pe-` 前缀的库（pe-photos / pe-movies / pe-books）
// 绝不碰 WebLLM 端侧模型缓存（CacheStorage 的 webllm/*，约 400MB）与 mapbox 地图瓦片——
// 否则每次刷新都要重下模型 / 瓦片。静态演示标记（MAP_MARKERS 等）写在代码里、不在存储中，刷新本就保留。
//
// 后门：URL 带 `?keep` 时跳过清零（开发自测 / 需要保留数据的特殊演示用）。
// 关掉 demo 模式（将来要做真持久化）：把 DEMO_RESET 改 false，或删掉 main.tsx 里这行 import。
// ───────────────────────────────────────────────────────────────────────────
const DEMO_RESET = true;

(function demoReset() {
  if (!DEMO_RESET) return;
  try {
    if (typeof location !== 'undefined' && /[?&]keep\b/.test(location.search)) return;

    // ① localStorage：同步清，确保后续各 store 模块 load 时读到的就是空（回初始）
    if (typeof localStorage !== 'undefined') {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('pe.') || k.startsWith('pe-')) localStorage.removeItem(k);
      }
    }

    // ② IndexedDB：异步删 pe-* 库（首次加载无连接占用，会很快删完，在用户点开 agent 用到之前）
    if (typeof indexedDB !== 'undefined') {
      const fallback = ['pe-photos', 'pe-movies', 'pe-books'];
      const listFn = (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> }).databases;
      if (typeof listFn === 'function') {
        listFn.call(indexedDB)
          .then((arr) => arr.forEach((d) => { if (d.name && d.name.startsWith('pe-')) indexedDB.deleteDatabase(d.name); }))
          .catch(() => fallback.forEach((n) => indexedDB.deleteDatabase(n)));
      } else {
        fallback.forEach((n) => indexedDB.deleteDatabase(n));
      }
    }
  } catch { /* 隐私模式 / 异常：忽略，至多没清干净，不影响打开 */ }
})();
