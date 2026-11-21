import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Search,
  ShieldAlert,
  Trash2,
  TrendingDown,
} from "lucide-react";
import type { CaseStatus, DangerLevel, HistoryEntry } from "../types";
import { formatArabicDate, formatNum, getCategory } from "../utils/format";
import { CategoryIcon } from "./CategoryIcon";

interface HistoryViewProps {
  history: HistoryEntry[];
  onSelectEntry: (entry: HistoryEntry) => void;
  onDeleteEntry: (id: number) => void;
  onClearAll: () => void;
  onStartNew: () => void;
}

type FilterKey = "all" | "active" | "waiting_tech" | "resolved";

const STATUS_META: Record<CaseStatus, { label: string; cls: string }> = {
  new: { label: "جديد", cls: "text-slate-600 dark:text-slate-300" },
  in_progress: { label: "جاري الفحص", cls: "text-orange-600 dark:text-orange-400" },
  waiting_tech: { label: "بانتظار الفني", cls: "text-amber-600 dark:text-amber-400" },
  resolved: { label: "تم الإصلاح", cls: "text-emerald-600 dark:text-emerald-400" },
};

function DangerText({ level }: { level: DangerLevel }) {
  if (level === "مرتفع") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-red-600 dark:text-red-400">
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
        <span>مرتفع</span>
      </span>
    );
  }
  if (level === "منخفض") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
        <span>منخفض</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-600 dark:text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      <span>متوسط</span>
    </span>
  );
}

export function HistoryView({
  history,
  onSelectEntry,
  onDeleteEntry,
  onClearAll,
  onStartNew,
}: HistoryViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  if (history.length === 0) {
    return (
      <div className="animate-card-enter bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-4 max-w-xl mx-auto shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 flex items-center justify-center mx-auto">
          <FolderOpen className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">سجل الأعطال فارغ</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ستظهر هنا جميع الفحوصات السابقة لتتبع مراحل الإصلاح والتكلفة في أي وقت.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartNew}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold inline-flex items-center gap-2 transition-all duration-300 active:scale-[0.985] cursor-pointer"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span>ابدأ أول فحص الآن</span>
        </button>
      </div>
    );
  }

  const activeCount = history.filter((h) => (h.status || "new") !== "resolved").length;
  const resolvedCount = history.filter((h) => h.status === "resolved").length;
  const totalSavedMru = history.reduce((acc, item) => {
    const firstQuote = item.quoteChecks?.[0]?.quotedMru;
    if (
      item.status === "resolved" &&
      item.actualPaidMru !== undefined &&
      firstQuote &&
      firstQuote > item.actualPaidMru
    ) {
      return acc + (firstQuote - item.actualPaidMru);
    }
    return acc;
  }, 0);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = history.filter((entry) => {
    const status = entry.status || "new";
    if (filter === "active" && status === "resolved") return false;
    if (filter === "waiting_tech" && status !== "waiting_tech") return false;
    if (filter === "resolved" && status !== "resolved") return false;

    if (!normalizedQuery) return true;
    const catName = getCategory(entry.cat).name.toLowerCase();
    return (
      catName.includes(normalizedQuery) ||
      entry.res.diagnosis.toLowerCase().includes(normalizedQuery) ||
      entry.text.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
            سجل الأعطال والتتبع الذكي
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
            <span>الكل: <strong className="text-slate-900 dark:text-white">{history.length}</strong></span>
            <span>قيد المتابعة: <strong className="text-orange-600 dark:text-orange-400">{activeCount}</strong></span>
            <span>تم الإصلاح: <strong className="text-emerald-600 dark:text-emerald-400">{resolvedCount}</strong></span>
            {totalSavedMru > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>توفير مسجل: {formatNum(totalSavedMru)} أوقية جديدة</span>
              </span>
            )}
          </div>
        </div>

        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>مسح السجل</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClearAll();
                setConfirmClear(false);
              }}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              تأكيد الحذف
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-800 sm:w-auto">
          {(
            [
              { id: "all", label: "الكل" },
              { id: "active", label: "قيد المتابعة" },
              { id: "waiting_tech", label: "بانتظار الفني" },
              { id: "resolved", label: "تم الإصلاح" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-[36px] px-2.5 rounded-lg text-xs font-extrabold transition-all duration-300 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
                filter === tab.id
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث في الأعطال أو الفئة..."
            className="w-full min-h-[44px] rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-800 pr-9 pl-3 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-orange-500 transition-colors duration-300"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="animate-card-enter bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
          لا توجد حالات مطابقة للبحث أو التصفية الحالية.
        </div>
      ) : (
        <div key={filter} className="animate-card-enter grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((entry) => {
            const cat = getCategory(entry.cat);
            const status = entry.status || "new";
            const statusMeta = STATUS_META[status];
            const stepsDone = entry.completedSteps?.length || 0;
            const stepsTotal = entry.res.diy_steps?.length || 0;
            const quotesCount = entry.quoteChecks?.length || 0;
            const followCount = entry.followUps?.length || 0;

            return (
              <article
                key={entry.id}
                className="bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:-translate-y-0.5 hover:border-orange-500/50 hover:shadow-md hover:shadow-slate-900/[0.04] dark:hover:shadow-black/25 transition-all duration-300 ease-out"
              >
                <button
                  type="button"
                  onClick={() => onSelectEntry(entry)}
                  className="text-right space-y-2.5 w-full cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-sm">
                      <CategoryIcon id={entry.cat} className="w-4 h-4 text-orange-500 shrink-0" />
                      <span>{cat.name}</span>
                    </div>
                    <DangerText level={entry.res.danger_level} />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {formatArabicDate(entry.ts)}
                    </span>
                    <span className={`inline-flex items-center gap-1 font-extrabold ${statusMeta.cls}`}>
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>{statusMeta.label}</span>
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-200 line-clamp-3 leading-relaxed">
                    {entry.res.diagnosis}
                  </p>

                  {(stepsTotal > 0 || quotesCount > 0 || followCount > 0 || entry.actualPaidMru !== undefined) && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                      {stepsTotal > 0 && (
                        <span>خطوات: {stepsDone}/{stepsTotal}</span>
                      )}
                      {quotesCount > 0 && (
                        <span>تسعيرة: {quotesCount}</span>
                      )}
                      {followCount > 0 && (
                        <span>متابعة: {followCount}</span>
                      )}
                      {entry.actualPaidMru !== undefined && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          المدفوع: {formatNum(entry.actualPaidMru)} MRU
                        </span>
                      )}
                    </div>
                  )}
                </button>

                <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectEntry(entry)}
                    className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline min-h-[36px] px-1 cursor-pointer"
                  >
                    عرض التقرير والمتابعة
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteEntry(entry.id)}
                    aria-label="حذف هذا الفحص"
                    className="min-h-[38px] min-w-[38px] rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
