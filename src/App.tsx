import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Header } from "./components/Header";
import { HistoryView } from "./components/HistoryView";
import { HomeView } from "./components/HomeView";
import { LoaderOverlay } from "./components/LoaderOverlay";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { PlansView } from "./components/PlansView";
import { ResultView } from "./components/ResultView";
import { Toast } from "./components/Toast";
import { API_TIMEOUTS, FREE_LIMIT, PLANS, STORAGE_KEY, THEME_KEY } from "./constants";
import type {
  AppState,
  CategoryId,
  DiagnosisResult,
  HistoryEntry,
  MediaAudio,
  MediaImage,
  PlanId,
  TabId,
} from "./types";
import { getOrCreateDeviceId } from "./utils/activation";
import { formatArabicDate, getCategory } from "./utils/format";
import { fetchWithTimeout } from "./utils/network";

const AdminGeneratorModal = lazy(() =>
  import("./components/AdminGeneratorModal").then((m) => ({
    default: m.AdminGeneratorModal,
  }))
);

function loadInitialState(): AppState {
  const defaults: AppState = {
    welcomed: true,
    used: 0,
    plan: null,
    hist: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      welcomed: Boolean(parsed.welcomed ?? true),
      used: Number(parsed.used) || 0,
      plan: parsed.plan && parsed.plan.exp > Date.now() ? parsed.plan : null,
      hist: Array.isArray(parsed.hist) ? parsed.hist.slice(0, 50) : [],
    };
  } catch {
    return defaults;
  }
}

function saveStateSafely(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    let trimmedHist = [...state.hist];
    while (trimmedHist.length > 0) {
      trimmedHist = trimmedHist.slice(0, Math.max(0, Math.floor(trimmedHist.length * 0.7) - 1));
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...state, hist: trimmedHist })
        );
        return;
      } catch {}
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, hist: [] })
      );
    } catch {}
  }
}

const TAB_ORDER: Record<TabId, number> = {
  home: 0,
  result: 1,
  hist: 2,
  plans: 3,
};

const PAGE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const pageVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -18 : 18,
    y: 8,
    scale: 0.992,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.34,
      ease: PAGE_EASE,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 18 : -18,
    y: -6,
    scale: 0.994,
    transition: {
      duration: 0.22,
      ease: PAGE_EASE,
    },
  }),
};

