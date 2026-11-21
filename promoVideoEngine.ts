import { execFile } from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execFileAsync = promisify(execFile);

export type BackdropKey = "ac" | "car" | "voice" | "install";
export type VisualType = "hook" | "diagnose" | "price" | "voice" | "chrome_install";
export type VoiceTone = "calm" | "energetic";

export interface PromoSceneSpec {
  badge: string;
  title: string;
  subtitle: string;
  voiceText: string;
  backdropKey: BackdropKey;
  visualType: VisualType;
  accentColor: string;
}

export interface PromoPresetTemplate {
  key: string;
  title: string;
  description: string;
  tiktokCaption: string;
  voiceTone: VoiceTone;
  scenes: PromoSceneSpec[];
}

export interface PromoVideoAsset {
  id: string;
  presetKey?: string;
  title: string;
  description: string;
  tiktokCaption: string;
  durationSec: number;
  resolution: string;
  videoFile: string;
  audioFile: string;
  posterFile: string;
  videoSizeBytes: number;
  audioSizeBytes: number;
  createdAt: number;
}

const PROMO_DIR = path.resolve(__dirname, "data", "promo");
const PROMO_MANIFEST = path.join(PROMO_DIR, "manifest.json");
const IMAGES_DIR = path.resolve(__dirname, "src", "assets", "images");

const BACKDROP_FILES: Record<BackdropKey, string> = {
  ac: path.join(IMAGES_DIR, "tiktok_scene_ac_repair_1795248836101.jpg"),
  car: path.join(IMAGES_DIR, "tiktok_scene_car_check_1795248836839.jpg"),
  voice: path.join(IMAGES_DIR, "tiktok_scene_voice_outdoor_1795248836730.jpg"),
  install: path.join(IMAGES_DIR, "tiktok_scene_phone_install_1795248836223.jpg"),
};

export const PROFILE_AVATAR_FILE = path.join(
  IMAGES_DIR,
  "sallahli_profile_avatar_1795247241416.jpg"
);

