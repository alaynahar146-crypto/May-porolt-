import type { Category, PlanDefinition, PlanId } from "./types";

export const PAY_NUMBER = "49727264";
export const WA_NUMBER = "22249727264";
export const FREE_LIMIT = 3;
export const STORAGE_KEY = "siyanti_v1";
export const THEME_KEY = "siyanti_theme";
export const DEVICE_ID_KEY = "siyanti_device_id";
export const USED_CODES_KEY = "used_codes";
export const API_TIMEOUTS = {
  diagnose: 45000,
  quote: 26000,
  followup: 28000,
  activate: 15000,
  admin: 12000,
  promoBootstrap: 120000,
  promoGenerate: 90000,
} as const;

export const CATEGORIES: Category[] = [
  {
    id: "ac",
    name: "تكييف وتبريد",
    subtitle: "مكيفات، ثلاجات، فريزر",
    samplePrompts: [
      "المكيف يشتغل لكن ما يبرّد ويقطّر ماء داخل الغرفة",
      "الوحدة الخارجية للمكيف تصدر صوتاً مرتفعاً ثم تفصل",
    ],
  },
  {
    id: "car",
    name: "سيارات",
    subtitle: "محرك، بطارية، كهرباء السيارة",
    samplePrompts: [
      "السيارة تتأخر في التشغيل صباحاً وصوت السلف ضعيف",
      "حرارة المحرك ترتفع عند الوقوف في الزحام مع تشغيل المكيف",
    ],
  },
  {
    id: "elec",
    name: "كهرباء وسباكة",
    subtitle: "قواطع، تمديدات، تسرب مياه",
    samplePrompts: [
      "القاطع الكهربائي يفصل عند تشغيل السخان أو المكيف",
      "تسرب مياه مستمر تحت حوض المطبخ رغم إغلاق الصنبور",
    ],
  },
  {
    id: "appl",
    name: "أجهزة منزلية",
    subtitle: "غسالات، أفران، تلفاز",
    samplePrompts: [
      "الغسالة الأوتوماتيكية لا تصرف الماء وتقف قبل العصر",
      "الثلاجة تبرد من الأسفل فقط والفريزر لا يجمد",
    ],
  },
  {
    id: "phone",
    name: "هواتف",
    subtitle: "شحن، بطارية، شاشة، شبكة",
    samplePrompts: [
      "الهاتف يشحن ببطء شديد وينطفئ فجأة عند 30%",
      "الشاشة لا تستجيب للمس في الجزء السفلي بعد سقوط خفيف",
    ],
  },
];

export const PLAN_FEATURES = [
  "تشخيص بالنص والصورة",
  "فحوصات غير محدودة",
  "مدقق تسعيرة الفني (كشف المبالغة)",
  "المتابعة التفاعلية داخل نفس الفحص",
  "تشخيص فائق الدقة بالصوت",
  "الفحص العميق وتنبيهات الوقاية",
  "أولوية التحليل السريع",
];

export const PLANS: PlanDefinition[] = [
  {
    id: "basic",
    name: "الأساسية الشهرية",
    priceMru: 100,
    days: 30,
    subtitle: "اعرف السعر العادل قبل أن تدفع للفني",
    perDayText: "≈ 3 أوقيات في اليوم · 30 يوماً",
    matrix: [true, true, true, true, false, false, false],
  },
  {
    id: "pro",
    name: "الاحترافية المتقدمة",
    priceMru: 200,
    days: 30,
    subtitle: "صوت وصورة، ووقاية من تكرار العطل",
    perDayText: "≈ 7 أوقيات في اليوم · 30 يوماً",
    matrix: [true, true, true, true, true, true, true],
    popularLabel: "الأكثر طلباً",
  },
  {
    id: "year",
    name: "السنوية الشاملة",
    priceMru: 300,
    days: 365,
    subtitle: "كل ميزات الاحترافية طوال سنة كاملة",
    perDayText: "أقل من أوقية واحدة في اليوم · 365 يوماً",
    matrix: [true, true, true, true, true, true, true],
    best: true,
    popularLabel: "العرض الأقوى",
    saveNote: "تدفع 300 فقط بدل 2,400 أوقية لو جددت الاحترافية كل شهر لمدة سنة",
  },
];

export const PAYMENT_PROVIDERS = [
  "بنكيلي Bankily",
  "مصرفي Masrvi",
  "السداد Sedad",
  "كليك Click",
  "بيم بنك Bimbank",
];

export const LOADING_MESSAGES = [
  "جاري تحليل العطل ومقارنة أسعار قطع الغيار في موريتانيا...",
  "نراجع الأسباب المحتملة للعطل ونقيّم مستوى الخطورة...",
  "نجهّز لك الجملة التقنية المناسبة للاتفاق مع الفني...",
];
