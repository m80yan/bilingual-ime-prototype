import generatedDomainGlossarySeedEntries from "./generatedDomainGlossarySeed.json" with { type: "json" };

// Reviewed seed terms for the in-browser editable glossary and backend guidance.
// Keep this list compact: it should improve candidate quality for product demos,
// not become a general dictionary.
const reviewedDomainGlossarySeedEntries = [
  { zh: "设计", pinyin: "sheji", en: "design", ja: "デザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "设计师", pinyin: "shejishi", en: "designer", ja: "デザイナー", domain: "design-uiux", status: "reviewed" },
  { zh: "产品设计", pinyin: "chanpinsheji", en: "product design", ja: "プロダクトデザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "交互设计", pinyin: "jiaohusheji", en: "interaction design", ja: "インタラクションデザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "视觉设计", pinyin: "shijuesheji", en: "visual design", ja: "ビジュアルデザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "用户体验", pinyin: "yonghutiyan", en: "user experience", ja: "ユーザー体験", domain: "design-uiux", status: "reviewed" },
  { zh: "用户界面", pinyin: "yonghujiemian", en: "user interface", ja: "ユーザーインターフェース", domain: "design-uiux", status: "reviewed" },
  { zh: "界面设计", pinyin: "jiemiansheji", en: "interface design", ja: "インターフェースデザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "信息架构", pinyin: "xinxijiagou", en: "information architecture", ja: "情報設計", domain: "design-uiux", status: "reviewed" },
  { zh: "设计系统", pinyin: "shejixitong", en: "design system", ja: "デザインシステム", domain: "design-uiux", status: "reviewed" },
  { zh: "组件库", pinyin: "zujianku", en: "component library", ja: "コンポーネントライブラリ", domain: "design-uiux", status: "reviewed" },
  { zh: "原型", pinyin: "yuanxing", en: "prototype", ja: "プロトタイプ", domain: "design-uiux", status: "reviewed" },
  { zh: "线框图", pinyin: "xiankuangtu", en: "wireframe", ja: "ワイヤーフレーム", domain: "design-uiux", status: "reviewed" },
  { zh: "用户流程", pinyin: "yonghuliucheng", en: "user flow", ja: "ユーザーフロー", domain: "design-uiux", status: "reviewed" },
  { zh: "用户旅程", pinyin: "yonghulvcheng", en: "user journey", ja: "ユーザージャーニー", domain: "design-uiux", status: "reviewed" },
  { zh: "可用性测试", pinyin: "keyongxingceshi", en: "usability testing", ja: "ユーザビリティテスト", domain: "design-uiux", status: "reviewed" },
  { zh: "易用性", pinyin: "yiyongxing", en: "usability", ja: "ユーザビリティ", domain: "design-uiux", status: "reviewed" },
  { zh: "无障碍", pinyin: "wuzhangai", en: "accessibility", ja: "アクセシビリティ", domain: "design-uiux", status: "reviewed" },
  { zh: "响应式设计", pinyin: "xiangyingshisheji", en: "responsive design", ja: "レスポンシブデザイン", domain: "design-uiux", status: "reviewed" },
  { zh: "排版", pinyin: "paiban", en: "typography", ja: "タイポグラフィ", domain: "design-uiux", status: "reviewed" },
  { zh: "层级", pinyin: "cengji", en: "hierarchy", ja: "階層", domain: "design-uiux", status: "reviewed" },
  { zh: "留白", pinyin: "liubai", en: "white space", ja: "余白", domain: "design-uiux", status: "reviewed" },
  { zh: "对齐", pinyin: "duiqi", en: "align / sync up", ja: "認識合わせ", domain: "internet-slang", status: "reviewed" },
  { zh: "对齐一下", pinyin: "duiqiyixia", en: "align on this", ja: "認識合わせをする", domain: "internet-slang", status: "reviewed" },
  { zh: "+1", pinyin: "jiayi", en: "+1", ja: "+1", domain: "internet-slang", status: "reviewed" },
  { zh: "绩效", pinyin: "jixiao", en: "performance review", ja: "人事評価", domain: "internet-slang", status: "reviewed" },
  { zh: "优化", pinyin: "youhua", en: "optimize", ja: "最適化する", domain: "internet-slang", status: "reviewed" },
  { zh: "裁员", pinyin: "caiyuan", en: "layoffs", ja: "人員削減", domain: "internet-slang", status: "reviewed" },
  { zh: "落地", pinyin: "luodi", en: "land / put into practice", ja: "実行に移す", domain: "internet-slang", status: "reviewed" },
  { zh: "体验走查", pinyin: "tiyanzoucha", en: "UX walkthrough", ja: "UXレビュー", domain: "design-uiux", status: "reviewed" },
  { zh: "点击区域", pinyin: "dianjiquyu", en: "tap target", ja: "タップ領域", domain: "design-uiux", status: "reviewed" },
  { zh: "转化率", pinyin: "zhuanhualv", en: "conversion rate", ja: "コンバージョン率", domain: "internet-slang", status: "reviewed" },
  { zh: "启动页", pinyin: "qidongye", en: "splash screen", ja: "スプラッシュ画面", domain: "design-uiux", status: "reviewed" },
  { zh: "蒙古枷锁", pinyin: "menggujiasuo", en: "the Mongol yoke", ja: "モンゴルのくびき", domain: "history", aliases: ["蒙古统治"], status: "reviewed" },
  { zh: "鞑靼枷锁", pinyin: "dadajiasuo", en: "the Tatar yoke", ja: "タタールのくびき", domain: "history", aliases: ["鞑靼人的枷锁"], status: "reviewed" },
  { zh: "金帐汗国", pinyin: "jinzhanghanguo", en: "the Golden Horde", ja: "ジョチ・ウルス", domain: "history", status: "reviewed" },
  { zh: "基辅罗斯", pinyin: "jifuluosi", en: "Kievan Rus'", ja: "キエフ・ルーシ", domain: "history", status: "reviewed" },
  { zh: "罗斯诸公国", pinyin: "luosizhugongguo", en: "the Rus' principalities", ja: "ルーシ諸公国", domain: "history", status: "reviewed" },
  { zh: "莫斯科", pinyin: "mosike", en: "Moscow", ja: "モスクワ", domain: "place", status: "reviewed" },
  { zh: "星球大战计划", pinyin: "xingqiudazhanjihua", en: "the Strategic Defense Initiative", ja: "戦略防衛構想", domain: "history-politics", aliases: ["战略防御倡议"], status: "reviewed" },
  { zh: "中央情报局", pinyin: "zhongyangqingbaoju", en: "Central Intelligence Agency", ja: "中央情報局", domain: "history-politics", aliases: ["CIA"], status: "reviewed" },
  { zh: "西历", pinyin: "xili", en: "the Western calendar", ja: "西暦", domain: "general", status: "reviewed" },
  { zh: "车机系统", pinyin: "chejixitong", en: "in-car system", ja: "車載システム", domain: "auto", status: "reviewed" },
  { zh: "OTA升级", pinyin: "otashengji", en: "OTA update", ja: "OTAアップデート", domain: "auto", aliases: ["ota升级"], status: "reviewed" },
  { zh: "OTA", pinyin: "ota", en: "OTA", ja: "OTA", domain: "auto", status: "reviewed" },
  { zh: "螺旋桨", pinyin: "luoxuanjiang", en: "propeller", ja: "プロペラ", domain: "technology", weight: 112, status: "reviewed" },
  { zh: "登录", pinyin: "denglu", en: "log in", ja: "ログインする", domain: "ui", aliases: ["登陆"], status: "reviewed" },
  { zh: "签到", pinyin: "qiandao", en: "sign in", ja: "チェックインする", domain: "ui", status: "reviewed" },
  { zh: "票房", pinyin: "piaofang", en: "box office", ja: "興行収入", domain: "movie", status: "reviewed" },
  { zh: "枪战片", pinyin: "qiangzhanpian", en: "action film", ja: "アクション映画", domain: "movie", status: "reviewed" },
  { zh: "Mate 70 Pro", pinyin: "mateqilingpro", en: "Mate 70 Pro", ja: "Mate 70 Pro", domain: "device", aliases: ["mate70pro", "Mate70Pro", "华为Mate70Pro"], status: "reviewed" },
  { zh: "华为Mate70Pro", pinyin: "huaweimateqilingpro", en: "Huawei Mate 70 Pro", ja: "Huawei Mate 70 Pro", domain: "device", aliases: ["华为 Mate 70 Pro"], status: "reviewed" },
];

export const domainGlossarySeedEntries = [
  ...reviewedDomainGlossarySeedEntries,
  ...generatedDomainGlossarySeedEntries,
];

const domainDefaultWeights = {
  "design-uiux": 95,
  "internet-slang": 92,
  history: 86,
  "history-politics": 86,
  place: 84,
  auto: 90,
  business: 84,
  marine: 84,
  medical: 84,
  military: 84,
  ui: 88,
  movie: 88,
  device: 88,
  technology: 88,
  general: 80,
};

export function glossaryEntryWeight(entry) {
  return entry.weight ?? domainDefaultWeights[entry.domain] ?? 70;
}

export function normalizeGlossaryPinyin(value) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function buildGlossaryPinyinIndex(entries = domainGlossarySeedEntries) {
  return entries.reduce((index, entry) => {
    const key = normalizeGlossaryPinyin(entry.pinyin);
    if (!key) return index;
    if (!index[key]) index[key] = [];
    index[key].push(entry);
    index[key].sort((left, right) => glossaryEntryWeight(right) - glossaryEntryWeight(left));
    return index;
  }, {});
}

export const domainGlossaryPinyinIndex = buildGlossaryPinyinIndex();
