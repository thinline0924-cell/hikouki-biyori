// 記録の保存(ブラウザの localStorage だけ。外へは送らない)
const KEY = 'hikouki-biyori-v1';

const blank = () => ({
  stamps: {}, // コースID → 見つけた見どころIDの配列
  motes: 0, // 集めたひかりの粒(通算)
  bestChain: 0,
  flown: [], // 飛んだことのある機体
  ach: [], // ちいさな発見
  photos: [], // { img, course, craft, date }
  settings: { music: true, sfx: true, invert: false, quality: -1, start: 'runway' },
  last: { craft: 'plane', course: 'islands' },
});

let data = blank();
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      data = { ...blank(), ...d, settings: { ...blank().settings, ...(d.settings || {}) }, last: { ...blank().last, ...(d.last || {}) } };
    }
  } catch (e) {
    data = blank();
  }
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    // 容量がいっぱいなら、古い写真から消してもう一度
    if (data.photos.length > 4) {
      data.photos.splice(0, 3);
      try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e2) { /* あきらめる */ }
    }
    return false;
  }
}

export const S = () => data;

export function addStamp(course, spot) {
  const list = data.stamps[course] || (data.stamps[course] = []);
  if (list.includes(spot)) return false;
  list.push(spot);
  save();
  return true;
}

export function hasAch(id) {
  return data.ach.includes(id);
}
export function addAch(id) {
  if (data.ach.includes(id)) return false;
  data.ach.push(id);
  save();
  return true;
}
