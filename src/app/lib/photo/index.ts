// 端侧整理照片 agent · 解耦模块公共出口（六层架构）。
export type { PhotoType, Verdict, PinSource, PhotoFeatures, PhotoResult, ScreenOpts, Phase } from './types';
export { runScreen } from './screen';
export {
  type PhotoPin, type Proposal,
  getPhotoPins, subscribePhotoPins, addPhotoPins, removePhotoPin, clearPhotoPins,
  coarsenForShare, buildProposal, toPins,
} from './geoPin';
export { learnFromOverride } from './critic';
export { getPrefs, recordPhotoOverride, clearGeo } from './store';

// 给 UI 看的类型/判定中文名
import type { PhotoType, Verdict } from './types';
export const TYPE_LABEL: Record<PhotoType, string> = {
  place: '风景地点', life: '人与生活', place_nogps: '实拍·待补地点',
  screenshot: '截图/网图', document: '文档/票据', junk: '废片', uncertain: '待定',
};
export const VERDICT_LABEL: Record<Verdict, string> = { keep: '留', review: '待定', clean: '可清理' };
export const VERDICT_COLOR: Record<Verdict, string> = { keep: '#00aa55', review: '#c08a00', clean: '#d23b3b' };
