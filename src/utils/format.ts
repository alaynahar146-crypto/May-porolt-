import { CATEGORIES } from "../constants";
import type { CategoryId, CostRange, HistoryEntry } from "../types";

export function formatNum(n: number): string {
  return Number(n).toLocaleString("en-US");
}

export function formatRangeNew(range: CostRange): string {
  if (range.min === range.max) {
    return `${formatNum(range.min)} أوقية جديدة`;
  }
  return `${formatNum(range.min)} – ${formatNum(range.max)} أوقية جديدة`;
}

export function formatRangeOld(range: CostRange): string {
  if (range.min === range.max) {
    return `${formatNum(range.min * 10)} قديمة`;
  }
  return `${formatNum(range.min * 10)} – ${formatNum(range.max * 10)} قديمة`;
}

export function getCategory(id: CategoryId) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[3];
}

export function formatArabicDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildWhatsAppShareText(entry: HistoryEntry): string {
  const cat = getCategory(entry.cat);
  const r = entry.res;
  return [
    `تشخيص من تطبيق صلاح لي – ${cat.name}`,
    "",
    `التشخيص: ${r.diagnosis}`,
    "",
    `الخطورة: ${r.danger_level}`,
    `قطع الغيار: ${r.parts_cost_mru.min} – ${r.parts_cost_mru.max} أوقية جديدة (${r.parts_cost_mru.min * 10} – ${r.parts_cost_mru.max * 10} قديمة)`,
    `أجرة الفني: ${r.labor_cost_mru.min} – ${r.labor_cost_mru.max} أوقية جديدة (${r.labor_cost_mru.min * 10} – ${r.labor_cost_mru.max * 10} قديمة)`,
    "",
    `ما أقوله للفني: ${r.technician_phrase}`,
  ].join("\n");
}

export function buildWhatsAppShareUrl(entry: HistoryEntry): string {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppShareText(entry))}`;
}

export function buildAdminWhatsAppMessage(
  deviceId: number,
  planName: string,
  priceMru: number,
  payNumber: string
): string {
  return `السلام عليكم، أريد تفعيل باقة «${planName}» بسعر ${priceMru} أوقية جديدة. تم التحويل إلى الرقم ${payNumber}، ورقم جهازي الخاص هو: ${deviceId}، أرجو إرسال كود التفعيل.`;
}

export function buildAdminWhatsAppUrl(
  waNumber: string,
  deviceId: number,
  planName: string,
  priceMru: number,
  payNumber: string
): string {
  const msg = buildAdminWhatsAppMessage(deviceId, planName, priceMru, payNumber);
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
