import { useRef, useState } from "react";
import { AlertTriangle, BookOpen, CalendarClock, Check, CheckCircle2, Copy, Crown, KeyRound, MessageCircle, ShieldCheck, Smartphone, Wrench, X, Zap } from "lucide-react";
import {
  API_TIMEOUTS,
  FREE_LIMIT,
  PAYMENT_PROVIDERS,
  PAY_NUMBER,
  PLANS,
  PLAN_FEATURES,
  WA_NUMBER,
} from "../constants";
import type { ActivePlan, PlanDefinition, PlanId } from "../types";
import { extractActivationCode, getUsedCodes, markCodeAsUsed, normalizeCode } from "../utils/activation";
import {
  buildAdminWhatsAppMessage,
  buildAdminWhatsAppUrl,
  copyTextToClipboard,
  formatArabicDate,
  formatNum,
} from "../utils/format";
import { fetchWithTimeout } from "../utils/network";

interface PlansViewProps {
  deviceId: number;
  activePlan: ActivePlan | null;
  usedFree: number;
  onActivatePlan: (planId: PlanId, days: number, planName: string, exp?: number, token?: string) => void;
  onToast: (msg: string) => void;
}

function PlanIcon({ id }: { id: PlanId }) {
  if (id === "year") return <Crown className="w-6 h-6 text-orange-400 shrink-0" aria-hidden="true" />;
  if (id === "pro") return <Zap className="w-6 h-6 text-orange-500 shrink-0" aria-hidden="true" />;
  return <Wrench className="w-6 h-6 text-orange-500 shrink-0" aria-hidden="true" />;
}

