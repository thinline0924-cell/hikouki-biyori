// 機体と「ちいさな発見」(やりこみ要素)のデータ

// cruise / boost / min は速さ(m/秒)。turn は旋回のしやすさ、clear は地面からの余白
export const CRAFTS = [
  {
    id: 'plane', name: 'ひばり号', type: 'プロペラ機',
    desc: 'いちばん素直な、高翼の小さなプロペラ機。\nはじめての遊覧なら、まずはこの子と。',
    cruise: 42, boost: 66, min: 24, maxRoll: 1.0, rollRate: 2.2, pitchRate: 0.9, turn: 0.75, clear: 1.62, gearH: 1.62, vr: 25, gacc: 5.5,
    cam: [24, 7], engine: 'prop', pitch: 70, stats: [3, 3, 3],
  },
  {
    id: 'biplane', name: 'とんぼ号', type: '複葉機',
    desc: '翼が二枚かさなった、むかしながらの飛行機。\nくるりと小回りがきいて、低空の散歩にむいている。',
    cruise: 34, boost: 54, min: 18, maxRoll: 1.15, rollRate: 2.9, pitchRate: 1.1, turn: 0.95, clear: 1.66, gearH: 1.66, vr: 19, gacc: 5.5, groundPitch: 0.16,
    cam: [21, 6], engine: 'prop', pitch: 58, stats: [2, 4, 3],
  },
  {
    id: 'glider', name: 'かもめ号', type: 'グライダー',
    desc: 'エンジンのない、しずかな飛行機。\n上昇気流(白い粒がのぼる所)に乗って、高さをかせごう。',
    cruise: 26, boost: 26, min: 14, max: 70, maxRoll: 0.95, rollRate: 1.7, pitchRate: 0.8, turn: 0.72, clear: 0.6, gearH: 0.6, vr: 20, gacc: 0,
    cam: [26, 6], engine: 'none', pitch: 0, glider: true, stats: [2, 3, 5],
  },
  {
    id: 'seaplane', name: 'うみねこ号', type: '水上飛行機',
    desc: '足のかわりに浮きがついた飛行機。\n水の上から飛びたち、水の上におりられる。',
    cruise: 38, boost: 58, min: 22, takeoff: 27, maxRoll: 0.95, rollRate: 2.0, pitchRate: 0.85, turn: 0.7, clear: 2.5,
    cam: [24, 7], engine: 'prop', pitch: 64, seaplane: true, stats: [3, 3, 4],
  },
  {
    id: 'jet', name: 'つばめ号', type: '小型旅客機',
    desc: 'ジェットエンジンの、すこし大きな飛行機。\n速くて、長い距離をいっきに遊覧できる。',
    cruise: 80, boost: 125, min: 50, maxRoll: 0.85, rollRate: 1.3, pitchRate: 0.6, turn: 0.42, clear: 2.7, gearH: 2.7, vr: 52, gacc: 4.2,
    cam: [42, 11], engine: 'jet', pitch: 110, stats: [5, 1, 2],
  },
  {
    id: 'balloon', name: 'たんぽぽ号', type: '熱気球',
    desc: '風まかせの熱気球。高さによって風の向きがかわる。\nバーナーでのぼり、弁をあけてゆっくりおりよう。',
    cruise: 0, boost: 0, min: 0, clear: 0, cam: [38, 14], engine: 'burner', balloon: true, stats: [1, 1, 5],
  },
  {
    id: 'car', name: 'こまち号', type: '小さな車',
    desc: 'まるっこい、むかしの小さな自動車。\n街の道や丘を、のんびり地上から遊覧しよう。',
    ground: true, cruise: 0, top: 24, boost: 33, accel: 6, steer: 0.75, grip: 6, rad: 1.0, clear: 0,
    cam: [11, 6], engine: 'car', stats: [2, 3, 4],
  },
  {
    id: 'scooter', name: 'ことり号', type: '原付',
    desc: 'とことこ走る、小さな原付バイク。\nせまい道もすいすい。曲がるときに体をかたむける。',
    ground: true, cruise: 0, top: 15, boost: 18, accel: 5, steer: 1.1, grip: 8, rad: 0.5, clear: 0,
    cam: [8, 4.5], engine: 'scooter', stats: [1, 5, 5],
  },
];

export const ACHIEVEMENTS = [
  { id: 'cloud', name: '雲のなか', desc: '雲の中をとおりぬけた' },
  { id: 'gate', name: '門をくぐる', desc: '岩や氷のアーチをくぐりぬけた' },
  { id: 'skim', name: '水面すれすれ', desc: '水面から8m以下を5秒飛んだ' },
  { id: 'high', name: '空のてっぺん', desc: '高度1000mまで上がった' },
  { id: 'splash', name: 'しずかな着水', desc: '水上飛行機で水におりた' },
  { id: 'thermal', name: '上昇気流', desc: 'グライダーで上昇気流に乗り、100m上がった' },
  { id: 'drift', name: '風まかせ', desc: '気球で風に乗って1km旅をした' },
  { id: 'chain', name: 'ひかりの旋律', desc: 'ひかりの粒を30こ続けて集めた' },
  { id: 'photo', name: '空の写真家', desc: '写真を10枚とった' },
  { id: 'road', name: '寄り道ドライブ', desc: '車か原付で2km走った' },
  { id: 'takeoff', name: 'はじめての離陸', desc: '滑走路から空へ飛びたった' },
  { id: 'landing', name: 'ぶじに着陸', desc: '飛行機で地面におりた' },
  { id: 'butter', name: 'なめらか着陸', desc: '滑走路に、そっと(1.6m/秒より遅く)おりた' },
  { id: 'allcraft', name: 'のりもの好き', desc: '8つのりものぜんぶに乗った' },
  { id: 'course', name: 'コースめぐり', desc: 'ひとつのコースの見どころをぜんぶ見つけた' },
  { id: 'master', name: '遊覧の達人', desc: 'すべての見どころを見つけた' },
];
