import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MoreVertical,
  Share,
  Smartphone,
  X,
} from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { copyTextToClipboard } from "../utils/format";

type GuideMode = null | "native-ready" | "ios" | "in-app" | "chrome-guide";

const DISMISS_SESSION_KEY = "sallahli_install_banner_dismissed";

export function PWAInstallButton() {
  const {
    canInstall,
    hasNativePrompt,
    isAndroid,
    isIos,
    isInAppBrowser,
    isTopWindow,
    promptInstall,
  } = usePWAInstall();
  const [guideMode, setGuideMode] = useState<GuideMode>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Automatically surface a clear Chrome/Install window when visitors open the link
  useEffect(() => {
    if (!canInstall || !isTopWindow) return;

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_SESSION_KEY) === "1";
    } catch {}
    if (dismissed) return;

    if (isInAppBrowser) {
      const timer = window.setTimeout(() => {
        setGuideMode((prev) => prev ?? "in-app");
      }, 350);
      return () => window.clearTimeout(timer);
    }

    if (hasNativePrompt) {
      const timer = window.setTimeout(() => {
        setGuideMode((prev) => (prev === null || prev === "chrome-guide" ? "native-ready" : prev));
      }, 500);
      return () => window.clearTimeout(timer);
    }
  }, [canInstall, isTopWindow, isInAppBrowser, hasNativePrompt]);

  useEffect(() => {
    if (!guideMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guideMode]);

  if (!canInstall) return null;

  function dismissModal() {
    setGuideMode(null);
    try {
      sessionStorage.setItem(DISMISS_SESSION_KEY, "1");
    } catch {}
  }

  async function handleHeaderClick() {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      setGuideMode(null);
      return;
    }
    if (outcome === "ios" || outcome === "in-app" || outcome === "chrome-guide") {
      setGuideMode(outcome);
    }
  }

  async function handleDirectInstallClick() {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      setGuideMode(null);
      return;
    }
    if (outcome === "dismissed") {
      dismissModal();
      return;
    }
    setGuideMode(outcome);
  }

  async function handleCopyUrl() {
    const ok = await copyTextToClipboard(window.location.href);
    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const strippedUrl = currentUrl.replace(/^https?:\/\//i, "");
  const fallbackEncoded = currentUrl ? encodeURIComponent(currentUrl) : "";
  const chromeIntentHref =
    isAndroid && strippedUrl
      ? `intent://${strippedUrl}#Intent;scheme=https;package=com.android.chrome;${
          fallbackEncoded ? `S.browser_fallback_url=${fallbackEncoded};` : ""
        }end`
      : null;

  const modalContent =
    guideMode && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-guide-title"
            className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
            onClick={dismissModal}
          >
            <div
              className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 p-5 text-slate-900 dark:text-white shadow-2xl space-y-4 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/pwa-192x192.png"
                    alt="شعار صلاح لي"
                    className="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                  <div>
                    <h2 id="pwa-guide-title" className="text-base font-extrabold leading-snug">
                      {guideMode === "native-ready"
                        ? "تثبيت تطبيق صلاح لي على جوالك"
                        : guideMode === "ios"
                          ? "تثبيت صلاح لي على آيفون"
                          : guideMode === "in-app"
                            ? "الفتح في متصفح Chrome للتثبيت"
                            : "تثبيت صلاح لي من متصفح Chrome"}
                    </h2>
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      يعمل مباشرة على شاشتك مثل أي تطبيق مجاني
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissModal}
                  aria-label="إغلاق"
                  className="min-h-[36px] min-w-[36px] rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {guideMode === "native-ready" && (
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    التطبيق جاهز الآن للتثبيت المباشر عبر Chrome ليظهر بأيقونته على شاشة هاتفك دون الحاجة لمتجر.
                  </p>
                  <button
                    type="button"
                    onClick={handleDirectInstallClick}
                    className="w-full min-h-[46px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>تثبيت التطبيق الآن</span>
                  </button>
                </div>
              )}

              {guideMode === "ios" && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    لتثبيت <strong>صلاح لي</strong> كتطبيق سريع يعمل على شاشتك الرئيسية:
                  </p>
                  <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    <li className="flex items-center gap-2">
                      <Share className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                      <span>اضغط على أيقونة المشاركة أسفل متصفح Safari.</span>
                    </li>
                    <li>اختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</li>
                  </ol>
                </>
              )}

              {guideMode === "in-app" && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    أنت تتصفح الآن داخل متصفح داخلي (مثل تيك توك أو فيسبوك). افتحه في متصفح Chrome لتظهر لك نافذة التثبيت المباشر على الجوال:
                  </p>
                  {chromeIntentHref && (
                    <a
                      href={chromeIntentHref}
                      className="w-full min-h-[46px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>فتح الآن في متصفح Chrome</span>
                    </a>
                  )}
                  <ol className="space-y-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    <li className="flex items-start gap-2">
                      <MoreVertical className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>
                        {isIos
                          ? "اضغط على زر الخيارات أو المشاركة ثم اختر «الفتح في Safari»."
                          : "أو اضغط النقاط الثلاث (⋮) في أعلى الشاشة واختر «الفتح في Chrome»."}
                      </span>
                    </li>
                    <li>بمجرد الفتح في Chrome، اضغط «تثبيت التطبيق الآن» ليُنزّل على شاشتك.</li>
                  </ol>
                </>
              )}

              {guideMode === "chrome-guide" && (
                <>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    لتثبيت <strong>صلاح لي</strong> مباشرة من متصفح Chrome على شاشة الجوال:
                  </p>
                  {chromeIntentHref && (
                    <a
                      href={chromeIntentHref}
                      className="w-full min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>الفتح في متصفح Chrome</span>
                    </a>
                  )}
                  <ol className="space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                    <li className="flex items-start gap-2">
                      <MoreVertical className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>اضغط قائمة Chrome (⋮) بالأعلى (تأكد أنك في Chrome العادي وليس الخفي).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Smartphone className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>اختر «تثبيت التطبيق» (Install app) أو «إضافة إلى الشاشة الرئيسية».</span>
                    </li>
                  </ol>
                </>
              )}

              {(guideMode === "in-app" || guideMode === "chrome-guide") && currentUrl && (
                <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={currentUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                    aria-label="رابط التطبيق"
                    className="w-full bg-transparent text-[11px] font-mono-num text-slate-700 dark:text-slate-200 focus:outline-none select-all"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {(guideMode === "in-app" || guideMode === "chrome-guide") && (
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="flex-1 min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>تم نسخ الرابط</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>نسخ الرابط لفتحه في Chrome</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissModal}
                  className="flex-1 min-h-[42px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-extrabold cursor-pointer"
                >
                  {guideMode === "native-ready" ? "لاحقاً" : "إغلاق"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={handleHeaderClick}
        aria-label="تثبيت تطبيق صلاح لي"
        className={`inline-flex items-center gap-1.5 min-h-[36px] lg:min-h-[40px] px-2.5 lg:px-3.5 rounded-xl border text-[11px] lg:text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
          hasNativePrompt
            ? "bg-orange-500/20 hover:bg-orange-500/30 border-orange-400/50 text-orange-100"
            : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-white"
        }`}
      >
        <Download className="w-3.5 h-3.5 text-orange-400 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
        <span className="sm:hidden">تثبيت</span>
      </button>

      {modalContent}
    </>
  );
}