export function PlansView({
  deviceId,
  activePlan,
  usedFree,
  onActivatePlan,
  onToast,
}: PlansViewProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>("year");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const paymentRef = useRef<HTMLDivElement>(null);

  const selectedPlan: PlanDefinition = PLANS.find((p) => p.id === selectedPlanId) || PLANS[2];
  const remainingFree = Math.max(0, FREE_LIMIT - usedFree);
  const currentActiveDef = activePlan ? PLANS.find((p) => p.id === activePlan.id) : null;

  function handleSelectPlan(planId: PlanId) {
    setSelectedPlanId(planId);
    paymentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleCopyPayNumber() {
    const ok = await copyTextToClipboard(PAY_NUMBER);
    onToast(ok ? `تم نسخ رقم الدفع ${PAY_NUMBER}` : "تعذّر النسخ");
  }

  async function handleCopyDeviceId() {
    const ok = await copyTextToClipboard(String(deviceId));
    onToast(ok ? `تم نسخ رقم الجهاز ${deviceId}` : "تعذّر النسخ");
  }

  const waReceiptUrl = buildAdminWhatsAppUrl(
    WA_NUMBER,
    deviceId,
    selectedPlan.name,
    selectedPlan.priceMru,
    PAY_NUMBER
  );

  function logSubscriptionRequest() {
    const payload = JSON.stringify({
      deviceId,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      priceMru: selectedPlan.priceMru,
    });
    const beaconSent =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(
        "/api/subscription-requests",
        new Blob([payload], { type: "application/json" })
      );
    if (!beaconSent) {
      fetch("/api/subscription-requests", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    }
  }

  async function handleCopyReceiptMessage() {
    logSubscriptionRequest();
    const msg = buildAdminWhatsAppMessage(
      deviceId,
      selectedPlan.name,
      selectedPlan.priceMru,
      PAY_NUMBER
    );
    const ok = await copyTextToClipboard(msg);
    onToast(ok ? `تم نسخ رسالة الطلب لإرسالها إلى ${PAY_NUMBER} عبر واتساب` : "تعذّر النسخ");
  }

  const [activating, setActivating] = useState(false);

  async function handleActivateSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizeCode(codeInput);
    if (!normalized) {
      setCodeError("يرجى إدخال كود التفعيل");
      return;
    }

    if (getUsedCodes().includes(normalized)) {
      setCodeError("عذراً، هذا الكود تم استخدامه مسبقاً وهو صالح لمرة واحدة فقط");
      return;
    }

    setActivating(true);
    setCodeError("");
    try {
      const res = await fetchWithTimeout(
        "/api/activate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: normalized, deviceId }),
        },
        API_TIMEOUTS.activate
      );
      const data = (await res.json()) as {
        ok?: boolean;
        planId?: PlanId;
        days?: number;
        exp?: number;
        entitlementToken?: string;
        normalizedCode?: string;
        singleUse?: boolean;
        error?: string;
      };

      if (res.ok && data.ok && data.planId && data.normalizedCode) {
        const plan = PLANS.find((p) => p.id === data.planId);
        if (!plan) return;
        if (data.singleUse !== false) {
          markCodeAsUsed(data.normalizedCode);
        }
        setCodeError("");
        setCodeInput("");
        onActivatePlan(
          plan.id,
          data.days || plan.days,
          plan.name,
          data.exp,
          data.entitlementToken
        );
        return;
      }

      setCodeError(data.error || "هذا الكود غير صالح لهذا الجهاز");
    } catch (err: unknown) {
      setCodeError(err instanceof Error ? err.message : "تعذر التحقق من الكود حالياً، حاول مجدداً");
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="animate-card-enter bg-[#121C30] text-white rounded-2xl p-5 sm:p-6 border border-slate-800/80 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-extrabold text-balance">
            اعرف السعر العادل قبل أن تدفع للفني
          </h1>
          <p className="text-sm text-slate-300">
            باقات بأسعار رمزية في موريتانيا، تفعيل فوري بالكود الفريد المرتبط بجهازك، بدون تسجيل حساب.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyDeviceId}
            className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-sm flex items-center justify-between sm:justify-center gap-2.5 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-slate-200 font-semibold">
              <Smartphone className="w-4 h-4 text-orange-400 shrink-0" aria-hidden="true" />
              <span>
                رقم جهازك الخاص:{" "}
                <strong dir="ltr" className="font-mono-num text-orange-400 text-base tracking-wider">
                  {deviceId}
                </strong>
              </span>
            </span>
            <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          </button>

          <div className="rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-2.5 text-sm">
            {currentActiveDef && activePlan ? (
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {currentActiveDef.name} · تنتهي {formatArabicDate(activePlan.exp)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-200 font-semibold tabular-nums">
                <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0" aria-hidden="true" />
                <span>
                  المجانية: متبقي <strong className="text-orange-400">{remainingFree}</strong>/{FREE_LIMIT}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {currentActiveDef && activePlan && (() => {
        const daysLeft = Math.max(1, Math.ceil((activePlan.exp - Date.now()) / 864e5));
        const isExpiringSoon = daysLeft <= 3;
        const daysText =
          daysLeft === 1 ? "يوم واحد" : daysLeft === 2 ? "يومان" : daysLeft <= 10 ? `${daysLeft} أيام` : `${daysLeft} يوماً`;
        return (
          <div
            role="status"
            className={`rounded-2xl border p-4 flex items-start gap-3 ${
              isExpiringSoon
                ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200"
                : "bg-emerald-50 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200"
            }`}
          >
            {isExpiringSoon ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CalendarClock className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="text-sm leading-relaxed">
              <strong className="font-extrabold">
                {isExpiringSoon ? "تنبيه قرب انتهاء الاشتراك: " : "تذكير بصلاحية اشتراكك الحالي: "}
              </strong>
              باقة <strong>{currentActiveDef.name}</strong> فعالة على هذا الجهاز حتى تاريخ{" "}
              <strong className="tabular-nums">{formatArabicDate(activePlan.exp)}</strong>{" "}
              (متبقي <strong className="tabular-nums">{daysText}</strong>).
            </div>
          </div>
        );
      })()}

      <section aria-label="خطط الاشتراك" className="animate-card-enter stagger-1 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {PLANS.map((plan) => {
          const isSelected = plan.id === selectedPlanId;
          const isBest = Boolean(plan.best);

          return (
            <div
              key={plan.id}
              onClick={() => handleSelectPlan(plan.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  handleSelectPlan(plan.id);
                }
              }}
              className={`rounded-2xl p-5 flex flex-col justify-between gap-4 border transition-all duration-300 ease-out hover:-translate-y-0.5 cursor-pointer ${
                isBest
                  ? "bg-[#121C30] text-white border-orange-500/90 shadow-sm"
                  : "bg-white dark:bg-[#131D31] text-slate-900 dark:text-slate-100 border-slate-200/90 dark:border-slate-800 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20"
              } ${isSelected ? "ring-2 ring-orange-500 ring-offset-2 ring-offset-[#F6F7FA] dark:ring-offset-[#0D1524]" : ""}`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <PlanIcon id={plan.id} />
                    <div>
                      <h2 className="text-base font-extrabold">{plan.name}</h2>
                      <p className={`text-xs ${isBest ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                        {plan.subtitle}
                      </p>
                    </div>
                  </div>
                  {plan.popularLabel && (
                    <span className="text-xs font-extrabold text-orange-500 dark:text-orange-400 whitespace-nowrap">
                      {plan.popularLabel}
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 tabular-nums">
                    <span className="text-3xl font-extrabold text-orange-500 font-mono-num">
                      {plan.priceMru}
                    </span>
                    <span className={`text-xs font-semibold ${isBest ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                      أوقية جديدة ({formatNum(plan.priceMru * 10)} قديمة)
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${isBest ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                    {plan.perDayText}
                  </p>
                </div>

                {plan.saveNote && (
                  <p className="rounded-xl bg-orange-500/15 text-orange-300 px-3 py-2 text-xs font-bold leading-relaxed">
                    {plan.saveNote}
                  </p>
                )}

                <ul className="space-y-2 text-sm">
                  {PLAN_FEATURES.map((feat, idx) => {
                    const included = plan.matrix[idx];
                    return (
                      <li
                        key={feat}
                        className={`flex items-center gap-2 ${
                          included
                            ? isBest
                              ? "text-emerald-300 font-semibold"
                              : "text-slate-800 dark:text-slate-200 font-semibold"
                            : isBest
                              ? "text-slate-500 line-through"
                              : "text-slate-400 dark:text-slate-500 line-through"
                        }`}
                      >
                        {included ? (
                          <Check className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                        ) : (
                          <X className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                        )}
                        <span>{feat}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  handleSelectPlan(plan.id);
                }}
                className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl text-sm font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : isBest
                      ? "bg-slate-800 hover:bg-slate-700 text-white"
                      : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white"
                }`}
              >
                {isSelected ? "تم اختيار هذه الباقة" : `اختر باقة ${plan.priceMru} أوقية`}
              </button>
            </div>
          );
        })}
      </section>

      <section
        aria-labelledby="activation-guide-heading"
        className="animate-card-enter stagger-2 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-slate-900 dark:text-white">
            <BookOpen className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="activation-guide-heading" className="text-base sm:text-lg font-extrabold">
                كيف تحصل على كود التفعيل وتشترك في 4 خطوات؟
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                كل كود يُصنع خصيصاً لرقم جهازك ويعمل لمرة واحدة فقط لضمان أمان اشتراكك.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopyDeviceId}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500/15 border border-orange-500/30 text-orange-700 dark:text-orange-300 text-xs font-extrabold inline-flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              نسخ رقم جهازك (<span dir="ltr" className="font-mono-num">{deviceId}</span>)
            </span>
          </button>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <li className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                1
              </span>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">انسخ رقم جهازك</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اضغط على رقم جهازك الخاص{" "}
              <strong dir="ltr" className="font-mono-num text-slate-900 dark:text-white">
                {deviceId}
              </strong>{" "}
              لنسخه، أو دع التطبيق يضيفه تلقائياً في رسالة الواتساب.
            </p>
          </li>

          <li className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                2
              </span>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">حوّل المبلغ للرقم</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اختر باقتك ثم حوّل قيمتها عبر بنكيلي أو مصرفي أو السداد أو كليك أو بيم بنك إلى{" "}
              <strong dir="ltr" className="font-mono-num text-slate-900 dark:text-white">
                {PAY_NUMBER}
              </strong>
              .
            </p>
          </li>

          <li className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                3
              </span>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">أرسله عبر واتساب</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              اضغط زر <strong>«أرسل وصل الدفع عبر واتساب»</strong> وأرفق صورة الوصل؛ ستُرسل رسالتك برقم جهازك مباشرة لتستلم الكود.
            </p>
          </li>

          <li className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-orange-500 text-white font-mono-num text-xs font-extrabold flex items-center justify-center shrink-0">
                4
              </span>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">أدخل الكود المستلم</h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              انسخ الكود الذي يصلك في الرد، والصقه في خانة <strong>«إدخال كود التفعيل الفريد»</strong> بالأسفل ثم اضغط تفعيل.
            </p>
          </li>
        </ol>
      </section>

      <div ref={paymentRef} className="animate-card-enter stagger-3 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <section className="lg:col-span-5 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
            تذكير مهم قبل التفعيل
          </h2>
          <ul className="space-y-2.5 text-sm text-slate-700 dark:text-slate-200">
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0 mt-1" aria-hidden="true" />
              <span>أدخل الكود على نفس الهاتف والمتصفح الذي أرسلت منه رقم الجهاز.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0 mt-1" aria-hidden="true" />
              <span>الكود صالح للاستخدام مرة واحدة فقط ومرتبط برقَم جهازك المحدد.</span>
            </li>
          </ul>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              التطبيقات البنكية المدعومة في موريتانيا:
            </p>
            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 leading-relaxed">
              {PAYMENT_PROVIDERS.join(" · ")}
            </p>
          </div>
        </section>

        <section className="lg:col-span-7 bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                تفاصيل التحويل والدفع
              </h2>
              <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200">
                رقم جهازك الخاص:{" "}
                <strong dir="ltr" className="font-mono-num text-orange-600 dark:text-orange-400">
                  {deviceId}
                </strong>
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              الباقة المختارة: <strong className="text-slate-900 dark:text-white">{selectedPlan.name}</strong> — حوّل{" "}
              <strong className="text-orange-600 dark:text-orange-400 tabular-nums">
                {selectedPlan.priceMru} أوقية جديدة
              </strong>{" "}
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                ({formatNum(selectedPlan.priceMru * 10)} قديمة)
              </span>{" "}
              إلى رقم الدفع:
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div
              dir="ltr"
              className="flex-1 rounded-xl bg-slate-50 dark:bg-[#0B1220] border-2 border-dashed border-orange-500/80 px-4 py-3 text-center text-2xl font-extrabold font-mono-num tracking-widest text-slate-900 dark:text-white select-all"
            >
              {PAY_NUMBER}
            </div>
            <button
              type="button"
              onClick={handleCopyPayNumber}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>نسخ الرقم</span>
            </button>
          </div>

          <div className="space-y-2">
            <a
              href={waReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={logSubscriptionRequest}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 transition-all duration-300 ease-out active:scale-[0.985]"
            >
              <MessageCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>أرسل وصل الدفع عبر واتساب لاستلام الكود</span>
            </a>
            <button
              type="button"
              onClick={handleCopyReceiptMessage}
              className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>أو انسخ رسالة الطلب الجاهزة لإرسالها يدوياً إلى {PAY_NUMBER}</span>
            </button>
          </div>

          <form onSubmit={handleActivateSubmit} className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label htmlFor="activation-code" className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
              <KeyRound className="w-4 h-4 text-orange-500" aria-hidden="true" />
              <span>إدخال كود التفعيل الفريد</span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="activation-code"
                type="text"
                dir="ltr"
                autoComplete="off"
                value={codeInput}
                onChange={(e) => {
                  const val = e.target.value;
                  const next = /[\s\u0600-\u06FF]/.test(val)
                    ? extractActivationCode(val) || val
                    : val;
                  setCodeInput(next);
                  if (codeError) setCodeError("");
                }}
                placeholder="أدخل كود التفعيل هنا"
                className="flex-1 min-h-[48px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-4 text-center font-mono-num text-base font-bold tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                disabled={activating}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-sm font-extrabold whitespace-nowrap transition-colors cursor-pointer"
              >
                {activating ? "جاري التحقق..." : "تفعيل الباقة الآن"}
              </button>
            </div>
            {codeError && (
              <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                {codeError}
              </p>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ملاحظة: كود التفعيل يبدأ بحرف الباقة (مثل <span dir="ltr" className="font-mono-num font-bold">B-</span> أو <span dir="ltr" className="font-mono-num font-bold">P-</span> أو <span dir="ltr" className="font-mono-num font-bold">Y-</span>) أو الكود الخاص المُرسل لك من الإدارة.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
