import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  PROMO_PRESETS,
  ensureStarterPromoVideos,
  generatePromoVideo,
  listPromoAssets,
  resolvePromoFilePath,
  type PromoSceneSpec,
  type VoiceTone,
} from "./promoVideoEngine.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL = "gemini-4-hydrogen";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

const PLAN_DAYS: Record<"basic" | "pro" | "year", number> = {
  basic: 30,
  pro: 30,
  year: 365,
};

const DATA_DIR = path.resolve(__dirname, "data");
const SECRET_FILE = path.join(DATA_DIR, "server_secret.key");
const ADMIN_AUTH_FILE = path.join(DATA_DIR, "admin_auth.json");
const CUSTOM_CODES_FILE = path.join(DATA_DIR, "custom_codes.json");
const REQUESTS_FILE = path.join(DATA_DIR, "requests.json");
const USED_CODES_FILE = path.join(DATA_DIR, "used_codes.json");

function loadOrCreateTokenSecret(): string {
  const envSecret = String(process.env.TOKEN_SECRET || "").trim();
  if (envSecret.length >= 16) return envSecret;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SECRET_FILE)) {
      const existing = fs.readFileSync(SECRET_FILE, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SECRET_FILE, generated, { encoding: "utf8", mode: 0o600 });
    return generated;
  } catch {
    return crypto
      .createHash("sha256")
      .update(process.env.GEMINI_API_KEY || "sallahli-fallback-secret")
      .digest("hex");
  }
}

const ENV_ADMIN_PASS = String(process.env.ADMIN_PASSWORD || "").trim();
const TOKEN_SECRET = loadOrCreateTokenSecret();

interface AdminAuthRecord {
  passwordHash: string;
  updatedAt: number;
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function timingSafeMatch(a: string, b: string): boolean {
  return crypto.timingSafeEqual(sha256Buffer(a), sha256Buffer(b));
}

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPasswordScrypt(password: string, storedHash: string): boolean {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex || expectedHex.length !== 128) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function signToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken<T extends Record<string, unknown>>(token: string): T | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (!timingSafeMatch(sig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    const exp = Number(parsed.exp);
    if (!Number.isFinite(exp) || exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ===== Async Serialized Atomic Persistence =====
const fileLocks = new Map<string, Promise<unknown>>();

function withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(filePath) || Promise.resolve();
  const next = previous.then(task, task);
  const cleanup = next.then(
    () => {
      if (fileLocks.get(filePath) === cleanup) {
        fileLocks.delete(filePath);
      }
    },
    () => {
      if (fileLocks.get(filePath) === cleanup) {
        fileLocks.delete(filePath);
      }
    }
  );
  fileLocks.set(filePath, cleanup);
  return next;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown, mode?: number): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  await fsp.writeFile(tempPath, JSON.stringify(data, null, 2), { encoding: "utf8", mode });
  await fsp.rename(tempPath, filePath);
}

async function mutateJsonFile<T, R = T>(
  filePath: string,
  fallback: T,
  mutator: (current: T) => { next: T; result: R; skipWrite?: boolean },
  mode?: number
): Promise<R> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath, fallback);
    const { next, result, skipWrite } = mutator(current);
    if (!skipWrite) {
      await writeJsonAtomic(filePath, next, mode);
    }
    return result;
  });
}

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return String(req.ip || req.socket.remoteAddress || "unknown").slice(0, 64);
}

// ===== Types & Schemas =====
type PlanId = "basic" | "pro" | "year";

interface CustomCodeRecord {
  code: string;
  planId: PlanId;
  singleUse: boolean;
  usedCount: number;
  createdAt: number;
}

interface SubscriptionRequestRecord {
  id: string;
  deviceId: number;
  planId: PlanId;
  planName: string;
  priceMru: number;
  activationCode: string;
  status: "pending" | "sent";
  createdAt: number;
}

const SYSTEM_PROMPT = `أنت كبير خبراء الصيانة والميكانيكا والكهرباء والإلكترونيات في موريتانيا (نواكشوط، نواذيبو، وبقية الولايات).

القاعدة الأولى الإلزامية — التمييز الدقيق بين الصواب والخطأ (الصور، الصوت، والنص) قبل أي تشخيص:
1) التمييز الصارم في الصور (عند إرفاق صورة):
   - تحقّق أولاً وبموضوعية تامة من هوية الصورة (detected_subject) قبل افتراض أي عطل.
   - حالات الخطأ التي يجب رفضها فوراً (is_valid_case = false):
     * صورة شخص/وجه/سيلفي، أو حيوان، أو طعام، أو طبيعة، أو نقود/أوراق، أو لقطة شاشة دردشة لا تخص صيانة.
     * صورة مظلمة أو مشوشة لدرجة يستحيل تمييز الجهاز فيها.
     * صورة جهاز أو مركبة من فئة صيانة أخرى مختلفة بوضوح عن الفئة المختارة (مثل هاتف في فئة سيارات، أو سيارة في فئة هواتف، أو مكيف في فئة هواتف).
   - حالات الصواب التي يجب قبولها وتحليلها:
     * أي جهاز أو عطل أو لوحة عدادات سيارة (مثل لمبة Check Engine) أو قاطع كهرباء/أسلاك/مواسير سباكة أو ريموت/شاشة مكيف تعرض رمز خطأ (E1/E4/F0) أو شاشة هاتف تعرض خللاً/بطارية/شحناً.
     * ملاحظة ذكية: الثلاجة والفريزر مقبولتان في «تكييف وتبريد» أو «أجهزة منزلية»، وسخان الماء أو الأجهزة الكهربائية الموصلة بالأسلاك تُقبل بين «كهرباء وسباكة» و«أجهزة منزلية» إذا كانت مطابقة لمشكلة العميل.
2) التمييز الصارم في التسجيلات الصوتية (عند إرفاق صوت):
   - حالات الخطأ التي يجب رفضها فوراً (is_valid_case = false):
     * تسجيل صامت، أو ضجيج هواء/نقر ميكروفون فقط، أو أغاني/تلفاز، أو كلام غير مفهوم.
     * تحية فارغة أو دردشة شخصية أو تجربة ميكروفون («السلام عليكم»، «ألو»، «1 2 3»، «تجربة») دون وصف عطل ودون صوت خلل ميكانيكي.
     * تسجيل يتحدث صراحة عن جهاز في فئة مختلفة كلياً عن الفئة المختارة.
   - حالات الصواب التي يجب قبولها وتحليلها:
     * كلام يشرح مشكلة صيانة بالعربية الفصحى أو اللهجة الموريتانية/الحسانية أو الفرنسية الدارجة (مثل: كليماتيزور، فريجيدير، كومبريسور، كونتور، ديجونكتور، فيزيبل، موطور، رادياتور، ماشين آ لافي، تشارجور، إيكران).
     * أو تسجيل صوتي واضح لصوت عطل حقيقي (أزيز كهربائي، طقطقة كمبريسور، طرق محرك، تسرب ماء/هواء).
3) التمييز الدقيق في النص المكتوب:
   - اقبل فوراً وحلّل بعمق أي وصف نصي لمشكلة فنية ضمن الفئة المختارة (حتى لو كان مختصراً أو بالحسانية أو فيه مصطلحات فرنسية مثل: المكيف ما يبرد، الكونتور يطيح، لا ماشين آ لافي واقفة، التلفون ما يشحن).
   - ارفض فقط إذا كان النص مجرد تحية فارغة، أو حروفاً عشوائية، أو موضوعاً لا علاقة له بالصيانة (طبخ، سياسة، طب بشري، دردشة)، أو يصف بوضوح فئة صيانة أخرى.
- عند الرفض (is_valid_case = false): حدد detected_category إن أمكن، واكتب في rejection_reason سبباً دقيقاً يذكر ما رُصد فعلاً دون تخمين أي تكاليف أو أعطال، وضع أصفاراً في التكاليف وقوائم فارغة.

عندما تكون الحالة صالحة (is_valid_case = true)، قدّم تحليلاً هندسياً عميقاً يراعي واقع موريتانيا (الحرارة العالية والغبار، تذبذب الجهد الكهربائي، رطوبة السواحل في نواذيبو ونواكشوط، والفرق بين القطع الأصلية والتجارية):
1. visual_observation: اذكر بدقة ما لاحظته فعلاً في الصورة أو التسجيل الصوتي، أو خلاصة الأعراض من وصف العميل.
2. confidence_level & confidence_note: قيّم ثقتك بالتشخيص ("عالية" أو "متوسطة" أو "تحتاج فحصاً مباشراً") واشرح السبب بأمانة (ما اتضح من المرفق/الوصف وما يحتاج قياساً مباشراً).
3. probable_causes: رتّب أهم 2 إلى 3 أسباب محتملة للعطل (من الأرجح إلى المحتمل)، مع مؤشر عملي بسيط يساعد العميل على التفريق بينها.
4. diagnosis: خلاصة تشخيصية منطقية ومباشرة يفهمها المواطن العادي.
5. diy_steps: خطوات فحص آمنة ومرتّبة منطقياً يجربها العميل بنفسه قبل استدعاء الفني.
6. parts_cost_mru & labor_cost_mru: تقدير عادل لأسعار قطع الغيار واليد العاملة في موريتانيا بالأوقية الجديدة فقط {"min":رقم,"max":رقم}.
7. technician_phrase: جملة تقنية دقيقة وواثقة يقولها للفني لمنع التهويل أو رفع السعر.
8. pro_advice: نصيحة احترافية عميقة حول جودة القطع في السوق الموريتاني ومنع تكرار العطل.
9. danger_level: إحدى القيم الثلاث فقط: "منخفض" أو "متوسط" أو "مرتفع".`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_valid_case: {
      type: Type.BOOLEAN,
      description: "true فقط إذا كانت الصورة/الصوت/النص تخص عطل صيانة حقيقي يطابق الفئة المختارة.",
    },
    detected_category: {
      type: Type.STRING,
      description: "إحدى القيم: ac أو car أو elec أو appl أو phone أو unrelated أو unclear.",
    },
    detected_subject: {
      type: Type.STRING,
      description: "وصف موضوعي دقيق لما يظهر فعلاً في الصورة أو سُمع في الصوت أو مضمون شكوى العميل.",
    },
    rejection_reason: {
      type: Type.STRING,
      description: "إذا كانت is_valid_case = false اكتب رسالة رفض واضحة ومحددة للمستخدم بالعربية، وإلا اتركه فارغاً.",
    },
    visual_observation: {
      type: Type.STRING,
      description: "ما تمت ملاحظته فعلياً في الصورة أو التسجيل الصوتي أو أبرز ما ذكره العميل في وصفه.",
    },
    confidence_level: {
      type: Type.STRING,
      description: "إحدى القيم الثلاث: عالية أو متوسطة أو تحتاج فحصاً مباشراً.",
    },
    confidence_note: {
      type: Type.STRING,
      description: "تفسير مختصر لما يمكن الجزم به الآن وما يحتاج قياساً مباشراً.",
    },
    probable_causes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cause: { type: Type.STRING, description: "السبب المحتمل." },
          likelihood: { type: Type.STRING, description: "أرجح أو محتمل." },
          check_hint: { type: Type.STRING, description: "كيف يتحقق المستخدم أو الفني من هذا السبب." },
        },
        required: ["cause", "likelihood", "check_hint"],
      },
      description: "أهم 2 إلى 3 أسباب مرتبة منطقياً.",
    },
    diagnosis: {
      type: Type.STRING,
      description: "شرح سبب العطل بلغة عربية بسيطة ومباشرة.",
    },
    diy_steps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "خطوات آمنة وبسيطة يمكن للمستخدم تجربتها بنفسه.",
    },
    parts_cost_mru: {
      type: Type.OBJECT,
      properties: {
        min: { type: Type.INTEGER },
        max: { type: Type.INTEGER },
      },
      required: ["min", "max"],
      description: "السعر التقريبي لقطع الغيار بالأوقية الجديدة (MRU).",
    },
    labor_cost_mru: {
      type: Type.OBJECT,
      properties: {
        min: { type: Type.INTEGER },
        max: { type: Type.INTEGER },
      },
      required: ["min", "max"],
      description: "أجرة اليد العاملة العادلة بالأوقية الجديدة (MRU).",
    },
    technician_phrase: {
      type: Type.STRING,
      description: "جملة تقنية دقيقة يقولها المستخدم للفني لمنع المبالغة في السعر.",
    },
    pro_advice: {
      type: Type.STRING,
      description: "نصيحة احترافية حول جودة قطع الغيار والوقاية مستقبلاً.",
    },
    danger_level: {
      type: Type.STRING,
      description: "إحدى القيم: منخفض أو متوسط أو مرتفع.",
    },
  },
  required: [
    "is_valid_case",
    "detected_category",
    "detected_subject",
    "rejection_reason",
    "visual_observation",
    "confidence_level",
    "confidence_note",
    "probable_causes",
    "diagnosis",
    "diy_steps",
    "parts_cost_mru",
    "labor_cost_mru",
    "technician_phrase",
    "pro_advice",
    "danger_level",
  ],
};

const QUOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: {
      type: Type.STRING,
      description: "إحدى القيم الأربع فقط: عادل أو مرتفع نسبياً أو مبالغ فيه أو منخفض بشكل مريب.",
    },
    fair_total_mru: {
      type: Type.OBJECT,
      properties: {
        min: { type: Type.INTEGER },
        max: { type: Type.INTEGER },
      },
      required: ["min", "max"],
      description: "السعر الإجمالي العادل في موريتانيا بالأوقية الجديدة (MRU).",
    },
    difference_note: {
      type: Type.STRING,
      description: "شرح مباشر بالفرق بين سعر الفني والسعر العادل بالأوقية الجديدة والقديمة.",
    },
    negotiation_script: {
      type: Type.STRING,
      description: "جملة تفاوض مهذبة وحازمة يقولها المستخدم للفني لتخفيض السعر أو التحقق منه.",
    },
    warning_signs: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 إلى 3 نقاط فحص مهمة قبل الدفع للفني.",
    },
  },
  required: ["verdict", "fair_total_mru", "difference_note", "negotiation_script", "warning_signs"],
};

const FOLLOWUP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description: "إجابة واضحة وعملية ومباشرة على سؤال المتابعة تراعي الخطوات المكتملة.",
    },
    next_action: {
      type: Type.STRING,
      description: "أهم خطوة عملية تالية أو تنبيه سلامة مختصر.",
    },
    suggested_followups: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2 إلى 3 أسئلة متابعة ذكية ومختصرة مقترحة للمرحلة التالية.",
    },
  },
  required: ["answer", "next_action", "suggested_followups"],
};

function normalizeRange(obj: unknown): { min: number; max: number } {
  const rec = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const minVal = Math.max(0, Math.round(Number(rec.min) || 0));
  const maxVal = Math.max(minVal, Math.round(Number(rec.max) || minVal));
  return { min: minVal, max: maxVal };
}

function normalizeDanger(raw: unknown): "منخفض" | "متوسط" | "مرتفع" {
  const str = String(raw || "");
  if (str.includes("مرتفع")) return "مرتفع";
  if (str.includes("منخفض")) return "منخفض";
  return "متوسط";
}

function normalizeConfidence(raw: unknown): "عالية" | "متوسطة" | "تحتاج فحصاً مباشراً" {
  const str = String(raw || "");
  if (str.includes("عالية")) return "عالية";
  if (str.includes("مباشر")) return "تحتاج فحصاً مباشراً";
  return "متوسطة";
}

function normalizeCategoryId(raw: unknown): "ac" | "car" | "elec" | "appl" | "phone" | undefined {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "ac" || s === "car" || s === "elec" || s === "appl" || s === "phone") {
    return s;
  }
  return undefined;
}

function normalizeVerdict(raw: unknown): "عادل" | "مرتفع نسبياً" | "مبالغ فيه" | "منخفض بشكل مريب" {
  const s = String(raw || "");
  if (s.includes("مبالغ")) return "مبالغ فيه";
  if (s.includes("مرتفع")) return "مرتفع نسبياً";
  if (s.includes("منخفض")) return "منخفض بشكل مريب";
  return "عادل";
}

function normalizeDiagnosis(raw: Record<string, unknown>) {
  const steps = Array.isArray(raw.diy_steps) ? raw.diy_steps.map(String).filter(Boolean).slice(0, 8) : [];
  const rawCauses = Array.isArray(raw.probable_causes) ? raw.probable_causes : [];
  const probableCauses = rawCauses
    .slice(0, 3)
    .map((item) => {
      const rec = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const lh = String(rec.likelihood || "").includes("أرجح") ? "أرجح" : "محتمل";
      return {
        cause: String(rec.cause || "").slice(0, 260),
        likelihood: lh as "أرجح" | "محتمل",
        check_hint: String(rec.check_hint || "").slice(0, 320),
      };
    })
    .filter((c) => c.cause.length > 0);

  return {
    detected_category: normalizeCategoryId(raw.detected_category),
    diagnosis: String(raw.diagnosis || "").slice(0, 2000),
    visual_observation: String(raw.visual_observation || "").slice(0, 800),
    confidence_level: normalizeConfidence(raw.confidence_level),
    confidence_note: String(raw.confidence_note || "").slice(0, 500),
    probable_causes: probableCauses,
    diy_steps: steps,
    parts_cost_mru: normalizeRange(raw.parts_cost_mru),
    labor_cost_mru: normalizeRange(raw.labor_cost_mru),
    technician_phrase: String(raw.technician_phrase || "").slice(0, 800),
    pro_advice: String(raw.pro_advice || "").slice(0, 2000),
    danger_level: normalizeDanger(raw.danger_level),
  };
}

function normalizeCustomCode(val: unknown): string {
  const raw = String(val || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212\u0640]/g, "-")
    .trim();

  const structured = raw.match(/\b([BPY]S?)\s*-?\s*(\d{3,8})\b/i);
  if (structured) {
    return `${structured[1].toUpperCase()}-${structured[2]}`;
  }

  if (/[\s\u0600-\u06FF]/.test(raw)) {
    const afterColon = raw.match(/:\s*([A-Za-z0-9][A-Za-z0-9_-]{2,23})/);
    if (afterColon) {
      return afterColon[1].toUpperCase();
    }
    const tokens = raw.match(/[A-Za-z0-9][A-Za-z0-9_-]{2,23}/g);
    if (tokens && tokens.length > 0) {
      return tokens[0].toUpperCase();
    }
  }

  return raw.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function isValidDeviceId(val: number): boolean {
  return Number.isInteger(val) && val >= 1000 && val <= 9999999999;
}

function buildDeviceCode(deviceId: number, planId: PlanId): string {
  const prefix = planId === "basic" ? "B" : planId === "pro" ? "P" : "Y";
  const digest = crypto
    .createHmac("sha256", TOKEN_SECRET)
    .update(`device-code:v1:${deviceId}:${planId}`)
    .digest();
  const rawNum = digest.readUInt32BE(0);
  const digits = 1000000 + (rawNum % 9000000);
  return `${prefix}-${digits}`;
}

function buildLegacyDeviceCode(deviceId: number, planId: PlanId): string {
  if (planId === "basic") return `B-${deviceId * 2 + 115}`;
  if (planId === "pro") return `P-${deviceId * 3 + 225}`;
  return `Y-${deviceId * 4 + 335}`;
}

function buildEntitlementToken(deviceId: number, planId: PlanId): { exp: number; token: string } {
  const days = PLAN_DAYS[planId];
  const exp = Date.now() + days * 86400000;
  const token = signToken({
    type: "entitlement",
    deviceId,
    planId,
    iat: Date.now(),
    exp,
  });
  return { exp, token };
}

