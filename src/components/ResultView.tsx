import { useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Lock,
  MessageCircleQuestion,
  MessageSquareQuote,
  RotateCcw,
  Scale,
  Send,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingDown,
  Wallet,
  Wrench,
} from "lucide-react";
import { API_TIMEOUTS } from "../constants";
import type {
  CaseStatus,
  DangerLevel,
  FollowUpItem,
  HistoryEntry,
  QuoteCheckResult,
  QuoteVerdict,
} from "../types";
import {
  buildWhatsAppShareUrl,
  copyTextToClipboard,
  formatArabicDate,
  formatNum,
  formatRangeNew,
  formatRangeOld,
  getCategory,
} from "../utils/format";
import { fetchWithTimeout } from "../utils/network";
import { CategoryIcon } from "./CategoryIcon";

interface ResultViewProps {
  entry: HistoryEntry;
  deviceId: number;
  entitlementToken?: string;
  isPro: boolean;
  hasActivePlan: boolean;
  onUpdateEntry: (entryId: number, updater: (prev: HistoryEntry) => HistoryEntry) => void;
  onNewCheck: () => void;
  onOpenPlans: () => void;
  onToast: (msg: string) => void;
}

const STATUS_OPTIONS: Array<{ id: CaseStatus; label: string }> = [
  { id: "new", label: "جديد" },
  { id: "in_progress", label: "جاري الفحص" },
  { id: "waiting_tech", label: "بانتظار الفني" },
  { id: "resolved", label: "تم الإصلاح" },
];

function DangerIndicator({ level }: { level: DangerLevel }) {
  if (level === "مرتفع") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 text-white text-xs sm:text-sm font-extrabold">
        <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>خطورة مرتفعة</span>
      </span>
    );
  }
  if (level === "منخفض") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs sm:text-sm font-extrabold">
        <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>خطورة منخفضة</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 text-white text-xs sm:text-sm font-extrabold">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>خطورة متوسطة</span>
    </span>
  );
}

const QUICK_FOLLOWUPS = [
  "جرّبت الخطوات وما اشتغل، ما الخطوة التالية؟",
  "هل القطعة التجارية تنفع أم لازم أصلية؟",
  "هل آمن استخدام الجهاز مؤقتاً حتى الإصلاح؟",
];

function normalizeDigitsInput(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d]/g, "");
}

function VerdictBadge({ verdict }: { verdict: QuoteVerdict }) {
  if (verdict === "عادل") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-extrabold">
        <BadgeCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>سعر عادل</span>
      </span>
    );
  }
  if (verdict === "مرتفع نسبياً") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-extrabold">
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>مرتفع نسبياً (قابل للتفاوض)</span>
      </span>
    );
  }
  if (verdict === "مبالغ فيه") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-extrabold">
        <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>مبالغ فيه جداً</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-700 text-white text-xs font-extrabold">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>أقل من المعتاد — تحقق من الجودة</span>
    </span>
  );
}