export default function App() {
  const [deviceId] = useState<number>(() => getOrCreateDeviceId());
  const [appState, setAppState] = useState<AppState>(loadInitialState);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [navDirection, setNavDirection] = useState<number>(1);
  const [selectedCat, setSelectedCat] = useState<CategoryId | "">("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<MediaImage | null>(null);
  const [audio, setAudio] = useState<MediaAudio | null>(null);
  const [currentResult, setCurrentResult] = useState<HistoryEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rejectionAlert, setRejectionAlert] = useState<{
    reason: string;
    detectedSubject?: string;
    detectedCategory?: CategoryId;
    rejectionCode?: string;
    rejectionSource?: "image" | "audio" | "text";
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  const toastTimerRef = useRef<number>(0);
  const warnedExpRef = useRef<string | null>(null);

  const activePlan =
    appState.plan && appState.plan.exp > Date.now() ? appState.plan : null;
  const isPro = Boolean(
    activePlan && (activePlan.id === "pro" || activePlan.id === "year")
  );
  const remainingFree = Math.max(0, FREE_LIMIT - appState.used);

  useEffect(() => {
    saveStateSafely(appState);
  }, [appState]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch {}
  }, [isDark]);

  function showToast(msg: string) {
    setToastMsg(msg);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 4200);
  }

  useEffect(() => {
    if (!activePlan) return;
    const msLeft = activePlan.exp - Date.now();
    const threeDaysMs = 3 * 864e5;
    if (msLeft <= 0 || msLeft > threeDaysMs) return;

    const warnKey = `${activePlan.id}_${activePlan.exp}`;
    if (warnedExpRef.current === warnKey) return;
    warnedExpRef.current = warnKey;

    const daysLeft = Math.max(1, Math.ceil(msLeft / 864e5));
    const planName = PLANS.find((p) => p.id === activePlan.id)?.name || "باقتك";
    const expDateStr = formatArabicDate(activePlan.exp);

    const timer = window.setTimeout(() => {
      if (daysLeft === 1) {
        showToast(`تنبيه: اشتراكك في ${planName} ينتهي قريباً (${expDateStr})، جدّده لتجنب الانقطاع.`);
      } else {
        showToast(`تنبيه: يتبقى ${daysLeft} أيام على انتهاء ${planName} (${expDateStr}).`);
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [activePlan]);

  function navigateTo(tab: TabId) {
    if (tab !== activeTab) {
      setNavDirection(TAB_ORDER[tab] >= TAB_ORDER[activeTab] ? 1 : -1);
      setActiveTab(tab);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDiagnose() {
    const trimmed = description.trim();
    if (!trimmed && !image && !audio) {
      showToast("صف المشكلة أو أضف صورة أو تسجيلاً صوتياً");
      return;
    }
    if (!activePlan && remainingFree <= 0) {
      showToast("انتهت فحوصاتك المجانية، اختر باقة للمتابعة");
      navigateTo("plans");
      return;
    }

    setRejectionAlert(null);
    setIsLoading(true);
    try {
      const response = await fetchWithTimeout(
        "/api/diagnose",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": String(deviceId),
            ...(activePlan?.token ? { "x-entitlement-token": activePlan.token } : {}),
          },
          body: JSON.stringify({
            cat: selectedCat || "auto",
            catName: selectedCat ? getCategory(selectedCat).name : "تحديد تلقائي",
            text: trimmed,
            image: image ? { mime: image.mime, data: image.data } : null,
            audio: audio ? { mime: audio.mime, data: audio.data } : null,
          }),
        },
        API_TIMEOUTS.diagnose
      );

      const payload = (await response.json()) as DiagnosisResult & {
        error?: string;
        rejected?: boolean;
        detectedSubject?: string;
        detectedCategory?: string;
        detected_category?: string;
        rejectionCode?: string;
        rejectionSource?: "image" | "audio" | "text";
      };
      if (!response.ok) {
        if (payload.rejected) {
          const reason =
            payload.error ||
            "الصورة أو التسجيل أو الوصف لا يطابق عطل صيانة حقيقي في الفئة المختارة.";
          const validCats: CategoryId[] = ["ac", "car", "elec", "appl", "phone"];
          const detectedCategory = validCats.includes(payload.detectedCategory as CategoryId)
            ? (payload.detectedCategory as CategoryId)
            : undefined;
          setRejectionAlert({
            reason,
            detectedSubject: payload.detectedSubject,
            detectedCategory,
            rejectionCode: payload.rejectionCode,
            rejectionSource: payload.rejectionSource,
          });
          showToast(
            payload.rejectionSource === "audio"
              ? "تم رفض التسجيل الصوتي: لا يطابق عطل صيانة في الفئة"
              : payload.rejectionSource === "image"
              ? "تم رفض الصورة: لا تطابق عطل صيانة في الفئة"
              : "تم رفض التحليل: المحتوى لا يطابق عطل صيانة"
          );
          return;
        }
        throw new Error(payload.error || "تعذر إتمام الفحص حالياً");
      }

      const validCats: CategoryId[] = ["ac", "car", "elec", "appl", "phone"];
      const detectedCatFromPayload = validCats.includes(payload.detected_category as CategoryId)
        ? (payload.detected_category as CategoryId)
        : undefined;
      const resolvedCat: CategoryId = selectedCat || detectedCatFromPayload || "elec";
      if (!selectedCat) {
        setSelectedCat(resolvedCat);
      }

      const entry: HistoryEntry = {
        id: Date.now(),
        ts: Date.now(),
        cat: resolvedCat,
        text: trimmed.slice(0, 140),
        hasImage: Boolean(image),
        hasAudio: Boolean(audio),
        res: payload,
      };

      setAppState((prev) => ({
        ...prev,
        used: activePlan ? prev.used : prev.used + 1,
        hist: [entry, ...prev.hist].slice(0, 50),
      }));
      setCurrentResult(entry);
      navigateTo("result");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ غير متوقع، حاول مرة أخرى";
      showToast(msg);
    } finally {
      setIsLoading(false);
    }
  }

  function handleNewCheck() {
    setSelectedCat("");
    setDescription("");
    setImage(null);
    if (audio?.playbackUrl) {
      URL.revokeObjectURL(audio.playbackUrl);
    }
    setAudio(null);
    setCurrentResult(null);
    setRejectionAlert(null);
    navigateTo("home");
  }

  function handleActivatePlan(
    planId: PlanId,
    days: number,
    planName: string,
    exp?: number,
    token?: string
  ) {
    setAppState((prev) => ({
      ...prev,
      plan: {
        id: planId,
        exp: exp && exp > Date.now() ? exp : Date.now() + days * 864e5,
        token,
      },
    }));
    showToast(`تم تفعيل باقة ${planName} بنجاح`);
  }

  function handleUpdateHistoryEntry(
    entryId: number,
    updater: (prev: HistoryEntry) => HistoryEntry
  ) {
    setAppState((prev) => ({
      ...prev,
      hist: prev.hist.map((item) => (item.id === entryId ? updater(item) : item)),
    }));
    setCurrentResult((prev) => (prev && prev.id === entryId ? updater(prev) : prev));
  }

  const pageKey = activeTab === "result" && currentResult ? `result-${currentResult.id}` : activeTab;

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-screen flex flex-col pb-20 lg:pb-10 overflow-x-clip">
        {/* Soft slowly shifting eye-comfortable gradient backdrop */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 pointer-events-none overflow-hidden ambient-bg-canvas transition-colors duration-500"
        >
          <div className="ambient-orb-a absolute -top-32 -right-24 w-[420px] h-[420px] sm:w-[560px] sm:h-[560px] rounded-full blur-3xl" />
          <div className="ambient-orb-b absolute -bottom-40 -left-24 w-[420px] h-[420px] sm:w-[600px] sm:h-[600px] rounded-full blur-3xl" />
        </div>

        <Header
          activeTab={activeTab}
          onSelectTab={(tab) => navigateTo(tab)}
          activePlan={activePlan}
          usedFree={appState.used}
          historyCount={appState.hist.length}
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          onOpenAdmin={() => setAdminOpen(true)}
        />
        <OfflineIndicator />

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-8">
          <AnimatePresence mode="wait" initial={false} custom={navDirection}>
            <motion.div
              key={pageKey}
              custom={navDirection}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {activeTab === "home" && (
                <HomeView
                  selectedCat={selectedCat}
                  onSelectCat={(cat) => {
                    setSelectedCat((prev) => (prev === cat ? "" : cat));
                    if (rejectionAlert) setRejectionAlert(null);
                  }}
                  description={description}
                  onChangeDescription={(val) => {
                    setDescription(val);
                    if (rejectionAlert) setRejectionAlert(null);
                  }}
                  image={image}
                  onChangeImage={(img) => {
                    setImage(img);
                    if (rejectionAlert) setRejectionAlert(null);
                  }}
                  audio={audio}
                  onChangeAudio={(aud) => {
                    setAudio(aud);
                    if (rejectionAlert) setRejectionAlert(null);
                  }}
                  isPro={isPro}
                  hasActivePlan={Boolean(activePlan)}
                  usedFree={appState.used}
                  isSubmitting={isLoading}
                  rejectionAlert={rejectionAlert}
                  onDismissRejection={() => setRejectionAlert(null)}
                  recentHistory={appState.hist}
                  onDiagnose={handleDiagnose}
                  onOpenPlans={() => navigateTo("plans")}
                  onOpenHistoryItem={(entry) => {
                    setCurrentResult(entry);
                    navigateTo("result");
                  }}
                  onToast={showToast}
                />
              )}

              {activeTab === "result" && currentResult && (
                <ResultView
                  entry={currentResult}
                  deviceId={deviceId}
                  entitlementToken={activePlan?.token}
                  isPro={isPro}
                  hasActivePlan={Boolean(activePlan)}
                  onUpdateEntry={handleUpdateHistoryEntry}
                  onNewCheck={handleNewCheck}
                  onOpenPlans={() => navigateTo("plans")}
                  onToast={showToast}
                />
              )}

              {activeTab === "hist" && (
                <HistoryView
                  history={appState.hist}
                  onSelectEntry={(entry) => {
                    setCurrentResult(entry);
                    navigateTo("result");
                  }}
                  onDeleteEntry={(id) => {
                    setAppState((prev) => ({
                      ...prev,
                      hist: prev.hist.filter((item) => item.id !== id),
                    }));
                    showToast("تم حذف الفحص من السجل");
                  }}
                  onClearAll={() => {
                    setAppState((prev) => ({ ...prev, hist: [] }));
                    showToast("تم مسح سجل الأعطال");
                  }}
                  onStartNew={() => navigateTo("home")}
                />
              )}

              {activeTab === "plans" && (
                <PlansView
                  deviceId={deviceId}
                  activePlan={activePlan}
                  usedFree={appState.used}
                  onActivatePlan={handleActivatePlan}
                  onToast={showToast}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {adminOpen && (
          <Suspense fallback={null}>
            <AdminGeneratorModal
              open={adminOpen}
              currentDeviceId={deviceId}
              onClose={() => setAdminOpen(false)}
              onToast={showToast}
            />
          </Suspense>
        )}
        <LoaderOverlay visible={isLoading} />
        <Toast message={toastMsg} />
      </div>
    </MotionConfig>
  );
}