export const PROMO_PRESETS: PromoPresetTemplate[] = [
  {
    key: "install-guide",
    title: "الفيديو 1 · التثبيت والاستخدام الشامل (مثبّت)",
    description:
      "يشرح فكرة صلاح لي من الصفر بوضوح تام، ثم يوضح خطوة بخطوة كيفية الفتح في Chrome وتثبيت التطبيق في 5 ثوانٍ.",
    tiktokCaption:
      "قبل ما تدفع أوقية واحدة في الصيانة، افحص العطل واعرف السعر العادل مع صلاح لي! 🔧🇲🇷\nللتثبيت المباشر: افتح الرابط في البايو ← اضغط (⋮) ← الفتح في Chrome ← تثبيت التطبيق 📲\n#صلاح_لي #موريتانيا #نواكشوط #صيانة #تطبيقات",
    voiceTone: "calm",
    scenes: [
      {
        badge: "تنبيه قبل الصيانة",
        title: "لا تدفع أوقية واحدة قبل الفحص",
        subtitle: "اعرف العطل الحقيقي وسعره في موريتانيا في ثوانٍ",
        voiceText:
          "قبل ما تعطي لأي معلم أوقية واحدة، شوف هذا التطبيق الموريتاني الذي يكشف لك العطل والسعر الحقيقي.",
        backdropKey: "ac",
        visualType: "hook",
        accentColor: "#F97316",
      },
      {
        badge: "تطبيق صلاح لي الذكي",
        title: "صوّر العطل أو سجّل صوتك",
        subtitle: "يشرح لك السبب والحل الآمن في المكيفات والسيارات والكهرباء",
        voiceText:
          "افتح صلاح لي، التقط صورة للعطل أو تكلّم بصوتك، وسيعطيك التشخيص الواضح وخطوات الفحص فوراً.",
        backdropKey: "car",
        visualType: "diagnose",
        accentColor: "#38BDF8",
      },
      {
        badge: "حماية من المبالغة",
        title: "السعر العادل بالأوقية الموريتانية",
        subtitle: "تقدير دقيق لقطع الغيار وأجرة الفني بالجديدة والقديمة",
        voiceText:
          "ويعرض لك السعر العادل لقطع الغيار واليد العاملة بالأوقية الجديدة والقديمة حتى لا تُخدع.",
        backdropKey: "install",
        visualType: "price",
        accentColor: "#10B981",
      },
      {
        badge: "خطوات التثبيت مجاناً",
        title: "ثبّت صلاح لي من Chrome في 5 ثوانٍ",
        subtitle: "الرابط في البايو ← الفتح في كروم ← اضغط تثبيت التطبيق",
        voiceText:
          "للتثبيت مجاناً، ادخل الرابط في البايو، افتحه في كروم، واضغط تثبيت التطبيق ليظهر على شاشتك دائماً.",
        backdropKey: "install",
        visualType: "chrome_install",
        accentColor: "#F97316",
      },
    ],
  },
  {
    key: "fair-price",
    title: "الفيديو 2 · كشف المبالغة والسعر العادل",
    description:
      "سيناريو جذاب يبدأ بموقف مبالغة في السعر ثم يعرض أداة مراجعة تسعيرة الفني داخل صلاح لي وطريقة التثبيت.",
    tiktokCaption:
      "قال لي 15,000 قديمة… لكن تطبيق صلاح لي كشف السعر العادل في السوق الموريتاني! 💰🔧\nافتح الرابط في متصفح Chrome واضغط تثبيت التطبيق الآن 👇\n#موريتانيا #صلاح_لي #نواكشوط #نواذيبو #نصائح_صيانة",
    voiceTone: "energetic",
    scenes: [
      {
        badge: "موقف يتكرر كل يوم",
        title: "طلب 15,000 قديمة لقطعة صغيرة!",
        subtitle: "شوف كيف كشفت السعر الحقيقي قبل أن أدفع",
        voiceText:
          "طلب مني خمسة عشر ألف أوقية قديمة لقطعة بسيطة، لكنني فتحت صلاح لي وكانت النتيجة صدمة.",
        backdropKey: "car",
        visualType: "hook",
        accentColor: "#F97316",
      },
      {
        badge: "مدقق تسعيرة الفني",
        title: "اكتب المبلغ وقارن بسعر السوق",
        subtitle: "يخبرك هل السعر عادل أم مبالغ فيه مع عبارة تفاوض محترمة",
        voiceText:
          "اكتب سعر الفني في التطبيق، ليقارنه بسعر السوق الموريتاني ويعطيك عبارة تفاوض محترمة جاهزة.",
        backdropKey: "install",
        visualType: "price",
        accentColor: "#10B981",
      },
      {
        badge: "شامل لكل الأعطال",
        title: "مكيفات · سيارات · كهرباء · هواتف",
        subtitle: "يعمل بالصورة أو الصوت أو الكتابة لجميع الأجهزة",
        voiceText:
          "صلاح لي معك في المكيفات والسيارات والكهرباء والسباكة والهواتف وكل أجهزة البيت.",
        backdropKey: "ac",
        visualType: "diagnose",
        accentColor: "#38BDF8",
      },
      {
        badge: "احمله مجاناً الآن",
        title: "الرابط في البايو ← Chrome ← تثبيت",
        subtitle: "خلّ مستشار الصيانة في جيبك دائماً بدون متجر",
        voiceText:
          "اجعل صلاح لي في جيبك دائماً. افتح الرابط في كروم واضغط تثبيت التطبيق الآن مجاناً.",
        backdropKey: "install",
        visualType: "chrome_install",
        accentColor: "#F97316",
      },
    ],
  },
  {
    key: "voice-easy",
    title: "الفيديو 3 · الفحص بالصوت فقط (للجميع)",
    description:
      "موجه لجميع الفئات وفي المدن والبوادي: يوضح أن التحدث بالصوت أو تسجيل صوت الجهاز يكفي بدون كتابة.",
    tiktokCaption:
      "ما تحتاج تكتب حرف! تكلّم بصوتك فقط أو صوّر العطل وصلاح لي يشرح لك الحل والسعر 🎙️📱🇲🇷\nافتح الرابط في Chrome واضغط تثبيت 👇\n#موريتانيا #الحسانية #صلاح_لي #صيانة #تكنولوجيا",
    voiceTone: "calm",
    scenes: [
      {
        badge: "بدون كتابة أو تعقيد",
        title: "تكلّم بصوتك فقط وهو يفهمك!",
        subtitle: "سهل جداً لكل شخص في المدينة أو البادية",
        voiceText:
          "لا تحب الكتابة أو تسكن بعيداً عن الورش؟ مع تطبيق صلاح لي يكفي أن تتكلم بصوتك فقط.",
        backdropKey: "voice",
        visualType: "hook",
        accentColor: "#F97316",
      },
      {
        badge: "تسجيل صوتي ذكي",
        title: "يفهم العربية والحسانية وصوت العطل",
        subtitle: "اضغط زر الصوت واشرح المشكلة أو قرّب الهاتف من الجهاز",
        voiceText:
          "اضغط زر الصوت واشرح مشكلتك بلهجتك، أو قرّب الهاتف من صوت المكيف أو المحرك ليفحصه.",
        backdropKey: "voice",
        visualType: "voice",
        accentColor: "#38BDF8",
      },
      {
        badge: "نتيجة واضحة ومختصرة",
        title: "خطوات فحص آمنة وتقدير السعر",
        subtitle: "تعرف هل تحلها بنفسك أم تحتاج فنياً وكم التكلفة",
        voiceText:
          "يعطيك خلاصة واضحة تفهمها من أول مرة، مع خطوات الأمان والسعر العادل بالأوقية.",
        backdropKey: "ac",
        visualType: "diagnose",
        accentColor: "#10B981",
      },
      {
        badge: "التثبيت المباشر",
        title: "افتح الرابط في Chrome وثبّت التطبيق",
        subtitle: "خطوتان فقط ويصبح على شاشتك الرئيسية",
        voiceText:
          "افتح الرابط في البايو عبر متصفح كروم، واضغط تثبيت التطبيق ليصل كل أهلك وأصدقائك.",
        backdropKey: "install",
        visualType: "chrome_install",
        accentColor: "#F97316",
      },
    ],
  },
];

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapArabicLines(text: string, maxChars: number, maxLines: number): string[] {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];
  const words = cleaned.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        continue;
      }
    } else {
      current = next;
    }
  }
  if (current) {
    if (lines.length >= maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1]} ${current}`;
    } else {
      lines.push(current);
    }
  }
  return lines.slice(0, maxLines);
}

function renderVisualCardSvg(visualType: VisualType, accentColor: string): string {
  if (visualType === "chrome_install") {
    return `
      <g transform="translate(90 735)">
        <rect x="0" y="0" width="900" height="680" rx="40" fill="#0F172A" fill-opacity="0.93" stroke="${accentColor}" stroke-opacity="0.5" stroke-width="3" />
        <text x="450" y="68" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="34" font-weight="bold" fill="#FB923C">طريقة التثبيت المباشر على هاتفك</text>

        <!-- Step 1 -->
        <rect x="56" y="106" width="788" height="122" rx="24" fill="#18243C" stroke="#334155" stroke-width="2" />
        <circle cx="776" cy="167" r="30" fill="#F97316" />
        <text x="776" y="179" text-anchor="middle" font-family="DejaVu Sans, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#FFFFFF">1</text>
        <text x="405" y="156" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="32" font-weight="bold" fill="#FFFFFF">اضغط على رابط التطبيق في البايو</text>
        <text x="405" y="200" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="25" fill="#94A3B8">يفتح معك الموقع مجاناً في ثانية</text>

        <!-- Arrow 1 -->
        <path d="M450 236 L450 274 M432 258 L450 276 L468 258" fill="none" stroke="#FB923C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Step 2 -->
        <rect x="56" y="284" width="788" height="126" rx="24" fill="#18243C" stroke="#38BDF8" stroke-opacity="0.45" stroke-width="2" />
        <circle cx="776" cy="347" r="30" fill="#38BDF8" />
        <text x="776" y="359" text-anchor="middle" font-family="DejaVu Sans, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#0B1220">2</text>
        <text x="405" y="335" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="31" font-weight="bold" fill="#FFFFFF">اضغط النقاط الثلاث ← الفتح في Chrome</text>
        <text x="405" y="380" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="25" fill="#94A3B8">مهم إذا فتحته من داخل تطبيق تيك توك</text>

        <!-- Arrow 2 -->
        <path d="M450 418 L450 456 M432 440 L450 458 L468 440" fill="none" stroke="#10B981" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Step 3 -->
        <rect x="56" y="466" width="788" height="162" rx="26" fill="#0B2922" stroke="#10B981" stroke-width="3" />
        <circle cx="776" cy="524" r="30" fill="#10B981" />
        <text x="776" y="536" text-anchor="middle" font-family="DejaVu Sans, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#FFFFFF">3</text>
        <text x="405" y="530" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="31" font-weight="bold" fill="#FFFFFF">اضغط زر «تثبيت التطبيق» بالأعلى</text>
        <rect x="86" y="556" width="236" height="48" rx="14" fill="#F97316" />
        <text x="204" y="588" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="24" font-weight="bold" fill="#FFFFFF">تثبيت التطبيق</text>
        <text x="546" y="588" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="24" fill="#A7F3D0">ويضاف فوراً على شاشتك</text>
      </g>
    `;
  }

  if (visualType === "price") {
    return `
      <g transform="translate(90 760)">
        <rect x="0" y="0" width="900" height="600" rx="40" fill="#0F172A" fill-opacity="0.93" stroke="#10B981" stroke-opacity="0.45" stroke-width="3" />
        <text x="450" y="72" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="34" font-weight="bold" fill="#E2E8F0">مقارنة السعر في السوق الموريتاني</text>

        <!-- Quoted price box -->
        <rect x="60" y="114" width="780" height="150" rx="26" fill="#2A1219" stroke="#F43F5E" stroke-opacity="0.6" stroke-width="2.5" />
        <text x="450" y="166" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="26" fill="#FDA4AF">السعر المطلوب من الفني:</text>
        <text x="450" y="224" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="34" font-weight="bold" fill="#FFFFFF">1,500 أوقية جديدة · 15,000 قديمة</text>

        <!-- Fair price box -->
        <rect x="60" y="294" width="780" height="170" rx="26" fill="#0B2922" stroke="#10B981" stroke-width="3" />
        <text x="450" y="350" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="26" fill="#6EE7B7">السعر العادل في صلاح لي:</text>
        <text x="450" y="412" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="35" font-weight="bold" fill="#FFFFFF">300 – 450 جديدة · 3,000 – 4,500 قديمة</text>

        <!-- Bottom note -->
        <rect x="120" y="496" width="660" height="64" rx="18" fill="#18243C" />
        <text x="450" y="538" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="26" font-weight="bold" fill="#FB923C">مع عبارة تفاوض محترمة جاهزة للنسخ</text>
      </g>
    `;
  }

  if (visualType === "voice") {
    const bars = [44, 82, 130, 178, 118, 165, 92, 146, 70, 115, 55];
    const barsSvg = bars
      .map((bh, idx) => {
        const bx = 175 + idx * 54;
        const by = 240 - Math.round(bh / 2);
        const fill = idx % 2 === 0 ? "#38BDF8" : "#F97316";
        return `<rect x="${bx}" y="${by}" width="26" height="${bh}" rx="13" fill="${fill}" />`;
      })
      .join("");

    return `
      <g transform="translate(90 780)">
        <rect x="0" y="0" width="900" height="540" rx="40" fill="#0F172A" fill-opacity="0.92" stroke="#38BDF8" stroke-opacity="0.45" stroke-width="3" />
        <text x="450" y="74" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="35" font-weight="bold" fill="#38BDF8">تسجيل صوتي مباشر — بدون كتابة</text>
        ${barsSvg}
        <rect x="70" y="368" width="760" height="114" rx="26" fill="#18243C" stroke="#334155" stroke-width="2" />
        <text x="450" y="418" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="31" font-weight="bold" fill="#FFFFFF">يفهم العربية والحسانية وصوت العطل</text>
        <text x="450" y="458" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="25" fill="#94A3B8">اضغط زر الصوت وتكلّم أو قرّب الهاتف من الجهاز</text>
      </g>
    `;
  }

  if (visualType === "diagnose") {
    return `
      <g transform="translate(90 770)">
        <rect x="0" y="0" width="900" height="580" rx="40" fill="#0F172A" fill-opacity="0.92" stroke="#38BDF8" stroke-opacity="0.45" stroke-width="3" />
        <text x="450" y="72" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="35" font-weight="bold" fill="#FFFFFF">واجهة الفحص السريع في صلاح لي</text>

        <!-- Mock textarea -->
        <rect x="64" y="108" width="772" height="128" rx="24" fill="#0B1220" stroke="#334155" stroke-width="2" />
        <text x="450" y="182" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="31" fill="#CBD5E1">المكيف يشتغل لكنه لا يبرد…</text>

        <!-- 3 input pills -->
        <rect x="64" y="264" width="240" height="96" rx="22" fill="#18243C" stroke="#334155" stroke-width="2" />
        <text x="184" y="324" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#38BDF8">صوت</text>

        <rect x="330" y="264" width="240" height="96" rx="22" fill="#18243C" stroke="#334155" stroke-width="2" />
        <text x="450" y="324" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#E2E8F0">المعرض</text>

        <rect x="596" y="264" width="240" height="96" rx="22" fill="#18243C" stroke="#334155" stroke-width="2" />
        <text x="716" y="324" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="30" font-weight="bold" fill="#FB923C">الكاميرا</text>

        <!-- Primary CTA -->
        <rect x="64" y="394" width="772" height="118" rx="26" fill="#F97316" />
        <text x="450" y="466" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="36" font-weight="bold" fill="#FFFFFF">افحص العطل بالذكاء الاصطناعي</text>
      </g>
    `;
  }

  // "hook" visual: strong bold focal highlight card
  return `
    <g transform="translate(110 860)">
      <rect x="0" y="0" width="860" height="390" rx="40" fill="#0F172A" fill-opacity="0.90" stroke="#F97316" stroke-width="3.5" />
      <circle cx="430" cy="112" r="56" fill="#F97316" fill-opacity="0.18" stroke="#FB923C" stroke-width="3" />
      <path d="M446 86 a2 2 0 0 0 0 4 l5 5 a2 2 0 0 0 4 0 l12 -12 a18 18 0 0 1 -24 24 l-21 21 a6 6 0 0 1 -9 -9 l21 -21 a18 18 0 0 1 24 -24 l-12 12 z" fill="none" stroke="#FB923C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" transform="translate(-14 -2) scale(1.05)" />
      <text x="430" y="232" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="44" font-weight="bold" fill="#FFFFFF">تطبيق صلاح لي · موريتانيا</text>
      <text x="430" y="302" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="31" fill="#FDBA74">شخّص العطل واعرف السعر العادل في ثوانٍ</text>
    </g>
  `;
}

export function buildSceneOverlaySvg(
  scene: PromoSceneSpec,
  sceneIndex: number,
  totalScenes: number
): string {
  const titleLines = wrapArabicLines(scene.title, 26, 2);
  const subLines = wrapArabicLines(scene.subtitle, 38, 2);

  const progressDots = Array.from({ length: totalScenes }, (_, idx) => {
    const isActive = idx === sceneIndex;
    const x = 104 + idx * 36;
    return `<rect x="${x}" y="114" width="${isActive ? 26 : 14}" height="10" rx="5" fill="${
      isActive ? scene.accentColor : "#475569"
    }" />`;
  }).join("");

  const titleSvg = titleLines
    .map(
      (line, idx) =>
        `<text x="540" y="${418 + idx * 82}" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="56" font-weight="bold" fill="#FFFFFF">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const subSvg = subLines
    .map(
      (line, idx) =>
        `<text x="540" y="${590 + idx * 52}" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="34" fill="#CBD5E1">${escapeXml(
          line
        )}</text>`
    )
    .join("\n");

  const cardSvg = renderVisualCardSvg(scene.visualType, scene.accentColor);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="topScrim" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#090F1B" stop-opacity="0.94" />
      <stop offset="48%" stop-color="#0D1524" stop-opacity="0.72" />
      <stop offset="100%" stop-color="#090F1B" stop-opacity="0.95" />
    </linearGradient>
  </defs>

  <!-- Balanced contrast scrim over photo backdrop -->
  <rect width="1080" height="1920" fill="url(#topScrim)" />

  <!-- Top brand bar -->
  <rect x="64" y="76" width="952" height="86" rx="24" fill="#121C30" fill-opacity="0.94" stroke="#334155" stroke-width="2" />
  <rect x="932" y="96" width="46" height="46" rx="14" fill="#F97316" fill-opacity="0.22" />
  <circle cx="955" cy="119" r="10" fill="#F97316" />
  <text x="838" y="132" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="36" font-weight="bold" fill="#FFFFFF">صلاح لي</text>
  ${progressDots}

  <!-- Scene topic header -->
  <rect x="270" y="230" width="540" height="66" rx="33" fill="${scene.accentColor}" fill-opacity="0.18" stroke="${scene.accentColor}" stroke-opacity="0.65" stroke-width="2" />
  <text x="540" y="274" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="30" font-weight="bold" fill="${scene.accentColor}">${escapeXml(
    scene.badge
  )}</text>

  ${titleSvg}
  ${subSvg}

  ${cardSvg}

  <!-- Bottom clear CTA footer (kept cleanly above TikTok bottom caption zone) -->
  <rect x="90" y="1520" width="900" height="112" rx="28" fill="#121C30" fill-opacity="0.94" stroke="#F97316" stroke-opacity="0.55" stroke-width="2.5" />
  <text x="540" y="1572" text-anchor="middle" direction="rtl" font-family="Noto Kufi Arabic, Noto Sans Arabic" font-size="32" font-weight="bold" fill="#FFFFFF">رابط التحميل المباشر في البايو</text>
  <text x="540" y="1612" text-anchor="middle" direction="rtl" font-family="Noto Sans Arabic" font-size="25" fill="#FDBA74">افتح في متصفح Chrome ← اضغط تثبيت التطبيق</text>
</svg>`;
}