export function ResultView({
  entry,
  deviceId,
  entitlementToken,
  isPro,
  hasActivePlan,
  onUpdateEntry,
  onNewCheck,
  onOpenPlans,
  onToast,
}: ResultViewProps) {
  const { res, cat, ts } = entry;
  const category = getCategory(cat);
  const totalRange = {
    min: res.parts_cost_mru.min + res.labor_cost_mru.min,
    max: res.parts_cost_mru.max + res.labor_cost_mru.max,
  };

  // Technician Quote Verifier state
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteUnit, setQuoteUnit] = useState<"new" | "old">("new");
  const [quoteClaim, setQuoteClaim] = useState("");
  const [checkingQuote, setCheckingQuote] = useState(false);

  // Follow-up Q&A state
  const [followUpInput, setFollowUpInput] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);

  // Smart tracking actual cost input state
  const [paidInput, setPaidInput] = useState("");
  const [paidUnit, setPaidUnit] = useState<"new" | "old">("new");

  const currentStatus: CaseStatus = entry.status || "new";
  const completedSteps = entry.completedSteps || [];
  const quoteChecks = entry.quoteChecks || [];
  const followUps = entry.followUps || [];
  const quoteLocked = !hasActivePlan && quoteChecks.length >= 1;
  const followUpLocked = !hasActivePlan && followUps.length >= 1;

  const rawQuoteNum = Number(normalizeDigitsInput(quoteAmount)) || 0;
  const normalizedQuoteNewMru =
    quoteUnit === "old" ? Math.round(rawQuoteNum / 10) : rawQuoteNum;

  const rawPaidNum = Number(normalizeDigitsInput(paidInput)) || 0;
  const normalizedPaidNewMru =
    paidUnit === "old" ? Math.round(rawPaidNum / 10) : rawPaidNum;

  const latestQuote = quoteChecks[0];
  const savedAmount =
    entry.actualPaidMru !== undefined &&
    latestQuote &&
    latestQuote.quotedMru > entry.actualPaidMru
      ? latestQuote.quotedMru - entry.actualPaidMru
      : 0;

  const activeSuggestions =
    followUps.length > 0 &&
    followUps[followUps.length - 1].suggested_followups &&
    followUps[followUps.length - 1].suggested_followups!.length > 0
      ? followUps[followUps.length - 1].suggested_followups!
      : QUICK_FOLLOWUPS;

  function handleStatusChange(nextStatus: CaseStatus) {
    onUpdateEntry(entry.id, (prev) => ({
      ...prev,
      status: nextStatus,
    }));
    const label = STATUS_OPTIONS.find((s) => s.id === nextStatus)?.label || nextStatus;
    onToast(`تم تحديث حالة العطل إلى: ${label}`);
  }

  function handleToggleStep(stepIndex: number) {
    onUpdateEntry(entry.id, (prev) => {
      const existing = prev.completedSteps || [];
      const isChecked = existing.includes(stepIndex);
      const nextSteps = isChecked
        ? existing.filter((i) => i !== stepIndex)
        : [...existing, stepIndex].sort((a, b) => a - b);
      const prevStatus = prev.status || "new";
      const nextStatus: CaseStatus =
        !isChecked && prevStatus === "new" ? "in_progress" : prevStatus;
      return {
        ...prev,
        completedSteps: nextSteps,
        status: nextStatus,
      };
    });
  }

  function handleSaveActualPaid(e: React.FormEvent) {
    e.preventDefault();
    if (rawPaidNum <= 0 && paidInput.trim() === "") {
      onUpdateEntry(entry.id, (prev) => ({
        ...prev,
        actualPaidMru: undefined,
      }));
      onToast("تم مسح التكلفة الفعلية");
      return;
    }
    onUpdateEntry(entry.id, (prev) => ({
      ...prev,
      status: "resolved",
      actualPaidMru: normalizedPaidNewMru,
    }));
    setPaidInput("");
    onToast("تم حفظ التكلفة الفعلية للإصلاح");
  }

  async function handleCopyPhrase() {
    const ok = await copyTextToClipboard(res.technician_phrase);
    onToast(ok ? "تم نسخ الجملة بنجاح" : "تعذّر النسخ");
  }

  const whatsAppShareUrl = buildWhatsAppShareUrl(entry);

  async function handleCheckQuoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quoteLocked) {
      onToast("اشترك في باقة لتدقيق تسعيرات غير محدود");
      onOpenPlans();
      return;
    }
    if (normalizedQuoteNewMru <= 0) {
      onToast("أدخل المبلغ الذي طلبه الفني بالأرقام");
      return;
    }

    setCheckingQuote(true);
    try {
      const response = await fetchWithTimeout(
        "/api/check-quote",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": String(deviceId),
            ...(entitlementToken ? { "x-entitlement-token": entitlementToken } : {}),
          },
          body: JSON.stringify({
            catName: category.name,
            diagnosis: res.diagnosis,
            quotedMru: normalizedQuoteNewMru,
            claim: quoteClaim.trim(),
            partsRange: res.parts_cost_mru,
            laborRange: res.labor_cost_mru,
          }),
        },
        API_TIMEOUTS.quote
      );
      const payload = (await response.json()) as Omit<
        QuoteCheckResult,
        "id" | "ts" | "quotedMru" | "claim"
      > & {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        if (response.status === 402 || payload.code === "QUOTA_EXCEEDED") {
          onToast(payload.error || "انتهت المحاولات المجانية، فعّل باقة للمتابعة");
          onOpenPlans();
          return;
        }
        throw new Error(payload.error || "تعذر تدقيق التسعيرة");
      }

      const item: QuoteCheckResult = {
        id: Date.now(),
        ts: Date.now(),
        quotedMru: normalizedQuoteNewMru,
        claim: quoteClaim.trim(),
        verdict: payload.verdict,
        fair_total_mru: payload.fair_total_mru,
        difference_note: payload.difference_note,
        negotiation_script: payload.negotiation_script,
        warning_signs: payload.warning_signs || [],
      };

      onUpdateEntry(entry.id, (prev) => ({
        ...prev,
        status: prev.status === "resolved" ? "resolved" : "waiting_tech",
        quoteChecks: [item, ...(prev.quoteChecks || [])].slice(0, 10),
      }));
      setQuoteAmount("");
      setQuoteClaim("");
      onToast("تم تدقيق تسعيرة الفني");
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : "تعذر تدقيق التسعيرة");
    } finally {
      setCheckingQuote(false);
    }
  }

  async function submitFollowUp(questionText: string) {
    const trimmed = questionText.trim();
    if (followUpLocked) {
      onToast("اشترك في باقة لطرح أسئلة متابعة غير محدودة");
      onOpenPlans();
      return;
    }
    if (!trimmed) {
      onToast("اكتب سؤالك أولاً");
      return;
    }

    const completedStepTexts = res.diy_steps.filter((_, idx) =>
      completedSteps.includes(idx)
    );
    const quoteSummary = latestQuote
      ? `طلب الفني ${latestQuote.quotedMru} أوقية جديدة (${latestQuote.verdict}${
          latestQuote.claim ? ` - ${latestQuote.claim}` : ""
        })`
      : "";

    setAskingFollowUp(true);
    try {
      const response = await fetchWithTimeout(
        "/api/follow-up",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": String(deviceId),
            ...(entitlementToken ? { "x-entitlement-token": entitlementToken } : {}),
          },
          body: JSON.stringify({
            catName: category.name,
            problemText: entry.text,
            diagnosis: res.diagnosis,
            diySteps: res.diy_steps,
            completedSteps: completedStepTexts,
            quoteSummary,
            history: followUps.map((f) => ({ question: f.question, answer: f.answer })),
            question: trimmed,
          }),
        },
        API_TIMEOUTS.followup
      );
      const payload = (await response.json()) as {
        answer?: string;
        next_action?: string;
        suggested_followups?: string[];
        error?: string;
        code?: string;
      };
      if (!response.ok || !payload.answer) {
        if (response.status === 402 || payload.code === "QUOTA_EXCEEDED") {
          onToast(payload.error || "انتهت المحاولات المجانية، فعّل باقة للمتابعة");
          onOpenPlans();
          return;
        }
        throw new Error(payload.error || "تعذرت الإجابة على المتابعة");
      }

      const item: FollowUpItem = {
        id: Date.now(),
        ts: Date.now(),
        question: trimmed,
        answer: payload.answer,
        next_action: payload.next_action || "",
        suggested_followups: Array.isArray(payload.suggested_followups)
          ? payload.suggested_followups.slice(0, 3)
          : [],
      };

      onUpdateEntry(entry.id, (prev) => ({
        ...prev,
        status: !prev.status || prev.status === "new" ? "in_progress" : prev.status,
        followUps: [...(prev.followUps || []), item].slice(-15),
      }));
      setFollowUpInput("");
    } catch (err: unknown) {
      onToast(err instanceof Error ? err.message : "تعذرت الإجابة على المتابعة");
    } finally {
      setAskingFollowUp(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="animate-card-enter flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <CategoryIcon id={cat} className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              {category.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تقرير الفحص · {formatArabicDate(ts)}
            </p>
          </div>
        </div>
        <DangerIndicator level={res.danger_level} />
      </div>

      {/* Smart Case Lifecycle Tracker */}
      <section className="animate-card-enter stagger-1 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Clock className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
            <h2 className="text-sm sm:text-base font-extrabold">التتبع الذكي للحالة</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {res.diy_steps.length > 0 && (
              <span>
                الخطوات: <strong className="text-slate-900 dark:text-white">{completedSteps.length}/{res.diy_steps.length}</strong>
              </span>
            )}
            {quoteChecks.length > 0 && (
              <span>
                تدقيقات السعر: <strong className="text-slate-900 dark:text-white">{quoteChecks.length}</strong>
              </span>
            )}
            {followUps.length > 0 && (
              <span>
                المتابعات: <strong className="text-slate-900 dark:text-white">{followUps.length}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800">
          {STATUS_OPTIONS.map((opt) => {
            const active = currentStatus === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleStatusChange(opt.id)}
                className={`min-h-[38px] px-2 rounded-lg text-xs font-extrabold transition-all duration-300 active:scale-[0.98] cursor-pointer ${
                  active
                    ? opt.id === "resolved"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white dark:bg-[#131D31] text-orange-600 dark:text-orange-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {currentStatus === "resolved" && (
          <div className="animate-card-enter rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-3.5 space-y-2.5">
            {entry.actualPaidMru !== undefined ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs sm:text-sm text-emerald-950 dark:text-emerald-100 space-y-0.5">
                  <div>
                    <strong>التكلفة الفعلية المسجلة: </strong>
                    <span className="font-mono-num font-extrabold">
                      {formatNum(entry.actualPaidMru)} أوقية جديدة
                    </span>{" "}
                    <span className="text-xs opacity-80">
                      ({formatNum(entry.actualPaidMru * 10)} قديمة)
                    </span>
                  </div>
                  {savedAmount > 0 && (
                    <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                      <TrendingDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>
                        وفّرت {formatNum(savedAmount)} أوقية جديدة ({formatNum(savedAmount * 10)} قديمة) عن تسعيرة الفني الأولى!
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateEntry(entry.id, (prev) => ({
                      ...prev,
                      actualPaidMru: undefined,
                    }))
                  }
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                >
                  تعديل المبلغ
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveActualPaid} className="space-y-2">
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  سجّل المبلغ الفعلي الذي دفعته (أو 0 إذا أصلحته بنفسك مجاناً) لحساب التوفير في سجلك:
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={paidInput}
                    onChange={(e) => setPaidInput(normalizeDigitsInput(e.target.value))}
                    placeholder={paidUnit === "new" ? "المبلغ بالجديدة" : "المبلغ بالقديمة"}
                    className="flex-1 min-h-[40px] rounded-lg bg-white dark:bg-[#0B1220] border border-emerald-300 dark:border-emerald-800 px-3 text-center font-mono-num text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white dark:bg-[#0B1220] border border-emerald-200 dark:border-emerald-800">
                    <button
                      type="button"
                      onClick={() => setPaidUnit("new")}
                      className={`px-2.5 min-h-[32px] rounded text-xs font-bold cursor-pointer ${
                        paidUnit === "new"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      جديدة
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaidUnit("old")}
                      className={`px-2.5 min-h-[32px] rounded text-xs font-bold cursor-pointer ${
                        paidUnit === "old"
                          ? "bg-emerald-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      قديمة
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer"
                  >
                    حفظ في السجل
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </section>

      {res.danger_level === "مرتفع" && (
        <div className="animate-card-enter stagger-1 rounded-2xl bg-red-50/90 dark:bg-red-950/40 border border-red-300 dark:border-red-800 p-4 flex items-start gap-3 text-red-900 dark:text-red-200">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <strong className="font-extrabold">تنبيه سلامة عاجل:</strong> مستوى الخطورة مرتفع ويتطلب فنياً مختصاً فوراً. أوقف تشغيل الجهاز أو افصل المصدر الكهربائي/الغاز ولا تجرّب الإصلاح بنفسك.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <section className="animate-card-enter stagger-2 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Stethoscope className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-extrabold">التشخيص الدقيق</h2>
            </div>
            {res.confidence_level && (
              <span
                className={`text-xs font-extrabold px-2.5 py-1 rounded-lg ${
                  res.confidence_level === "عالية"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : res.confidence_level === "متوسطة"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                }`}
              >
                ثقة التشخيص: {res.confidence_level}
              </span>
            )}
          </div>

          {res.visual_observation && (
            <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700/80 px-3.5 py-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong className="text-slate-900 dark:text-white">الملاحظة من المرفق: </strong>
              {res.visual_observation}
            </div>
          )}

          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
            {res.diagnosis}
          </p>

          {res.confidence_note && (
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              <strong className="text-slate-700 dark:text-slate-200">حدود الفحص: </strong>
              {res.confidence_note}
            </p>
          )}

          {res.probable_causes && res.probable_causes.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-white">
                الأسباب المحتملة مرتبة منطقياً:
              </h3>
              <ul className="space-y-2">
                {res.probable_causes.map((item, idx) => (
                  <li
                    key={idx}
                    className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-3 space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white">
                        {idx + 1}. {item.cause}
                      </span>
                      <span
                        className={`shrink-0 font-bold ${
                          item.likelihood === "أرجح"
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {item.likelihood}
                      </span>
                    </div>
                    {item.check_hint && (
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        <strong className="text-slate-800 dark:text-slate-200">كيف تتأكد: </strong>
                        {item.check_hint}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="animate-card-enter stagger-2 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Wallet className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-extrabold">التكلفة العادلة في موريتانيا</h2>
          </div>

          <div className="divide-y divide-dashed divide-slate-200 dark:divide-slate-700 text-sm">
            <div className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300 font-semibold">قطع الغيار</span>
              <div className="text-left tabular-nums">
                <div className="font-bold text-slate-900 dark:text-white">{formatRangeNew(res.parts_cost_mru)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">({formatRangeOld(res.parts_cost_mru)})</div>
              </div>
            </div>

            <div className="py-2.5 flex items-center justify-between gap-3">
              <span className="text-slate-600 dark:text-slate-300 font-semibold">أجرة الفني</span>
              <div className="text-left tabular-nums">
                <div className="font-bold text-slate-900 dark:text-white">{formatRangeNew(res.labor_cost_mru)}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">({formatRangeOld(res.labor_cost_mru)})</div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between gap-3">
              <span className="font-extrabold text-slate-900 dark:text-white">المجموع التقريبي</span>
              <div className="text-left tabular-nums">
                <div className="text-base font-extrabold text-orange-600 dark:text-orange-400">
                  {formatRangeNew(totalRange)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">({formatRangeOld(totalRange)})</div>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            أرقام تقديرية حسب السوق الموريتاني وتختلف بحسب المدينة ونوع القطعة.
          </p>
        </section>

        <section className="animate-card-enter stagger-3 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Wrench className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-extrabold">هل يمكنك إصلاحه بنفسك؟</h2>
            </div>
            {res.diy_steps.length > 0 && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                تمت تجربة {completedSteps.length} من {res.diy_steps.length}
              </span>
            )}
          </div>

          {res.diy_steps.length > 0 ? (
            <ul className="space-y-2 text-sm sm:text-base">
              {res.diy_steps.map((step, idx) => {
                const checked = completedSteps.includes(idx);
                return (
                  <li key={idx}>
                    <button
                      type="button"
                      onClick={() => handleToggleStep(idx)}
                      className={`w-full text-right rounded-xl border p-3 flex items-start gap-3 transition-all duration-300 ease-out active:scale-[0.99] cursor-pointer ${
                        checked
                          ? "bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-800 text-slate-500 dark:text-slate-400"
                          : "bg-slate-50/70 dark:bg-[#0B1220] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-orange-500/50"
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5 transition-colors duration-300 ${
                          checked
                            ? "bg-emerald-600 text-white"
                            : "bg-orange-500/15 text-orange-700 dark:text-orange-300"
                        }`}
                      >
                        {checked ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : idx + 1}
                      </span>
                      <span className={`leading-relaxed flex-1 transition-colors duration-300 ${checked ? "line-through" : ""}`}>
                        {step}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">يُفضَّل استدعاء فني مختص لهذه الحالة.</p>
          )}
        </section>

        <section className="animate-card-enter stagger-3 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <MessageSquareQuote className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-extrabold">ماذا تقول للفني؟</h2>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 p-4 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
              {res.technician_phrase}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleCopyPhrase}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              <span>نسخ الجملة</span>
            </button>
          </div>
        </section>
      </div>

      {isPro ? (
        <section className="animate-card-enter stagger-4 bg-white dark:bg-[#131D31] border border-orange-500/60 rounded-2xl p-5 space-y-2.5 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <ShieldCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-extrabold">الفحص العميق وتنبيهات الوقاية</h2>
          </div>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
            {res.pro_advice}
          </p>
        </section>
      ) : (
        <section className="animate-card-enter stagger-4 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-900 dark:text-white">
              <Lock className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-extrabold">الفحص العميق وتنبيهات الوقاية</h2>
            </div>
            <span className="text-xs font-bold text-orange-600 dark:text-orange-400">ميزة احترافية</span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 blur-[4px] select-none" aria-hidden="true">
            نصيحة احترافية عميقة حول جودة قطع الغيار الأفضل في السوق الموريتاني وكيفية منع تكرار العطل مستقبلاً وحماية أجهزتك.
          </p>
          <button
            type="button"
            onClick={onOpenPlans}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all duration-300 active:scale-[0.985] cursor-pointer"
          >
            <span>افتحها بالباقة الاحترافية أو السنوية</span>
          </button>
        </section>
      )}

      {/* 1. Technician Quote Auditor */}
      <section className="animate-card-enter stagger-4 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <Scale className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-extrabold">مدقق تسعيرة الفني</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                أدخل المبلغ الذي طلبه منك الفني لنخبرك فوراً هل السعر عادل أم مبالغ فيه في السوق الموريتاني.
              </p>
            </div>
          </div>
          {!hasActivePlan && (
            <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
              تجربة مجانية واحدة · غير محدود بالباقات
            </span>
          )}
        </div>

        {quoteLocked ? (
          <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
              استخدمت الفحص المجاني لتسعيرة الفني في هذا التقرير. فعّل باقة (ابتداءً من 100 أوقية) لتدقيق كل تسعيرات الفنيين بلا حدود.
            </p>
            <button
              type="button"
              onClick={onOpenPlans}
              className="min-h-[42px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer"
            >
              ترقية الباقة
            </button>
          </div>
        ) : (
          <form onSubmit={handleCheckQuoteSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-5">
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(normalizeDigitsInput(e.target.value))}
                  placeholder={quoteUnit === "new" ? "المبلغ بالأوقية الجديدة" : "المبلغ بالأوقية القديمة"}
                  aria-label="المبلغ الذي طلبه الفني"
                  className="w-full min-h-[46px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3.5 text-center font-mono-num text-base font-bold text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="sm:col-span-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setQuoteUnit("new")}
                  className={`min-h-[38px] rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                    quoteUnit === "new"
                      ? "bg-white dark:bg-[#131D31] text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  أوقية جديدة
                </button>
                <button
                  type="button"
                  onClick={() => setQuoteUnit("old")}
                  className={`min-h-[38px] rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                    quoteUnit === "old"
                      ? "bg-white dark:bg-[#131D31] text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  قديمة (×10)
                </button>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={checkingQuote}
                  className="w-full min-h-[46px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-xs sm:text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer"
                >
                  {checkingQuote ? "جاري التدقيق..." : "افحص السعر"}
                </button>
              </div>
            </div>

            {rawQuoteNum > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                المبلغ المدخل يعادل{" "}
                <strong className="text-slate-900 dark:text-white">
                  {formatNum(normalizedQuoteNewMru)} أوقية جديدة
                </strong>{" "}
                ({formatNum(normalizedQuoteNewMru * 10)} قديمة)
              </p>
            )}

            <input
              type="text"
              maxLength={300}
              value={quoteClaim}
              onChange={(e) => setQuoteClaim(e.target.value)}
              placeholder="اختياري: ماذا قال الفني أنه سيغيّر؟ (مثال: قال الكمبريسور محروق)"
              className="w-full min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3.5 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-500"
            />
          </form>
        )}

        {quoteChecks.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            {quoteChecks.map((qc) => (
              <div
                key={qc.id}
                className="animate-card-enter rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <VerdictBadge verdict={qc.verdict} />
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    سعر الفني: {formatNum(qc.quotedMru)} أوقية جديدة ({formatNum(qc.quotedMru * 10)} قديمة)
                  </span>
                </div>

                {qc.claim && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    قول الفني: «{qc.claim}»
                  </p>
                )}

                <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-1">
                  <p>
                    <strong className="text-slate-900 dark:text-white">السعر العادل المقدر: </strong>
                    <span className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                      {formatRangeNew(qc.fair_total_mru)}
                    </span>{" "}
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      ({formatRangeOld(qc.fair_total_mru)})
                    </span>
                  </p>
                  <p>{qc.difference_note}</p>
                </div>

                <div className="rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                      رد جاهز للتفاوض مع الفني:
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyTextToClipboard(qc.negotiation_script);
                        onToast(ok ? "تم نسخ جملة التفاوض" : "تعذّر النسخ");
                      }}
                      className="text-xs font-bold text-orange-600 dark:text-orange-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>نسخ</span>
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                    {qc.negotiation_script}
                  </p>
                </div>

                {qc.warning_signs.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {qc.warning_signs.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Interactive Smart Follow-Up within the same diagnosis */}
      <section className="animate-card-enter stagger-5 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <MessageCircleQuestion className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-extrabold">المتابعة الذكية داخل نفس الفحص</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يتابع الخبير معك خطوة بخطوة ويتذكّر الخطوات التي جرّبتها وما قاله الفني.
              </p>
            </div>
          </div>
          {!hasActivePlan && (
            <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
              سؤال مجاني واحد · غير محدود بالباقات
            </span>
          )}
        </div>

        {followUps.length > 0 && (
          <div className="space-y-3">
            {followUps.map((item) => (
              <div
                key={item.id}
                className="animate-card-enter rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-2.5"
              >
                <div className="text-xs sm:text-sm font-extrabold text-orange-600 dark:text-orange-400">
                  سؤالك: {item.question}
                </div>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {item.answer}
                </p>
                {item.next_action && (
                  <div className="rounded-lg bg-white dark:bg-[#131D31] border border-emerald-500/30 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    الخطوة التالية: {item.next_action}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {followUpLocked ? (
          <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
              استخدمت سؤال المتابعة المجاني لهذا الفحص. اشترك في أي باقة (ابتداءً من 100 أوقية) لطرح أسئلة متابعة غير محدودة.
            </p>
            <button
              type="button"
              onClick={onOpenPlans}
              className="min-h-[42px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold whitespace-nowrap cursor-pointer"
            >
              عرض الباقات
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-orange-500 shrink-0" aria-hidden="true" />
              <span>{followUps.length > 0 ? "أسئلة مقترحة للمرحلة التالية:" : "أسئلة سريعة شائعة:"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeSuggestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={askingFollowUp}
                  onClick={() => submitFollowUp(q)}
                  className="text-right text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitFollowUp(followUpInput);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                maxLength={500}
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder="اكتب سؤال المتابعة هنا..."
                className="flex-1 min-h-[46px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={askingFollowUp}
                className="min-h-[46px] px-5 rounded-xl bg-slate-900 dark:bg-orange-500 hover:bg-slate-800 dark:hover:bg-orange-600 disabled:opacity-55 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{askingFollowUp ? "جاري الرد..." : "اسأل الخبير"}</span>
              </button>
            </form>
          </div>
        )}
      </section>

      <div className="animate-card-enter stagger-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <a
          href={whatsAppShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[48px] px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.985]"
        >
          <Share2 className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>مشاركة النتيجة عبر واتساب</span>
        </a>

        <button
          type="button"
          onClick={onNewCheck}
          className="min-h-[48px] px-5 py-3 rounded-2xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-white text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ease-out hover:-translate-y-0.5 active:scale-[0.985] cursor-pointer"
        >
          <RotateCcw className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>فحص عطل جديد</span>
        </button>
      </div>
    </div>
  );
}