function validateBase64Media(
  media: { mime?: unknown; data?: unknown } | null | undefined,
  allowedMimes: Set<string>,
  maxBytes: number,
  labelAr: string
): { mime: string; data: string } | null | { error: string } {
  if (!media || typeof media !== "object") return null;
  const rawData = typeof media.data === "string" ? media.data.trim() : "";
  if (!rawData) return null;

  const mime = String(media.mime || "").trim().toLowerCase().split(";")[0];
  if (!mime || !allowedMimes.has(mime)) {
    return { error: `صيغة ${labelAr} غير مدعومة.` };
  }

  const cleanData = rawData.replace(/^data:[^;]+;base64,/i, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(cleanData)) {
    return { error: `بيانات ${labelAr} غير صالحة.` };
  }

  const approxBytes = Math.floor((cleanData.length * 3) / 4);
  if (approxBytes > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { error: `حجم ${labelAr} يتجاوز الحد الأقصى المسموح (${mb} ميجابايت).` };
  }

  return { mime, data: cleanData };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);

  // Baseline security headers (no X-Frame-Options: DENY so AI Studio iframe works cleanly)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
    next();
  });

  app.use(express.json({ limit: "15mb" }));

  // Handle malformed JSON / oversized payloads cleanly in Arabic JSON
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err && typeof err === "object" && "type" in err && (err as { type?: string }).type === "entity.too.large") {
        res.status(413).json({
          error: "حجم المرفقات أكبر من الحد المسموح به (15 ميجابايت). يرجى تصغير الصورة أو التسجيل.",
        });
        return;
      }
      if (err instanceof SyntaxError && "body" in err) {
        res.status(400).json({ error: "صيغة البيانات المرسلة غير صالحة." });
        return;
      }
      next(err);
    }
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/diagnose", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "مفتاح الخدمة غير مهيأ على الخادم. يرجى التأكد من إعداد GEMINI_API_KEY.",
      });
      return;
    }

    const body = (req.body || {}) as {
      cat?: string;
      catName?: string;
      text?: string;
      image?: { mime?: string; data?: string } | null;
      audio?: { mime?: string; data?: string } | null;
    };

    const rawCat = String(body.cat || "").trim();
    const isAutoCategory = !rawCat || rawCat === "auto";
    const selectedCatId = isAutoCategory ? "" : rawCat;
    const catName = isAutoCategory
      ? "تحديد تلقائي حسب المشكلة"
      : String(body.catName || "أجهزة منزلية").trim().slice(0, 80);
    const text = String(body.text || "").trim().slice(0, 1500);

    const imageCheck = validateBase64Media(body.image, ALLOWED_IMAGE_MIMES, MAX_IMAGE_BYTES, "الصورة");
    if (imageCheck && "error" in imageCheck) {
      res.status(400).json({ error: imageCheck.error });
      return;
    }
    const audioCheck = validateBase64Media(body.audio, ALLOWED_AUDIO_MIMES, MAX_AUDIO_BYTES, "التسجيل الصوتي");
    if (audioCheck && "error" in audioCheck) {
      res.status(400).json({ error: audioCheck.error });
      return;
    }

    const image = imageCheck;
    const audio = audioCheck;

    if (!text && !image && !audio) {
      res.status(400).json({
        error: "يرجى كتابة وصف للمشكلة أو إرفاق صورة أو تسجيل صوتي.",
      });
      return;
    }

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (image) {
      parts.push({
        inlineData: {
          mimeType: image.mime,
          data: image.data,
        },
      });
    }

    if (audio) {
      parts.push({
        inlineData: {
          mimeType: audio.mime,
          data: audio.data,
        },
      });
    }

    parts.push({
      text: [
        isAutoCategory
          ? "الفئة: لم يحدد العميل فئة مسبقاً — صنّف المشكلة تلقائياً في detected_category (ac أو car أو elec أو appl أو phone) وأجب فوراً بالتشخيص الكامل."
          : `الفئة المختارة من العميل: ${catName} (${selectedCatId})`,
        text
          ? `وصف العميل للمشكلة: ${text}`
          : "وصف العميل للمشكلة: (لم يكتب العميل نصاً — اعتمد على الصورة أو التسجيل الصوتي المرفق)",
        "ملاحظة مهمة: أي سؤال عن قطعة عطلانة (مثل مكثف/كوندنساتور، فيوز، كمبريسور، حساس، بطارية، مضخة، مفتاح...) هو حالة صيانة حقيقية يجب تحليلها بعمق وذكر أسباب تلفها وطرق فحصها وتكلفتها العادلة في موريتانيا.",
        image ? "تنبيه إلزامي للصورة: تحقّق أولاً من هوية الصورة قبل أي تحليل." : "",
        audio ? "تنبيه إلزامي للصوت: استمع بصدق لما في التسجيل الصوتي وتأكد أنه صالح للمشكلة." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const CATEGORY_DESCRIPTIONS: Record<string, string> = {
      ac: "تكييف وتبريد (مكيف هواء داخلي/خارجي، ريموت أو شاشة خطأ المكيف، ثلاجة، فريزر، أنابيب تبريد)",
      car: "سيارات (محرك، بطارية سيارة، لوحة عدادات ولمبات التحذير، إطارات، هيكل/ميكانيكا سيارة)",
      elec: "كهرباء وسباكة (قواطع كهرباء، أسلاك، فيش/مقبس محروق، مفاتيح، مواسير مياه، صنابير، تسرب سباكة، سخان ماء)",
      appl: "أجهزة منزلية (غسالة، ثلاجة/فريزر، فرن، ميكروويف، تلفاز، سخان ماء، خلاط، مكواة)",
      phone: "هواتف (هاتف ذكي، شاشة مكسورة أو رسالة خطأ على شاشة الهاتف، بطارية هاتف، منفذ شحن، شاحن)",
    };

    const CATEGORY_NAMES: Record<string, string> = {
      ac: "تكييف وتبريد",
      car: "سيارات",
      elec: "كهرباء وسباكة",
      appl: "أجهزة منزلية",
      phone: "هواتف",
    };

    function isCategoryCompatible(selected: string, detected: string, matchesFromGate: boolean): boolean {
      if (!selected || !CATEGORY_NAMES[detected]) return true;
      if (selected === detected) return true;
      // Allow natural real-world overlap (e.g. fridge/freezer between ac & appl, water heater between elec & appl) when gatekeeper confirms compatibility
      if (
        matchesFromGate &&
        ((selected === "appl" && (detected === "ac" || detected === "elec")) ||
          (selected === "ac" && detected === "appl") ||
          (selected === "elec" && detected === "appl"))
      ) {
        return true;
      }
      return false;
    }

    async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
      let errOut: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await fn();
        } catch (err: unknown) {
          errOut = err;
          const msg = err instanceof Error ? err.message : String(err);
          const isTransient =
            msg.includes("429") ||
            msg.includes("503") ||
            msg.includes("500") ||
            msg.includes("ECONNRESET");
          if (attempt === 0 && isTransient) {
            await sleep(500);
            continue;
          }
          throw err;
        }
      }
      throw errOut;
    }

    const expectedDesc = isAutoCategory
      ? "تحديد تلقائي (أي جهاز صيانة حقيقي: تكييف/ثلاجة، سيارات، كهرباء/سباكة، أجهزة منزلية، أو هواتف)"
      : CATEGORY_DESCRIPTIONS[selectedCatId] || catName;

    type GateRejection = {
      status: number;
      body: Record<string, unknown>;
    };

    async function verifyImage(): Promise<{
      note?: string;
      rejection?: GateRejection;
    }> {
      if (!image) return {};
      const IMAGE_GATEKEEPER_SCHEMA = {
        type: Type.OBJECT,
        properties: {
          actual_content: {
            type: Type.STRING,
            description: "وصف موضوعي دقيق لهوية ما يظهر في الصورة فعلاً بالعربية.",
          },
          matches_selected_category: {
            type: Type.BOOLEAN,
            description: "true إذا كانت الصورة تُظهر جهازاً أو عطلاً أو لوحة قياس/شاشة خطأ تطابق الفئة المختارة، وfalse لأي صورة غير متعلقة أو لفئة مختلفة.",
          },
          is_person_or_unrelated: {
            type: Type.BOOLEAN,
            description: "true إذا كانت الصورة لشخص/وجه/سيلفي، حيوان، طعام، طبيعة، نقود، ورقة، أو لقطة شاشة لا تخص عطلاً فنياً.",
          },
          is_unreadable_or_blank: {
            type: Type.BOOLEAN,
            description: "true إذا كانت الصورة سوداء أو مظلمة جداً أو مشوشة لدرجة يستحيل تمييز أي جهاز فيها.",
          },
          detected_category: {
            type: Type.STRING,
            description: "إحدى القيم فقط: ac أو car أو elec أو appl أو phone أو unrelated أو unclear.",
          },
          reason_ar: {
            type: Type.STRING,
            description: "رسالة عربية واضحة تذكر ما رُصد في الصورة وسبب الرفض عند عدم الصلاحية.",
          },
        },
        required: [
          "actual_content",
          "matches_selected_category",
          "is_person_or_unrelated",
          "is_unreadable_or_blank",
          "detected_category",
          "reason_ar",
        ],
      };

      const gateResult = await runWithRetry(async () => {
        const checkResp = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: {
              parts: [
                { inlineData: { mimeType: image.mime, data: image.data } },
                {
                  text: [
                    "تحقّق من هوية هذه الصورة أولاً بدقة وموضوعية قبل أي تشخيص، وميّز بذكاء بين الصحيح والخطأ.",
                    `فئة الصيانة المختارة من المستخدم: ${expectedDesc}.`,
                    "قواعد التمييز الصارمة:",
                    "1. صف في actual_content ما في الصورة بصدق تام.",
                    "2. ارفض فوراً (is_person_or_unrelated = true, matches_selected_category = false, detected_category = 'unrelated') إذا كانت الصورة: وجهاً/شخصاً/سيلفي، حيواناً، طعاماً، طبيعة، نقوداً/مستندات، أو لقطة شاشة دردشة لا تخص عطلاً.",
                    "3. اقبل (لا تعتبره غير متعلق) إذا ظهرت فقط يد تشير لجهاز حقيقي، أو ظهرت شاشة هاتف/ريموت مكيف/لوحة عدادات سيارة/شاشة غسالة تعرض رمز خطأ أو مشكلة حقيقية.",
                    "4. لاحظ التداخل المنطقي: الثلاجة والفريزر صحيحتان في فئة «تكييف وتبريد» أو «أجهزة منزلية» (إن اختار المستخدم أياً منهما وكانت الصورة ثلاجة فاجعل detected_category مطابقاً لاختياره و matches_selected_category = true). أما المكيف المنفصل فيتبع ac فقط.",
                    "5. ارفض كغير واضحة (is_unreadable_or_blank = true, detected_category = 'unclear') إذا كانت الصورة سوداء/مظلمة/مشوشة كلياً.",
                    isAutoCategory
                      ? "6. لم يحدد العميل فئة مسبقاً: أي صورة جهاز/عطل صيانة حقيقي تُقبل (matches_selected_category = true) مع وضع الفئة الأنسب في detected_category."
                      : "6. إذا كانت الصورة لجهاز واضح من فئة مختلفة (مثل هاتف داخل فئة سيارات، أو سيارة داخل فئة تكييف، أو مكيف داخل فئة هواتف): اضبط matches_selected_category = false وحدد detected_category الصحيح.",
                  ].join("\n"),
                },
              ],
            },
            config: {
              systemInstruction:
                "أنت حارس تحقق بصري دقيق يفرق بذكاء بين صور الأعطال الحقيقية والصور الخاطئة أو المزيفة أو المخالفة للفئة. لا تخترع أجهزة غير موجودة ولا ترفض صور الأعطال الحقيقية.",
              responseMimeType: "application/json",
              responseSchema: IMAGE_GATEKEEPER_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          22000,
          "GATEKEEPER_TIMEOUT"
        );
        const checkText = (checkResp.text || "").trim();
        if (!checkText) throw new Error("Empty image verification response");
        return JSON.parse(checkText) as Record<string, unknown>;
      });

      const actualContent = String(gateResult.actual_content || "").trim().slice(0, 200);
      const detectedCat = String(gateResult.detected_category || "").trim().toLowerCase();
      const matchesSelected = Boolean(gateResult.matches_selected_category);
      const isPersonOrUnrelated = Boolean(gateResult.is_person_or_unrelated);
      const isUnreadable = Boolean(gateResult.is_unreadable_or_blank);
      const reasonAr = String(gateResult.reason_ar || "").trim().slice(0, 500);

      if (isPersonOrUnrelated || detectedCat === "unrelated") {
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "image",
              rejectionCode: "IMAGE_UNRELATED",
              selectedCategory: catName,
              detectedSubject: actualContent || "صورة لا تخص جهاز صيانة",
              error:
                reasonAr ||
                `تم رفض الصورة: الصورة المرفقة تُظهر (${actualContent || "محتوى غير متعلق بالصيانة"}) ولا تطابق فئة «${catName}». أرفق صورة حقيقية للعطل أو أزل الصورة.`,
            },
          },
        };
      }

      if (isUnreadable || detectedCat === "unclear") {
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "image",
              rejectionCode: "IMAGE_UNCLEAR",
              selectedCategory: catName,
              detectedSubject: actualContent || "صورة غير واضحة",
              error:
                reasonAr ||
                "تم رفض الصورة: الصورة غير واضحة أو مظلمة جداً ولا يمكن تمييز الجهاز فيها. التقط صورة أوضح أو أزل الصورة لوصف المشكلة نصياً.",
            },
          },
        };
      }

      if (
        !isAutoCategory &&
        (!isCategoryCompatible(selectedCatId, detectedCat, matchesSelected) || !matchesSelected)
      ) {
        const hasKnownCat = Boolean(CATEGORY_NAMES[detectedCat]);
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "image",
              rejectionCode: "CATEGORY_MISMATCH",
              selectedCategory: catName,
              detectedCategory: hasKnownCat && detectedCat !== selectedCatId ? detectedCat : undefined,
              detectedSubject: actualContent || (hasKnownCat ? CATEGORY_NAMES[detectedCat] : "صورة لا تطابق الفئة"),
              error:
                hasKnownCat && detectedCat !== selectedCatId
                  ? `تم رفض التحليل لعدم تطابق الفئة: الصورة المرفقة تُظهر (${actualContent || CATEGORY_NAMES[detectedCat]}) وتنتمي لفئة «${CATEGORY_NAMES[detectedCat]}» وليس «${catName}».`
                  : reasonAr || `تم رفض التحليل: الصورة المرفقة (${actualContent || "المحتوى المرصود"}) لا تطابق فئة «${catName}».`,
            },
          },
        };
      }

      return { note: actualContent };
    }

    async function verifyAudio(): Promise<{
      note?: string;
      rejection?: GateRejection;
    }> {
      if (!audio) return {};
      const AUDIO_GATEKEEPER_SCHEMA = {
        type: Type.OBJECT,
        properties: {
          actual_audio_content: {
            type: Type.STRING,
            description: "وصف موضوعي دقيق لما سُمع فعلاً في التسجيل الصوتي بالعربية.",
          },
          audio_type: {
            type: Type.STRING,
            description: "إحدى القيم فقط: machine_sound أو speech_problem أو both أو unrelated أو unclear.",
          },
          matches_selected_category: {
            type: Type.BOOLEAN,
            description: "true إذا كان الصوت يصف مشكلة ضمن الفئة المختارة أو يوثق صوت عطل جهاز/مركبة محتمل ضمن الفئة.",
          },
          is_unrelated_speech: {
            type: Type.BOOLEAN,
            description: "true إذا كان التسجيل مجرد تحية أو اختبار صوت أو غناء أو تلفاز أو حديث لا علاقة له بالصيانة.",
          },
          is_silence_or_unintelligible: {
            type: Type.BOOLEAN,
            description: "true إذا كان التسجيل صامتاً تماماً أو تشويش هواء/نقر ميكروفون فقط دون أي صوت جهاز أو كلام مفهوم.",
          },
          detected_category: {
            type: Type.STRING,
            description: "إحدى القيم فقط: ac أو car أو elec أو appl أو phone أو unrelated أو unclear.",
          },
          reason_ar: {
            type: Type.STRING,
            description: "سبب واضح لرفض التسجيل الصوتي إن كان غير صالح أو مخالفاً للفئة.",
          },
        },
        required: [
          "actual_audio_content",
          "audio_type",
          "matches_selected_category",
          "is_unrelated_speech",
          "is_silence_or_unintelligible",
          "detected_category",
          "reason_ar",
        ],
      };

      const gateResult = await runWithRetry(async () => {
        const checkResp = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: {
              parts: [
                { inlineData: { mimeType: audio.mime, data: audio.data } },
                {
                  text: [
                    "استمع لهذا التسجيل الصوتي بموضوعية تامة وتحقق من هويته أولاً قبل أي تشخيص، وميّز بدقة بين الصحيح والخطأ.",
                    `فئة الصيانة المختارة من العميل: ${expectedDesc}.`,
                    text ? `النص المرافق من العميل (للسياق فقط): ${text}` : "",
                    "قواعد التحقق الصارمة للتسجيل الصوتي:",
                    "1. إذا كان التسجيل صامتاً أو تشويش رياح/نقر يد على الميكروفون فقط بلا كلام وبلا صوت جهاز واضح: اضبط is_silence_or_unintelligible = true و audio_type = 'unclear' و detected_category = 'unclear' و matches_selected_category = false.",
                    "2. إذا كان الكلام مجرد تحية/مزاح/غناء/صوت تلفاز/تجربة ميكروفون («السلام عليكم»، «ألو»، «1 2 3»، «تست») دون ذكر أي عطل ودون صوت خلل جهاز: اضبط is_unrelated_speech = true و audio_type = 'unrelated' و detected_category = 'unrelated' و matches_selected_category = false.",
                    "3. إذا كان التسجيل صوت عطل ميكانيكي أو كهربائي غير طبيعي (طقطقة، أزيز، صفير، طرق محرك، خرير ماء): اضبط audio_type = 'machine_sound' واقبله ضمن الفئة المختارة (matches_selected_category = true) ما لم يكن صوتاً لا يمتّ لها بصلة بوضوح (مثل صوت محرك سيارة في فئة هواتف).",
                    isAutoCategory
                      ? "4. لم يحدد العميل فئة مسبقاً: إذا تحدث العميل بالعربية أو الحسانية الموريتانية أو الفرنسية يشرح أي مشكلة صيانة أو قطعة عطلانة، فاضبط matches_selected_category = true وحدد أنسب فئة في detected_category."
                      : "4. إذا تحدث العميل بالعربية أو الحسانية الموريتانية أو الفرنسية يشرح مشكلة صيانة: صف خلاصة كلامه في actual_audio_content وافحص إن كانت المشكلة تطابق الفئة المختارة؛ وإن ذكر جهازاً من فئة أخرى بوضوح (مثلاً تكلم عن هاتف أو سيارة داخل فئة تكييف)، فاضبط matches_selected_category = false وحدد detected_category الصحيح.",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                },
              ],
            },
            config: {
              systemInstruction:
                "أنت نظام تحقق صوتي دقيق في موريتانيا تفهم العربية الفصحى واللهجة الحسانية والمصطلحات الفرنسية الدارجة وأصوات الأعطال. مهمتك كشف التسجيلات الصامتة أو العبثية أو المخالفة للفئة، وقبول تسجيلات الأعطال الحقيقية بإنصاف.",
              responseMimeType: "application/json",
              responseSchema: AUDIO_GATEKEEPER_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          22000,
          "GATEKEEPER_TIMEOUT"
        );
        const checkText = (checkResp.text || "").trim();
        if (!checkText) throw new Error("Empty audio verification response");
        return JSON.parse(checkText) as Record<string, unknown>;
      });

      const actualAudio = String(gateResult.actual_audio_content || "").trim().slice(0, 220);
      const audioType = String(gateResult.audio_type || "").trim().toLowerCase();
      const detectedCat = String(gateResult.detected_category || "").trim().toLowerCase();
      const matchesSelected = Boolean(gateResult.matches_selected_category);
      const isUnrelated = Boolean(gateResult.is_unrelated_speech);
      const isSilence = Boolean(gateResult.is_silence_or_unintelligible);
      const reasonAr = String(gateResult.reason_ar || "").trim().slice(0, 500);

      if (isUnrelated || audioType === "unrelated" || detectedCat === "unrelated") {
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "audio",
              rejectionCode: "AUDIO_UNRELATED",
              selectedCategory: catName,
              detectedSubject: actualAudio || "تسجيل صوتي لا يخص عطل صيانة",
              error:
                reasonAr ||
                `تم رفض التسجيل الصوتي: سُمع (${actualAudio || "كلام غير متعلق بالصيانة"}) ولا يصف عطلاً لـ «${catName}». سجّل وصف العطل أو صوت الجهاز بوضوح أو احذف التسجيل.`,
            },
          },
        };
      }

      if (isSilence || audioType === "unclear" || detectedCat === "unclear") {
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "audio",
              rejectionCode: "AUDIO_UNCLEAR",
              selectedCategory: catName,
              detectedSubject: actualAudio || "تسجيل صوتي غير واضح أو صامت",
              error:
                reasonAr ||
                "تم رفض التسجيل الصوتي: الصوت غير واضح أو صامت جداً ولا يمكن تمييز المشكلة منه. أعد التسجيل بصوت واضح أو اكتب المشكلة نصياً.",
            },
          },
        };
      }

      if (
        !isAutoCategory &&
        (!isCategoryCompatible(selectedCatId, detectedCat, matchesSelected) || !matchesSelected)
      ) {
        const hasKnownCat = Boolean(CATEGORY_NAMES[detectedCat]);
        return {
          rejection: {
            status: 422,
            body: {
              rejected: true,
              rejectionSource: "audio",
              rejectionCode: "CATEGORY_MISMATCH",
              selectedCategory: catName,
              detectedCategory: hasKnownCat && detectedCat !== selectedCatId ? detectedCat : undefined,
              detectedSubject: actualAudio || (hasKnownCat ? CATEGORY_NAMES[detectedCat] : "صوت لا يطابق الفئة"),
              error:
                hasKnownCat && detectedCat !== selectedCatId
                  ? `تم رفض التسجيل لعدم تطابق الفئة: التسجيل يصف أو يخص (${actualAudio || CATEGORY_NAMES[detectedCat]}) ضمن فئة «${CATEGORY_NAMES[detectedCat]}» وليس «${catName}».`
                  : reasonAr || `تم رفض التسجيل الصوتي: (${actualAudio || "المحتوى الصوتي"}) لا يطابق فئة «${catName}».`,
            },
          },
        };
      }

      return { note: actualAudio };
    }

    let visualVerificationNote = "";
    let audioVerificationNote = "";

    if (image || audio) {
      try {
        const [imgCheck, audCheck] = await Promise.all([verifyImage(), verifyAudio()]);

        if (imgCheck.rejection) {
          res.status(imgCheck.rejection.status).json(imgCheck.rejection.body);
          return;
        }
        if (audCheck.rejection) {
          res.status(audCheck.rejection.status).json(audCheck.rejection.body);
          return;
        }
        visualVerificationNote = imgCheck.note || "";
        audioVerificationNote = audCheck.note || "";
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : "Unknown error";
        console.error("Media gatekeeper error:", errMessage);
        if (errMessage === "GATEKEEPER_TIMEOUT") {
          res.status(504).json({
            error: "استغرق فحص المرفقات وقتاً طويلاً بسبب الشبكة. حاول مجدداً.",
          });
          return;
        }
        if (errMessage.includes("403") || errMessage.includes("API_KEY_INVALID") || errMessage.includes("400")) {
          res.status(400).json({
            error: "تعذر التحقق من مفتاح الخدمة على الخادم.",
          });
          return;
        }
        if (errMessage.includes("429") || errMessage.includes("RESOURCE_EXHAUSTED")) {
          res.status(429).json({
            error: "الخدمة مزدحمة مؤقتاً. يرجى المحاولة بعد لحظات.",
          });
          return;
        }
        res.status(502).json({
          error: "تعذر فحص المرفقات حالياً. يرجى المحاولة مرة أخرى.",
        });
        return;
      }
    }

    if (visualVerificationNote) {
      parts.push({
        text: `نتيجة التحقق البصري الموثّقة للصورة: ${visualVerificationNote}`,
      });
    }
    if (audioVerificationNote) {
      parts.push({
        text: `نتيجة التحقق الصوتي الموثّقة للتسجيل: ${audioVerificationNote}`,
      });
    }

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: { parts },
            config: {
              systemInstruction: SYSTEM_PROMPT,
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            },
          }),
          38000,
          "DIAGNOSE_TIMEOUT"
        );

        const rawText = (response.text || "").trim();
        if (!rawText) {
          throw new Error("Empty model response");
        }
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        if (parsed.is_valid_case === false) {
          const detectedSubject = String(parsed.detected_subject || "").trim().slice(0, 200);
          const detectedCat = String(parsed.detected_category || "").trim().toLowerCase();
          const hasKnownCat = Boolean(CATEGORY_NAMES[detectedCat]);
          const reason =
            String(parsed.rejection_reason || "").trim().slice(0, 600) ||
            "تم رفض التحليل: المرفق أو الوصف لا يطابق عطلاً فنياً في الفئة المختارة.";
          res.status(422).json({
            rejected: true,
            rejectionSource: image ? "image" : audio ? "audio" : "text",
            rejectionCode:
              hasKnownCat && detectedCat !== selectedCatId
                ? "CATEGORY_MISMATCH"
                : "INVALID_CASE",
            selectedCategory: catName,
            detectedCategory:
              hasKnownCat && detectedCat !== selectedCatId ? detectedCat : undefined,
            detectedSubject,
            error: reason,
          });
          return;
        }
        if (!parsed.diagnosis) {
          throw new Error("Incomplete diagnosis response");
        }

        res.json(normalizeDiagnosis(parsed));
        return;
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = msg.includes("429") || msg.includes("503") || msg.includes("500") || msg.includes("ECONNRESET");
        if (attempt < 2 && isTransient) {
          await sleep(600 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    }

    const errMessage = lastError instanceof Error ? lastError.message : "Unknown error";
    console.error("Gemini diagnose error:", errMessage);

    if (errMessage === "DIAGNOSE_TIMEOUT") {
      res.status(504).json({
        error: "انتهت مهلة الاتصال أثناء التحليل بسبب بطء الشبكة. أعد المحاولة الآن.",
      });
      return;
    }
    if (errMessage.includes("403") || errMessage.includes("API_KEY_INVALID") || errMessage.includes("400")) {
      res.status(400).json({
        error: "تعذر التحقق من مفتاح الخدمة على الخادم.",
      });
      return;
    }
    if (errMessage.includes("429") || errMessage.includes("RESOURCE_EXHAUSTED")) {
      res.status(429).json({
        error: "تم تجاوز حد الطلبات مؤقتاً. يرجى المحاولة بعد لحظات.",
      });
      return;
    }

    res.status(502).json({
      error: "تعذر إتمام التحليل عبر الخادم حالياً. يرجى المحاولة مرة أخرى.",
    });
  });

  app.post("/api/check-quote", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "مفتاح الخدمة غير مهيأ على الخادم." });
      return;
    }

    const body = (req.body || {}) as {
      catName?: string;
      diagnosis?: string;
      quotedMru?: number;
      claim?: string;
      partsRange?: { min?: number; max?: number };
      laborRange?: { min?: number; max?: number };
    };

    const quotedMru = Math.round(Number(body.quotedMru) || 0);
    if (quotedMru <= 0 || quotedMru > 5000000) {
      res.status(400).json({ error: "يرجى إدخال مبلغ صحيح بالأوقية." });
      return;
    }

    const catName = String(body.catName || "صيانة عامة").slice(0, 80);
    const diagnosis = String(body.diagnosis || "").slice(0, 1200);
    const claim = String(body.claim || "").trim().slice(0, 400);
    const parts = normalizeRange(body.partsRange);
    const labor = normalizeRange(body.laborRange);

    const prompt = [
      `الفئة: ${catName}`,
      `التشخيص الأولي للعطل: ${diagnosis || "غير محدد"}`,
      `التقدير الأولي العادل للقطع: ${parts.min} – ${parts.max} أوقية جديدة (${parts.min * 10} – ${parts.max * 10} قديمة)`,
      `التقدير الأولي العادل لليد العاملة: ${labor.min} – ${labor.max} أوقية جديدة (${labor.min * 10} – ${labor.max * 10} قديمة)`,
      `المبلغ الذي طلبه الفني من العميل: ${quotedMru} أوقية جديدة (${quotedMru * 10} أوقية قديمة)`,
      claim ? `ما قاله الفني للعميل: ${claim}` : "لم يذكر العميل تفاصيل إضافية من الفني.",
      "قيّم هذا السعر بدقة وفق أسعار السوق الموريتاني (نواكشوط ونواذيبو) وارجع النتيجة بصيغة JSON.",
    ].join("\n");

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
              systemInstruction:
                "أنت خبير تسعير ومراقب جودة صيانة في موريتانيا. مهمتك حماية المواطن من المبالغة أو الغش في قطع الغيار وأجرة الفني. قدّم تقييماً واضحاً بالأوقية الجديدة والقديمة (×10) مع جملة تفاوض عملية ومحترمة.",
              responseMimeType: "application/json",
              responseSchema: QUOTE_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          25000,
          "QUOTE_TIMEOUT"
        );
        const rawText = (response.text || "").trim();
        if (!rawText) throw new Error("Empty model response");
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        res.json({
          verdict: normalizeVerdict(parsed.verdict),
          fair_total_mru: normalizeRange(parsed.fair_total_mru),
          difference_note: String(parsed.difference_note || "").slice(0, 1000),
          negotiation_script: String(parsed.negotiation_script || "").slice(0, 800),
          warning_signs: Array.isArray(parsed.warning_signs)
            ? parsed.warning_signs.map(String).filter(Boolean).slice(0, 4)
            : [],
        });
        return;
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = msg.includes("429") || msg.includes("503") || msg.includes("500") || msg.includes("ECONNRESET");
        if (attempt < 2 && isTransient) {
          await sleep(600 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    }

    const errMessage = lastError instanceof Error ? lastError.message : "Unknown error";
    console.error("Gemini quote check error:", errMessage);
    if (errMessage === "QUOTE_TIMEOUT") {
      res.status(504).json({ error: "انتهت مهلة تدقيق التسعيرة. حاول مجدداً." });
      return;
    }
    res.status(502).json({ error: "تعذر تدقيق التسعيرة حالياً. يرجى المحاولة مرة أخرى." });
  });

  app.post("/api/follow-up", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "مفتاح الخدمة غير مهيأ على الخادم." });
      return;
    }

    const body = (req.body || {}) as {
      catName?: string;
      problemText?: string;
      diagnosis?: string;
      diySteps?: string[];
      completedSteps?: string[];
      quoteSummary?: string;
      history?: Array<{ question?: string; answer?: string }>;
      question?: string;
    };

    const question = String(body.question || "").trim().slice(0, 800);
    if (!question) {
      res.status(400).json({ error: "يرجى كتابة سؤالك أولاً." });
      return;
    }

    const catName = String(body.catName || "صيانة عامة").slice(0, 80);
    const problemText = String(body.problemText || "").slice(0, 600);
    const diagnosis = String(body.diagnosis || "").slice(0, 1500);
    const diySteps = Array.isArray(body.diySteps) ? body.diySteps.slice(0, 6).join(" | ") : "";
    const completedSteps = Array.isArray(body.completedSteps)
      ? body.completedSteps.slice(0, 6).join(" | ")
      : "";
    const quoteSummary = String(body.quoteSummary || "").slice(0, 300);
    const historyLines = Array.isArray(body.history)
      ? body.history
          .slice(-4)
          .map((h) => `س: ${String(h.question || "").slice(0, 250)}\nج: ${String(h.answer || "").slice(0, 400)}`)
          .join("\n---\n")
      : "";

    const prompt = [
      `الفئة: ${catName}`,
      problemText ? `وصف المستخدم الأصلي: ${problemText}` : "",
      `التشخيص السابق: ${diagnosis}`,
      diySteps ? `خطوات الفحص المقترحة: ${diySteps}` : "",
      completedSteps ? `الخطوات التي جرّبها المستخدم بالفعل وأتمّها: ${completedSteps}` : "",
      quoteSummary ? `ملخص تسعيرة الفني المسجلة: ${quoteSummary}` : "",
      historyLines ? `محادثة المتابعة السابقة:\n${historyLines}` : "",
      `سؤال المتابعة الجديد: ${question}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
              systemInstruction:
                "أنت كبير خبراء الصيانة في موريتانيا. تتبع حالة العطل خطوة بخطوة: لا تكرر خطوة أتمّها المستخدم بالفعل، وابنِ إجابتك على ما تم فحصه وما قاله الفني، مع اقتراح أسئلة متابعة ذكية تالية.",
              responseMimeType: "application/json",
              responseSchema: FOLLOWUP_SCHEMA,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            },
          }),
          28000,
          "FOLLOWUP_TIMEOUT"
        );
        const rawText = (response.text || "").trim();
        if (!rawText) throw new Error("Empty model response");
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        res.json({
          answer: String(parsed.answer || "").slice(0, 2000),
          next_action: String(parsed.next_action || "").slice(0, 600),
          suggested_followups: Array.isArray(parsed.suggested_followups)
            ? parsed.suggested_followups.map(String).filter(Boolean).slice(0, 3)
            : [],
        });
        return;
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isTransient = msg.includes("429") || msg.includes("503") || msg.includes("500") || msg.includes("ECONNRESET");
        if (attempt < 2 && isTransient) {
          await sleep(600 * Math.pow(2, attempt));
          continue;
        }
        break;
      }
    }

    const errMessage = lastError instanceof Error ? lastError.message : "Unknown error";
    console.error("Gemini follow-up error:", errMessage);
    if (errMessage === "FOLLOWUP_TIMEOUT") {
      res.status(504).json({ error: "انتهت مهلة الاتصال أثناء المتابعة. حاول مجدداً." });
      return;
    }
    res.status(502).json({ error: "تعذرت الإجابة على المتابعة حالياً. يرجى المحاولة مرة أخرى." });
  });

  // ===== Admin Authentication (Salted Scrypt + Bearer HMAC + Brute-Force Protection) =====
  const loginFailures = new Map<string, { count: number; lockedUntil: number }>();

  let cachedAdminAuth: AdminAuthRecord | null = null;
  try {
    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ADMIN_AUTH_FILE, "utf8")) as AdminAuthRecord;
      if (parsed && typeof parsed.passwordHash === "string" && parsed.passwordHash.startsWith("scrypt:")) {
        cachedAdminAuth = parsed;
      }
    }
  } catch {
    cachedAdminAuth = null;
  }

  function getAdminAuthStatus(): {
    configured: boolean;
    source: "env" | "custom" | "unconfigured";
    updatedAt: number | null;
  } {
    if (ENV_ADMIN_PASS.length > 0) {
      return { configured: true, source: "env", updatedAt: null };
    }
    if (cachedAdminAuth?.passwordHash) {
      return {
        configured: true,
        source: "custom",
        updatedAt: Number(cachedAdminAuth.updatedAt) || null,
      };
    }
    return { configured: false, source: "unconfigured", updatedAt: null };
  }

  function verifyCandidatePassword(candidate: string): boolean {
    if (!candidate) return false;
    if (ENV_ADMIN_PASS.length > 0) {
      return timingSafeMatch(candidate, ENV_ADMIN_PASS);
    }
    if (cachedAdminAuth?.passwordHash) {
      return verifyPasswordScrypt(candidate, cachedAdminAuth.passwordHash);
    }
    return false;
  }

  app.get("/api/admin/status", (_req, res) => {
    res.json(getAdminAuthStatus());
  });

  app.post("/api/admin/setup", async (req, res) => {
    if (ENV_ADMIN_PASS.length > 0) {
      res.status(403).json({
        error: "كلمة مرور الإدارة مهيأة مسبقاً من إعدادات الخادم.",
      });
      return;
    }

    const body = (req.body || {}) as { password?: string };
    const candidate = String(body.password || "").trim();
    if (candidate.length < 4 || candidate.length > 64) {
      res.status(400).json({
        error: "يجب أن تتكون كلمة المرور من 4 إلى 64 حرفاً أو رقماً.",
      });
      return;
    }

    const setupResult = await mutateJsonFile<
      AdminAuthRecord | null,
      { conflict: boolean; record: AdminAuthRecord }
    >(
      ADMIN_AUTH_FILE,
      null,
      (current) => {
        if (current && typeof current.passwordHash === "string" && current.passwordHash.startsWith("scrypt:")) {
          return { next: current, result: { conflict: true, record: current }, skipWrite: true };
        }
        const record: AdminAuthRecord = {
          passwordHash: hashPasswordScrypt(candidate),
          updatedAt: Date.now(),
        };
        return { next: record, result: { conflict: false, record } };
      },
      0o600
    );

    if (setupResult.conflict) {
      cachedAdminAuth = setupResult.record;
      res.status(409).json({
        error: "تم إعداد كلمة مرور الإدارة مسبقاً. أدخل كلمة المرور للدخول.",
      });
      return;
    }

    cachedAdminAuth = setupResult.record;
    const now = Date.now();
    const expiresAt = now + 12 * 60 * 60 * 1000;
    const token = signToken({ role: "admin", iat: now, exp: expiresAt });
    res.json({
      ok: true,
      token,
      expiresAt,
      ...getAdminAuthStatus(),
    });
  });

  app.post("/api/admin/login", (req, res) => {
    const status = getAdminAuthStatus();
    if (!status.configured) {
      res.status(409).json({
        error: "لم يتم تعيين كلمة مرور الإدارة بعد. يرجى إعداد كلمة مرور مخصصة أولاً.",
        needsSetup: true,
      });
      return;
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginFailures.get(ip);
    if (record && record.lockedUntil > now) {
      const waitMin = Math.max(1, Math.ceil((record.lockedUntil - now) / 60000));
      res.status(429).json({
        error: `تم حظر المحاولات مؤقتاً لكثرة الأخطاء. حاول بعد ${waitMin} دقيقة.`,
      });
      return;
    }

    const body = (req.body || {}) as { password?: string };
    const candidate = String(body.password || "").trim();
    if (!verifyCandidatePassword(candidate)) {
      const nextCount = (record && record.lockedUntil <= now ? 0 : record?.count || 0) + 1;
      const lockedUntil = nextCount >= 5 ? now + 15 * 60 * 1000 : 0;
      loginFailures.set(ip, { count: nextCount, lockedUntil });
      res.status(401).json({
        error: lockedUntil
          ? "تم تجاوز الحد المسموح. انتظر 15 دقيقة قبل المحاولة مجدداً."
          : "كلمة مرور الإدارة غير صحيحة",
      });
      return;
    }

    loginFailures.delete(ip);
    const expiresAt = now + 12 * 60 * 60 * 1000;
    const token = signToken({ role: "admin", iat: now, exp: expiresAt });
    res.json({ ok: true, token, expiresAt, ...status });
  });

  app.post("/api/admin/change-password", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    if (ENV_ADMIN_PASS.length > 0) {
      res.status(400).json({
        error: "كلمة المرور مضبوطة من إعدادات الخادم (Secrets) ولا يمكن تغييرها من هنا.",
      });
      return;
    }

    const body = (req.body || {}) as { currentPassword?: string; newPassword?: string };
    const currentPassword = String(body.currentPassword || "").trim();
    const newPassword = String(body.newPassword || "").trim();

    if (!verifyCandidatePassword(currentPassword)) {
      res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة." });
      return;
    }
    if (newPassword.length < 4 || newPassword.length > 64) {
      res.status(400).json({
        error: "يجب أن تتكون كلمة المرور الجديدة من 4 إلى 64 حرفاً أو رقماً.",
      });
      return;
    }

    const updated = await mutateJsonFile<AdminAuthRecord | null, AdminAuthRecord>(
      ADMIN_AUTH_FILE,
      null,
      () => {
        const record: AdminAuthRecord = {
          passwordHash: hashPasswordScrypt(newPassword),
          updatedAt: Date.now(),
        };
        return { next: record, result: record };
      },
      0o600
    );

    cachedAdminAuth = updated;
    const now = Date.now();
    const expiresAt = now + 12 * 60 * 60 * 1000;
    const token = signToken({ role: "admin", iat: now, exp: expiresAt });
    res.json({
      ok: true,
      token,
      expiresAt,
      ...getAdminAuthStatus(),
    });
  });

  function verifyAdminTokenFromReq(req: express.Request): boolean {
    const auth = String(req.headers.authorization || "").trim();
    const queryToken = typeof req.query.token === "string" ? req.query.token.trim() : "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : queryToken;
    if (!token) return false;
    const verified = verifyToken<{ role?: string; iat?: number; exp?: number }>(token);
    if (!verified || verified.role !== "admin") return false;
    if (
      ENV_ADMIN_PASS.length === 0 &&
      cachedAdminAuth?.updatedAt &&
      Number(verified.iat || 0) < cachedAdminAuth.updatedAt - 1000
    ) {
      return false;
    }
    return true;
  }

  function requireAdmin(req: express.Request, res: express.Response): boolean {
    const auth = String(req.headers.authorization || "").trim();
    if (!auth.startsWith("Bearer ")) {
      res.status(401).json({ error: "غير مصرح" });
      return false;
    }
    if (!verifyAdminTokenFromReq(req)) {
      res.status(401).json({ error: "انتهت جلسة الإدارة، أعد تسجيل الدخول" });
      return false;
    }
    return true;
  }

  // ===== Custom General Codes & Device Activation =====
  app.get("/api/admin/codes", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const codes = await readJsonFile<CustomCodeRecord[]>(CUSTOM_CODES_FILE, []);
    res.json({ codes });
  });

  app.post("/api/admin/codes", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = (req.body || {}) as {
      code?: string;
      planId?: string;
      singleUse?: boolean;
    };
    const code = normalizeCustomCode(body.code);
    const planId =
      body.planId === "basic" || body.planId === "pro" || body.planId === "year" ? body.planId : null;
    const singleUse = body.singleUse !== false;

    if (!code || code.length < 3 || code.length > 24) {
      res.status(400).json({ error: "يجب أن يتكون الكود من 3 إلى 24 حرفاً أو رقماً بالإنجليزية." });
      return;
    }
    if (!planId) {
      res.status(400).json({ error: "نوع الباقة غير صالح." });
      return;
    }

    const outcome = await mutateJsonFile<
      CustomCodeRecord[],
      { conflict: boolean; record?: CustomCodeRecord; codes?: CustomCodeRecord[] }
    >(CUSTOM_CODES_FILE, [], (list) => {
      if (list.some((item) => item.code === code)) {
        return { next: list, result: { conflict: true }, skipWrite: true };
      }
      const record: CustomCodeRecord = {
        code,
        planId,
        singleUse,
        usedCount: 0,
        createdAt: Date.now(),
      };
      const next = [record, ...list];
      return { next, result: { conflict: false, record, codes: next } };
    });

    if (outcome.conflict) {
      res.status(409).json({ error: "هذا الكود موجود مسبقاً." });
      return;
    }
    res.json({ code: outcome.record, codes: outcome.codes });
  });

  app.delete("/api/admin/codes/:code", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const target = normalizeCustomCode(req.params.code);
    const codes = await mutateJsonFile<CustomCodeRecord[], CustomCodeRecord[]>(
      CUSTOM_CODES_FILE,
      [],
      (list) => {
        const next = list.filter((item) => item.code !== target);
        return { next, result: next };
      }
    );
    res.json({ codes });
  });

  app.post("/api/admin/generate-device-code", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const body = (req.body || {}) as { deviceId?: number; planId?: string };
    const deviceId = Number(body.deviceId);
    const planId =
      body.planId === "basic" || body.planId === "pro" || body.planId === "year" ? body.planId : null;
    if (!isValidDeviceId(deviceId) || !planId) {
      res.status(400).json({ error: "رقم الجهاز أو الباقة غير صالح." });
      return;
    }
    const code = buildDeviceCode(deviceId, planId);
    res.json({ ok: true, code, deviceId, planId });
  });

  async function redeemActivation(codeInput: string, deviceIdRaw: unknown) {
    const code = normalizeCustomCode(codeInput);
    if (!code) {
      return { status: 400, body: { ok: false, error: "يرجى إدخال كود التفعيل" } };
    }

    const deviceId = Number(deviceIdRaw);
    const validDev = isValidDeviceId(deviceId);

    if (validDev) {
      if (new RegExp(`^#?${deviceId}#?$`).test(code.replace(/#/g, ""))) {
        return {
          status: 400,
          body: {
            ok: false,
            error: `هذا رقم جهازك (${deviceId}) وليس كود التفعيل. أرسله عبر واتساب لاستلام كود التفعيل الذي يبدأ بـ B- أو P- أو Y-.`,
          },
        };
      }

      const isLegacyDev = deviceId >= 1000 && deviceId <= 9999;
      const matchedPlan = (["basic", "pro", "year"] as PlanId[]).find(
        (pid) =>
          buildDeviceCode(deviceId, pid) === code ||
          (isLegacyDev && buildLegacyDeviceCode(deviceId, pid) === code)
      );

      if (matchedPlan) {
        const alreadyUsed = await mutateJsonFile<string[], boolean>(
          USED_CODES_FILE,
          [],
          (usedList) => {
            if (usedList.includes(code)) {
              return { next: usedList, result: true, skipWrite: true };
            }
            const next = [code, ...usedList].slice(0, 50000);
            return { next, result: false };
          }
        );

        if (alreadyUsed) {
          return {
            status: 409,
            body: {
              ok: false,
              error: "عذراً، هذا الكود تم استخدامه مسبقاً وهو صالح لمرة واحدة فقط",
            },
          };
        }

        const { exp, token } = buildEntitlementToken(deviceId, matchedPlan);
        return {
          status: 200,
          body: {
            ok: true,
            planId: matchedPlan,
            days: PLAN_DAYS[matchedPlan],
            exp,
            entitlementToken: token,
            normalizedCode: code,
            singleUse: true,
          },
        };
      }
    }

    // Fallback to general / instant admin-managed codes
    const customOutcome = await mutateJsonFile<
      CustomCodeRecord[],
      { status: number; body: Record<string, unknown> }
    >(CUSTOM_CODES_FILE, [], (list) => {
      const compactCode = code.replace(/-/g, "");
      const idx = list.findIndex(
        (item) => item.code === code || item.code.replace(/-/g, "") === compactCode
      );
      if (idx === -1) {
        return {
          next: list,
          result: { status: 404, body: { ok: false, error: "هذا الكود غير صالح لهذا الجهاز" } },
          skipWrite: true,
        };
      }
      const found = list[idx];
      if (found.singleUse && found.usedCount >= 1) {
        return {
          next: list,
          result: {
            status: 409,
            body: { ok: false, error: "عذراً، هذا الكود تم استخدامه مسبقاً وهو صالح لمرة واحدة فقط" },
          },
          skipWrite: true,
        };
      }
      const next = [...list];
      next[idx] = { ...found, usedCount: found.usedCount + 1 };
      const targetDevice = validDev ? deviceId : 0;
      const { exp, token } = buildEntitlementToken(targetDevice, found.planId);
      return {
        next,
        result: {
          status: 200,
          body: {
            ok: true,
            planId: found.planId,
            days: PLAN_DAYS[found.planId],
            exp,
            entitlementToken: token,
            normalizedCode: found.code,
            singleUse: found.singleUse,
          },
        },
      };
    });

    return customOutcome;
  }

  app.post("/api/activate", async (req, res) => {
    const body = (req.body || {}) as { code?: string; deviceId?: number };
    const outcome = await redeemActivation(String(body.code || ""), body.deviceId);
    res.status(outcome.status).json(outcome.body);
  });

  app.post("/api/activate-custom", async (req, res) => {
    const body = (req.body || {}) as { code?: string; deviceId?: number };
    const outcome = await redeemActivation(String(body.code || ""), body.deviceId);
    res.status(outcome.status).json(outcome.body);
  });

  // ===== Private Admin-Only Activation Inbox =====
  app.post("/api/subscription-requests", async (req, res) => {
    const body = (req.body || {}) as {
      id?: string;
      deviceId?: number;
      planId?: string;
      planName?: string;
      priceMru?: number;
    };

    const deviceId = Number(body.deviceId);
    const planId =
      body.planId === "basic" || body.planId === "pro" || body.planId === "year" ? body.planId : null;
    const reqId = String(
      body.id || `${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
    )
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 24);

    if (!isValidDeviceId(deviceId) || !planId || !reqId) {
      res.status(400).json({ error: "بيانات الطلب غير صالحة" });
      return;
    }

    const activationCode = buildDeviceCode(deviceId, planId);
    const record: SubscriptionRequestRecord = {
      id: reqId,
      deviceId,
      planId,
      planName: String(body.planName || planId).slice(0, 80),
      priceMru: Math.max(0, Math.round(Number(body.priceMru) || 0)),
      activationCode,
      status: "pending",
      createdAt: Date.now(),
    };

    await mutateJsonFile<SubscriptionRequestRecord[], void>(REQUESTS_FILE, [], (list) => {
      const next = [record, ...list].slice(0, 5000);
      return { next, result: undefined };
    });

    res.json({ ok: true, id: record.id });
  });

  app.get("/api/admin/requests", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const requests = await readJsonFile<SubscriptionRequestRecord[]>(REQUESTS_FILE, []);
    res.json({ requests });
  });

  app.patch("/api/admin/requests/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const targetId = String(req.params.id || "").trim();
    const requests = await mutateJsonFile<SubscriptionRequestRecord[], SubscriptionRequestRecord[]>(
      REQUESTS_FILE,
      [],
      (list) => {
        const next = list.map((item) =>
          item.id === targetId ? { ...item, status: "sent" as const } : item
        );
        return { next, result: next };
      }
    );
    res.json({ requests });
  });

  app.delete("/api/admin/requests/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const targetId = String(req.params.id || "").trim();
    const requests = await mutateJsonFile<SubscriptionRequestRecord[], SubscriptionRequestRecord[]>(
      REQUESTS_FILE,
      [],
      (list) => {
        const next = list.filter((item) => item.id !== targetId);
        return { next, result: next };
      }
    );
    res.json({ requests });
  });

  // ===== Admin TikTok Video & Arabic TTS Studio =====
  let promoJobInFlight: Promise<unknown> | null = null;

  app.get("/api/admin/promo-assets", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const assets = await listPromoAssets();
    res.json({
      assets,
      presets: PROMO_PRESETS,
      hasProfileAvatar: Boolean(resolvePromoFilePath("sallahli-profile-avatar.jpg")),
    });
  });

  app.post("/api/admin/promo-bootstrap", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "مفتاح الخدمة غير مهيأ على الخادم لتوليد الصوت." });
      return;
    }
    if (promoJobInFlight) {
      await promoJobInFlight.catch(() => {});
      const assets = await listPromoAssets();
      res.json({ ok: true, assets });
      return;
    }

    const job = ensureStarterPromoVideos(apiKey);
    promoJobInFlight = job;
    try {
      const assets = await job;
      res.json({ ok: true, assets });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Promo bootstrap error:", msg);
      res.status(502).json({ error: "تعذر تجهيز الفيديوهات حالياً، حاول مجدداً.", detail: msg });
    } finally {
      if (promoJobInFlight === job) promoJobInFlight = null;
    }
  });

  app.post("/api/admin/promo-generate", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "مفتاح الخدمة غير مهيأ على الخادم لتوليد الصوت." });
      return;
    }
    if (promoJobInFlight) {
      res.status(409).json({ error: "جاري إنتاج فيديو آخر حالياً، انتظر ثواني وحاول مجدداً." });
      return;
    }

    const body = (req.body || {}) as {
      presetKey?: string;
      title?: string;
      description?: string;
      tiktokCaption?: string;
      voiceTone?: string;
      scenes?: Array<{
        badge?: string;
        title?: string;
        subtitle?: string;
        voiceText?: string;
        backdropKey?: string;
        visualType?: string;
        accentColor?: string;
      }>;
    };

    const matchedPreset = body.presetKey
      ? PROMO_PRESETS.find((p) => p.key === body.presetKey)
      : undefined;

    const voiceTone: VoiceTone =
      body.voiceTone === "energetic" ? "energetic" : matchedPreset?.voiceTone || "calm";
    const allowedBackdrops = new Set(["ac", "car", "voice", "install"]);
    const allowedVisuals = new Set(["hook", "diagnose", "price", "voice", "chrome_install"]);

    let scenes: PromoSceneSpec[] = [];
    if (Array.isArray(body.scenes) && body.scenes.length >= 2 && body.scenes.length <= 5) {
      scenes = body.scenes
        .map((s) => ({
          badge: String(s.badge || "صلاح لي").trim().slice(0, 48),
          title: String(s.title || "").trim().slice(0, 70),
          subtitle: String(s.subtitle || "").trim().slice(0, 110),
          voiceText: String(s.voiceText || "").trim().slice(0, 260),
          backdropKey: (allowedBackdrops.has(String(s.backdropKey))
            ? s.backdropKey
            : "install") as PromoSceneSpec["backdropKey"],
          visualType: (allowedVisuals.has(String(s.visualType))
            ? s.visualType
            : "diagnose") as PromoSceneSpec["visualType"],
          accentColor: /^#[0-9A-Fa-f]{6}$/.test(String(s.accentColor || ""))
            ? String(s.accentColor)
            : "#F97316",
        }))
        .filter((s) => s.title && s.voiceText);
    } else if (matchedPreset) {
      scenes = matchedPreset.scenes;
    }

    if (scenes.length < 2) {
      res.status(400).json({ error: "يرجى توفير مشهدين على الأقل بعنوان وتعليق صوتي واضح." });
      return;
    }

    const title = String(body.title || matchedPreset?.title || "فيديو صلاح لي الجديد")
      .trim()
      .slice(0, 90);
    const description = String(
      body.description || matchedPreset?.description || "فيديو ترويجي جاهز للنشر على تيك توك"
    )
      .trim()
      .slice(0, 220);
    const tiktokCaption = String(
      body.tiktokCaption ||
        matchedPreset?.tiktokCaption ||
        "افحص أي عطل واعرف السعر العادل مع صلاح لي! افتح الرابط في Chrome واضغط تثبيت التطبيق 🔧🇲🇷"
    )
      .trim()
      .slice(0, 450);

    const id = matchedPreset ? matchedPreset.key : `custom-${Date.now()}`;
    const job = generatePromoVideo({
      id,
      presetKey: matchedPreset?.key,
      title,
      description,
      tiktokCaption,
      voiceTone,
      scenes,
      apiKey,
    });
    promoJobInFlight = job;

    try {
      const asset = await job;
      const assets = await listPromoAssets();
      res.json({ ok: true, asset, assets });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Promo generate error:", msg);
      res.status(502).json({ error: "تعذر إنتاج الفيديو حالياً. حاول مرة أخرى.", detail: msg });
    } finally {
      if (promoJobInFlight === job) promoJobInFlight = null;
    }
  });

  app.get("/api/admin/promo-file/:name", (req, res) => {
    if (!verifyAdminTokenFromReq(req)) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const fileName = String(req.params.name || "");
    const fullPath = resolvePromoFilePath(fileName);
    if (!fullPath) {
      res.status(404).json({ error: "الملف غير موجود" });
      return;
    }
    if (req.query.download === "1") {
      res.download(fullPath, path.basename(fullPath));
      return;
    }
    res.sendFile(fullPath);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    const distIndexPath = path.join(distDir, "index.html");
    const cachedIndexHtml = fs.existsSync(distIndexPath)
      ? fs.readFileSync(distIndexPath, "utf8")
      : "";

    if (fs.existsSync(distDir)) {
      app.use(
        "/assets",
        express.static(path.join(distDir, "assets"), {
          maxAge: "365d",
          immutable: true,
        })
      );
      app.use(
        express.static(distDir, {
          index: false,
          setHeaders(res, filePath) {
            if (filePath.endsWith("manifest.webmanifest")) {
              res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
              res.setHeader("Cache-Control", "no-cache");
            } else if (
              filePath.endsWith("sw.js") ||
              filePath.endsWith("index.html")
            ) {
              res.setHeader("Cache-Control", "no-cache");
            }
          },
        })
      );
      app.get("*", (req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        if (!cachedIndexHtml) {
          res.sendFile(distIndexPath);
          return;
        }
        const envOrigin = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
        const rawProto = String(req.headers["x-forwarded-proto"] || req.protocol || "https")
          .split(",")[0]
          .trim()
          .toLowerCase();
        const proto = rawProto === "http" ? "http" : "https";
        const rawHost = String(req.headers["x-forwarded-host"] || req.get("host") || "")
          .split(",")[0]
          .trim()
          .replace(/[^A-Za-z0-9.:-]/g, "");
        const origin = envOrigin || (rawHost ? `${proto}://${rawHost}` : "");
        if (!origin) {
          res.type("html").send(cachedIndexHtml);
          return;
        }
        const resolvedHtml = cachedIndexHtml
          .replace("<!--CANONICAL_LINK-->", `<link rel="canonical" href="${origin}/" />`)
          .replace('<meta property="og:url" content="/" />', `<meta property="og:url" content="${origin}/" />`)
          .replace('<meta property="og:image" content="/og-share.png" />', `<meta property="og:image" content="${origin}/og-share.png" />`)
          .replace('<meta name="twitter:image" content="/og-share.png" />', `<meta name="twitter:image" content="${origin}/og-share.png" />`);
        res.type("html").send(resolvedHtml);
      });
    }
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sallahli server running on http://0.0.0.0:${PORT}`);
  });

  function shutdown() {
    server.close(async () => {
      await Promise.allSettled([...fileLocks.values()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