function getWavDurationSec(wavBuffer: Buffer): number {
  if (wavBuffer.length <= 44) return 4;
  // Parse WAV header safely (24kHz mono 16-bit = 48000 bytes/sec, fallback to RIFF sampleRate*byteRate)
  const byteRate = wavBuffer.readUInt32LE(28) || 48000;
  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return Math.max(2.5, chunkSize / byteRate);
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return Math.max(2.5, (wavBuffer.length - 44) / byteRate);
}

async function synthesizeSceneVoiceWav(
  apiKey: string,
  text: string,
  tone: VoiceTone,
  outWavPath: string
): Promise<number> {
  const voiceName = tone === "energetic" ? "Puck" : "Kore";
  const styleDesc =
    tone === "energetic"
      ? "Energetic, warm, clear Arabic presenter voice with crisp articulation for short-form social video"
      : "Calm, warm, reassuring, crystal-clear Arabic narrator with steady balanced pace easy for everyone to understand";

  const attempts: Array<{
    model: string;
    apiVersion: "v1alpha" | "v1beta";
    withMeta: boolean;
  }> = [
    { model: "gemini-3.8-flash-lite-tts", apiVersion: "v1alpha", withMeta: true },
    { model: "gemini-3.8-flash-tts", apiVersion: "v1alpha", withMeta: true },
    { model: "gemini-2.5-flash-preview-tts", apiVersion: "v1beta", withMeta: false },
    { model: "gemini-3.8-flash-lite-tts", apiVersion: "v1beta", withMeta: false },
    { model: "gemini-3.8-flash-tts", apiVersion: "v1beta", withMeta: false },
  ];

  let lastErr: unknown = null;
  for (let i = 0; i < attempts.length; i++) {
    const cfg = attempts[i];
    try {
      const client = new GoogleGenAI({
        apiKey,
        apiVersion: cfg.apiVersion,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
      const part: Record<string, unknown> = cfg.withMeta
        ? { text, speechMetadata: { style: styleDesc } }
        : { text: `${tone === "energetic" ? "[بأسلوب حماسي واضح] " : "[بأسلوب هادئ وواضح للجميع] "}${text}` };

      const resp = await client.models.generateContent({
        model: cfg.model,
        contents: [
          {
            role: "user",
            parts: [part as { text: string }],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const inline = resp.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const b64 = inline?.data;
      if (!b64) throw new Error("Empty TTS audio response");
      const audioBuf = Buffer.from(b64, "base64");
      const mime = String(inline?.mimeType || "").toLowerCase();

      if (mime.includes("pcm") || mime.includes("l16")) {
        const rawPcmPath = `${outWavPath}.pcm`;
        await fsp.writeFile(rawPcmPath, audioBuf);
        await execFileAsync("ffmpeg", [
          "-y",
          "-f",
          "s16le",
          "-ar",
          "24000",
          "-ac",
          "1",
          "-i",
          rawPcmPath,
          outWavPath,
        ]);
        await fsp.rm(rawPcmPath, { force: true }).catch(() => {});
        const wavBuf = await fsp.readFile(outWavPath);
        return getWavDurationSec(wavBuf);
      }

      await fsp.writeFile(outWavPath, audioBuf);
      return getWavDurationSec(audioBuf);
    } catch (err) {
      lastErr = err;
      if (i < attempts.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to generate Arabic voiceover");
}

export async function listPromoAssets(): Promise<PromoVideoAsset[]> {
  try {
    const raw = await fsp.readFile(PROMO_MANIFEST, "utf8");
    const parsed = JSON.parse(raw) as PromoVideoAsset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => fs.existsSync(path.join(PROMO_DIR, item.videoFile)));
  } catch {
    return [];
  }
}

async function savePromoManifest(list: PromoVideoAsset[]): Promise<void> {
  await fsp.mkdir(PROMO_DIR, { recursive: true });
  const tmp = `${PROMO_MANIFEST}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await fsp.rename(tmp, PROMO_MANIFEST);
}

export function resolvePromoFilePath(fileName: string): string | null {
  const safeName = path.basename(fileName);
  if (!safeName || safeName !== fileName) return null;
  if (safeName === "sallahli-profile-avatar.jpg") {
    return fs.existsSync(PROFILE_AVATAR_FILE) ? PROFILE_AVATAR_FILE : null;
  }
  const full = path.join(PROMO_DIR, safeName);
  if (!full.startsWith(PROMO_DIR + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

export async function generatePromoVideo(params: {
  id: string;
  presetKey?: string;
  title: string;
  description: string;
  tiktokCaption: string;
  voiceTone: VoiceTone;
  scenes: PromoSceneSpec[];
  apiKey: string;
}): Promise<PromoVideoAsset> {
  await fsp.mkdir(PROMO_DIR, { recursive: true });
  const workDir = path.join(PROMO_DIR, `work-${params.id}-${Date.now()}`);
  await fsp.mkdir(workDir, { recursive: true });

  try {
    const sceneClips: string[] = [];
    const sceneWavs: string[] = [];
    let totalDuration = 0;

    for (let i = 0; i < params.scenes.length; i++) {
      const scene = params.scenes[i];
      const rawWav = path.join(workDir, `voice_${i}.wav`);
      const paddedWav = path.join(workDir, `voice_pad_${i}.wav`);
      const overlaySvg = path.join(workDir, `overlay_${i}.svg`);
      const composedPng = path.join(workDir, `frame_${i}.png`);
      const sceneClip = path.join(workDir, `clip_${i}.mp4`);

      // 1. Synthesize crisp Arabic TTS narration for this scene
      const speechDur = await synthesizeSceneVoiceWav(
        params.apiKey,
        scene.voiceText,
        params.voiceTone,
        rawWav
      );
      const sceneDur = Number((speechDur + 0.55).toFixed(2));
      totalDuration += sceneDur;

      // Normalize audio track with clean 0.18s lead-in and tail padding at 44.1kHz stereo
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        rawWav,
        "-af",
        `adelay=180|180,apad=whole_dur=${sceneDur}`,
        "-ar",
        "44100",
        "-ac",
        "2",
        paddedWav,
      ]);
      sceneWavs.push(paddedWav);

      // 2. Render SVG overlay with properly shaped Noto Kufi/Sans Arabic text
      const svgContent = buildSceneOverlaySvg(scene, i, params.scenes.length);
      await fsp.writeFile(overlaySvg, svgContent, "utf8");

      const backdropPath = BACKDROP_FILES[scene.backdropKey] || BACKDROP_FILES.install;
      await execFileAsync("ffmpeg", [
        "-y",
        "-i",
        backdropPath,
        "-i",
        overlaySvg,
        "-filter_complex",
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];[bg][1:v]overlay=0:0",
        "-frames:v",
        "1",
        composedPng,
      ]);

      // 3. Turn crisp scene frame + smooth fade transition + padded scene WAV into MP4 clip
      await execFileAsync("ffmpeg", [
        "-y",
        "-loop",
        "1",
        "-t",
        String(sceneDur),
        "-i",
        composedPng,
        "-i",
        paddedWav,
        "-vf",
        `scale=1080:1920,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(
          0.3,
          sceneDur - 0.25
        ).toFixed(2)}:d=0.25,format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "21",
        "-r",
        "24",
        "-video_track_timescale",
        "24000",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        sceneClip,
      ]);
      sceneClips.push(sceneClip);
    }

    const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const videoFile = `${safeId}.mp4`;
    const audioFile = `${safeId}.wav`;
    const posterFile = `${safeId}.jpg`;

    const videoOutPath = path.join(PROMO_DIR, videoFile);
    const audioOutPath = path.join(PROMO_DIR, audioFile);
    const posterOutPath = path.join(PROMO_DIR, posterFile);

    // Concatenate all MP4 scene clips losslessly via concat demuxer
    const concatClipsTxt = path.join(workDir, "clips.txt");
    await fsp.writeFile(
      concatClipsTxt,
      sceneClips.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8"
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatClipsTxt,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      videoOutPath,
    ]);

    // Concatenate all WAV voiceovers into one standalone downloadable master WAV
    const concatWavsTxt = path.join(workDir, "wavs.txt");
    await fsp.writeFile(
      concatWavsTxt,
      sceneWavs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
      "utf8"
    );
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatWavsTxt,
      "-c",
      "copy",
      audioOutPath,
    ]);

    // Extract clean poster image from first composed scene frame
    const firstFramePng = path.join(workDir, "frame_0.png");
    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      firstFramePng,
      "-vf",
      "scale=540:960",
      "-q:v",
      "3",
      posterOutPath,
    ]);

    const [videoStat, audioStat] = await Promise.all([
      fsp.stat(videoOutPath),
      fsp.stat(audioOutPath),
    ]);

    const record: PromoVideoAsset = {
      id: safeId,
      presetKey: params.presetKey,
      title: params.title,
      description: params.description,
      tiktokCaption: params.tiktokCaption,
      durationSec: Math.round(totalDuration),
      resolution: "1080x1920",
      videoFile,
      audioFile,
      posterFile,
      videoSizeBytes: videoStat.size,
      audioSizeBytes: audioStat.size,
      createdAt: Date.now(),
    };

    const existing = await listPromoAssets();
    const updated = [record, ...existing.filter((item) => item.id !== record.id)];
    await savePromoManifest(updated);
    return record;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function ensureStarterPromoVideos(apiKey: string): Promise<PromoVideoAsset[]> {
  const existing = await listPromoAssets();
  const existingKeys = new Set(existing.map((e) => e.presetKey || e.id));
  for (const preset of PROMO_PRESETS) {
    if (!existingKeys.has(preset.key)) {
      await generatePromoVideo({
        id: preset.key,
        presetKey: preset.key,
        title: preset.title,
        description: preset.description,
        tiktokCaption: preset.tiktokCaption,
        voiceTone: preset.voiceTone,
        scenes: preset.scenes,
        apiKey,
      });
    }
  }
  return listPromoAssets();
}
