import { useRef } from "react";
import { motion } from "motion/react";
import { FolderClock, Gem, Home, Moon, Sun, Wrench } from "lucide-react";
import { FREE_LIMIT, PLANS } from "../constants";
import type { ActivePlan, TabId } from "../types";
import { PWAInstallButton } from "./PWAInstallButton";

interface HeaderProps {
  activeTab: TabId;
  onSelectTab: (tab: "home" | "hist" | "plans") => void;
  activePlan: ActivePlan | null;
  usedFree: number;
  historyCount: number;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenAdmin: () => void;
}

export function Header({
  activeTab,
  onSelectTab,
  activePlan,
  usedFree,
  historyCount,
  isDark,
  onToggleTheme,
  onOpenAdmin,
}: HeaderProps) {
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number>(0);

  const currentNav = activeTab === "result" ? "home" : activeTab;
  const remaining = Math.max(0, FREE_LIMIT - usedFree);

  const planObj = activePlan ? PLANS.find((p) => p.id === activePlan.id) : null;
  const daysLeft = activePlan ? Math.max(1, Math.ceil((activePlan.exp - Date.now()) / 864e5)) : 0;

  const statusText = planObj
    ? `${planObj.name} · متبقي ${daysLeft} يوماً`
    : remaining === 0
      ? "انتهت الفحوصات المجانية"
      : remaining === 1
        ? "متبقي فحص مجاني واحد"
        : remaining === 2
          ? "متبقي فحصان مجانيان"
          : `متبقي ${remaining} فحوصات مجانية`;

  function handleLogoTap() {
    window.clearTimeout(tapTimerRef.current);
    tapCountRef.current += 1;

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onOpenAdmin();
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
    }, 3000);

    onSelectTab("home");
  }

  return (
    <>
      <header className="sticky top-0 z-30 h-12 lg:h-16 bg-[#121C30]/95 backdrop-blur-md text-white border-b border-slate-800/80 transition-colors duration-300">
        <div className="max-w-6xl mx-auto h-full px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8">
          <button
            type="button"
            onClick={handleLogoTap}
            className="flex items-center gap-2.5 text-lg lg:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 min-h-[44px] focus-visible:outline-2 focus-visible:outline-orange-400 rounded-lg cursor-pointer select-none"
          >
            <Wrench className="w-5 h-5 text-orange-400 shrink-0" aria-hidden="true" />
            <span>صلاح لي</span>
          </button>

          <nav aria-label="التنقل الرئيسي" className="hidden lg:flex items-center gap-7 text-sm font-semibold">
            <button
              type="button"
              onClick={() => onSelectTab("home")}
              className={`relative whitespace-nowrap shrink-0 py-2 transition-colors duration-300 cursor-pointer ${
                currentNav === "home"
                  ? "text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>فحص العطل</span>
              {currentNav === "home" && (
                <motion.span
                  layoutId="desktop-nav-indicator"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-500"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("hist")}
              className={`relative whitespace-nowrap shrink-0 py-2 transition-colors duration-300 cursor-pointer ${
                currentNav === "hist"
                  ? "text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>سجل الأعطال{historyCount > 0 ? ` (${historyCount})` : ""}</span>
              {currentNav === "hist" && (
                <motion.span
                  layoutId="desktop-nav-indicator"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-500"
                />
              )}
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("plans")}
              className={`relative whitespace-nowrap shrink-0 py-2 transition-colors duration-300 cursor-pointer ${
                currentNav === "plans"
                  ? "text-white"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span>الباقات والاشتراك</span>
              {currentNav === "plans" && (
                <motion.span
                  layoutId="desktop-nav-indicator"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-500"
                />
              )}
            </button>
          </nav>

          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            <span className="hidden sm:inline text-xs lg:text-sm font-semibold text-slate-300 whitespace-nowrap tabular-nums">
              {statusText}
            </span>
            <span className="sm:hidden text-xs font-semibold text-orange-300 whitespace-nowrap tabular-nums">
              {planObj ? `${daysLeft} يوم` : `${remaining}/${FREE_LIMIT} مجاني`}
            </span>
            <PWAInstallButton />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"}
              className="min-h-[40px] min-w-[40px] lg:min-h-[44px] lg:min-w-[44px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4 transition-transform duration-300" /> : <Moon className="w-4 h-4 transition-transform duration-300" />}
            </button>
            <button
              type="button"
              onClick={() => onSelectTab("plans")}
              className="hidden lg:inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-all duration-300 active:scale-[0.98] cursor-pointer"
            >
              {planObj ? "إدارة الباقة" : "تفعيل الباقة"}
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="التنقل السفلي"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white/95 dark:bg-[#131D31]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-3 items-center transition-colors duration-300"
      >
        <button
          type="button"
          onClick={() => onSelectTab("home")}
          className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all duration-300 active:scale-95 cursor-pointer ${
            currentNav === "home"
              ? "text-orange-600 dark:text-orange-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {currentNav === "home" && (
            <motion.span
              layoutId="mobile-nav-indicator"
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-orange-500"
            />
          )}
          <Home className="w-5 h-5 transition-transform duration-300" aria-hidden="true" />
          <span>الرئيسية</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab("hist")}
          className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all duration-300 active:scale-95 cursor-pointer ${
            currentNav === "hist"
              ? "text-orange-600 dark:text-orange-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {currentNav === "hist" && (
            <motion.span
              layoutId="mobile-nav-indicator"
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-orange-500"
            />
          )}
          <FolderClock className="w-5 h-5 transition-transform duration-300" aria-hidden="true" />
          <span>سجل الأعطال</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab("plans")}
          className={`relative h-full min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-all duration-300 active:scale-95 cursor-pointer ${
            currentNav === "plans"
              ? "text-orange-600 dark:text-orange-400"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {currentNav === "plans" && (
            <motion.span
              layoutId="mobile-nav-indicator"
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="absolute top-0 inset-x-6 h-0.5 rounded-full bg-orange-500"
            />
          )}
          <Gem className="w-5 h-5 transition-transform duration-300" aria-hidden="true" />
          <span>الباقات</span>
        </button>
      </nav>
    </>
  );
}
