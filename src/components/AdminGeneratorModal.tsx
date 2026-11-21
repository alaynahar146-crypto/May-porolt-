import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Copy,
  Film,
  Inbox,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { API_TIMEOUTS, PLANS } from "../constants";
import type { CustomCodeRecord, PlanId, SubscriptionRequestRecord } from "../types";
import { copyTextToClipboard } from "../utils/format";
import { fetchWithTimeout } from "../utils/network";
import { PromoStudioTab } from "./PromoStudioTab";

interface AdminGeneratorModalProps {
  open: boolean;
  currentDeviceId?: number;
  onClose: () => void;
  onToast: (msg: string) => void;
}

function buildRandomCode(planId: PlanId): string {
  const prefix = planId === "basic" ? "B" : planId === "pro" ? "P" : "Y";
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}S-${rand}`;
}

export function AdminGeneratorModal({
  open,
  currentDeviceId,
  onClose,
  onToast,
}: AdminGeneratorModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState<{
    configured: boolean;
    source: "env" | "custom" | "unconfigured";
    updatedAt: number | null;
  }>({ configured: true, source: "custom", updatedAt: null });
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const unlocked = Boolean(adminToken);
  const [mode, setMode] = useState<"inbox" | "device" | "instant" | "studio">("inbox");

  // Password Change Panel (when unlocked & source === "custom")
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [nextPwd, setNextPwd] = useState("");
  const [confirmNextPwd, setConfirmNextPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [changePwdError, setChangePwdError] = useState("");

  // Private Admin Inbox (Message #2 visible only to Admin)
  const [requests, setRequests] = useState<SubscriptionRequestRecord[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Two-code device mode (1. Device Owner ID -> 2. Plan Activation Code from server)
  const [customerDeviceId, setCustomerDeviceId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("year");
  const [planActivationCode, setPlanActivationCode] = useState("");
  const [generatingDeviceCode, setGeneratingDeviceCode] = useState(false);
  const [waPaste, setWaPaste] = useState("");

  // Instant / Manual general code mode
  const [customPlan, setCustomPlan] = useState<PlanId>("year");
  const [customCodeInput, setCustomCodeInput] = useState("");
  const [singleUse, setSingleUse] = useState(true);
  const [latestIssuedCode, setLatestIssuedCode] = useState<string | null>(null);
  const [customCodes, setCustomCodes] = useState<CustomCodeRecord[]>([]);
  const [customError, setCustomError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const parsedDeviceId = Number(customerDeviceId.trim());
  const isValidDeviceId =
    Number.isInteger(parsedDeviceId) && parsedDeviceId >= 1000 && parsedDeviceId <= 9999999999;

  useEffect(() => {
    if (!open || unlocked) return;
    let cancelled = false;
    setStatusLoading(true);
    fetchWithTimeout("/api/admin/status", {}, API_TIMEOUTS.admin)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          configured?: boolean;
          source?: "env" | "custom" | "unconfigured";
          updatedAt?: number | null;
        };
        if (!cancelled && typeof data.configured === "boolean") {
          setAuthStatus({
            configured: data.configured,
            source: data.source || (data.configured ? "custom" : "unconfigured"),
            updatedAt: data.updatedAt ?? null,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, unlocked]);

  useEffect(() => {
    if (!open || !adminToken) return;
    if (mode === "inbox") {
      fetchRequests();
    } else if (mode === "instant") {
      fetchCustomCodes();
    }
  }, [open, adminToken, mode]);

  useEffect(() => {
    if (!open || !adminToken || mode !== "device" || !isValidDeviceId) {
      setPlanActivationCode("");
      return;
    }

    let cancelled = false;
    setGeneratingDeviceCode(true);
    fetchWithTimeout(
      "/api/admin/generate-device-code",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ deviceId: parsedDeviceId, planId: selectedPlan }),
      },
      API_TIMEOUTS.admin
    )
      .then(async (res) => {
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        const data = (await res.json()) as { code?: string };
        if (!cancelled && res.ok && data.code) {
          setPlanActivationCode(data.code);
        }
      })
      .catch(() => {
        if (!cancelled) setPlanActivationCode("");
      })
      .finally(() => {
        if (!cancelled) setGeneratingDeviceCode(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, adminToken, mode, parsedDeviceId, selectedPlan, isValidDeviceId]);

  function handleSessionExpired() {
    setAdminToken(null);
    setAuthError("انتهت جلسة الإدارة، أعد إدخال كلمة المرور");
  }

  async function fetchRequests() {
    if (!adminToken) return;
    setLoadingRequests(true);
    try {
      const res = await fetchWithTimeout(
        "/api/admin/requests",
        { headers: { Authorization: `Bearer ${adminToken}` } },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { requests?: SubscriptionRequestRecord[] };
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    } catch {
      onToast("تعذر تحميل الطلبات");
    } finally {
      setLoadingRequests(false);
    }
  }

  async function markRequestSent(id: string) {
    if (!adminToken) return;
    try {
      const res = await fetchWithTimeout(
        `/api/admin/requests/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { requests?: SubscriptionRequestRecord[] };
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    } catch {}
  }

  async function deleteRequest(id: string) {
    if (!adminToken) return;
    try {
      const res = await fetchWithTimeout(
        `/api/admin/requests/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { requests?: SubscriptionRequestRecord[] };
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
      onToast("تم حذف الطلب");
    } catch {
      onToast("تعذر حذف الطلب");
    }
  }

  async function fetchCustomCodes() {
    if (!adminToken) return;
    try {
      const res = await fetchWithTimeout(
        "/api/admin/codes",
        { headers: { Authorization: `Bearer ${adminToken}` } },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { codes?: CustomCodeRecord[] };
      if (Array.isArray(data.codes)) {
        setCustomCodes(data.codes);
      }
    } catch {}
  }

  function handleClose() {
    setPassword("");
    setConfirmPassword("");
    setAuthError("");
    setShowChangePassword(false);
    setCurrentPwd("");
    setNextPwd("");
    setConfirmNextPwd("");
    setChangePwdError("");
    setAdminToken(null);
    setCustomerDeviceId("");
    setPlanActivationCode("");
    setWaPaste("");
    setCustomCodeInput("");
    setCustomError("");
    setLatestIssuedCode(null);
    setCopiedKey(null);
    onClose();
  }

  async function handleSetupSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = password.trim();
    const confirmTrimmed = confirmPassword.trim();
    if (trimmed.length < 4) {
      setAuthError("اختر كلمة مرور من 4 أحرف أو أرقام على الأقل");
      return;
    }
    if (trimmed !== confirmTrimmed) {
      setAuthError("كلمتا المرور غير متطابقتين");
      return;
    }

    setLoggingIn(true);
    setAuthError("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/setup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: trimmed }),
        },
        API_TIMEOUTS.admin
      );
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        configured?: boolean;
        source?: "env" | "custom" | "unconfigured";
        updatedAt?: number | null;
        error?: string;
      };
      if (!res.ok || !data.token) {
        if (res.status === 409) {
          setAuthStatus({ configured: true, source: "custom", updatedAt: null });
          setConfirmPassword("");
        }
        setAuthError(data.error || "تعذر حفظ كلمة مرور الإدارة");
        return;
      }
      setAuthStatus({
        configured: true,
        source: data.source || "custom",
        updatedAt: data.updatedAt ?? Date.now(),
      });
      setAdminToken(data.token);
      setPassword("");
      setConfirmPassword("");
      onToast("تم تعيين وتشفير كلمة مرور الإدارة بنجاح");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = password.trim();
    if (!trimmed) {
      setAuthError("أدخل كلمة مرور الإدارة أولاً");
      return;
    }

    setLoggingIn(true);
    setAuthError("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: trimmed }),
        },
        API_TIMEOUTS.admin
      );
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        needsSetup?: boolean;
        source?: "env" | "custom" | "unconfigured";
        updatedAt?: number | null;
        error?: string;
      };
      if (data.needsSetup) {
        setAuthStatus({ configured: false, source: "unconfigured", updatedAt: null });
        setAuthError("");
        return;
      }
      if (!res.ok || !data.token) {
        setAuthError(data.error || "كلمة مرور الإدارة غير صحيحة");
        return;
      }
      setAuthStatus({
        configured: true,
        source: data.source || "custom",
        updatedAt: data.updatedAt ?? null,
      });
      setAdminToken(data.token);
      setPassword("");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleChangePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!adminToken) return;
    const cur = currentPwd.trim();
    const nxt = nextPwd.trim();
    const cnf = confirmNextPwd.trim();

    if (!cur) {
      setChangePwdError("أدخل كلمة المرور الحالية");
      return;
    }
    if (nxt.length < 4) {
      setChangePwdError("يجب أن تتكون كلمة المرور الجديدة من 4 أحرف أو أرقام على الأقل");
      return;
    }
    if (nxt !== cnf) {
      setChangePwdError("تأكيد كلمة المرور الجديدة غير متطابق");
      return;
    }

    setChangingPwd(true);
    setChangePwdError("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/change-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ currentPassword: cur, newPassword: nxt }),
        },
        API_TIMEOUTS.admin
      );
      if (res.status === 401 && !res.headers.get("content-type")?.includes("application/json")) {
        handleSessionExpired();
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        token?: string;
        updatedAt?: number | null;
        error?: string;
      };
      if (!res.ok || !data.token) {
        setChangePwdError(data.error || "تعذر تغيير كلمة المرور");
        return;
      }
      setAdminToken(data.token);
      setAuthStatus({
        configured: true,
        source: "custom",
        updatedAt: data.updatedAt ?? Date.now(),
      });
      setCurrentPwd("");
      setNextPwd("");
      setConfirmNextPwd("");
      setShowChangePassword(false);
      onToast("تم تحديث وتشفير كلمة مرور الإدارة بنجاح");
    } catch (err: unknown) {
      setChangePwdError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
    } finally {
      setChangingPwd(false);
    }
  }

  function handleWaPasteChange(val: string) {
    setWaPaste(val);
    const idMatch =
      val.match(/(?:رقم\s*جهازي(?:\s*الخاص)?(?:\s*هو)?\s*:?\s*)(\d{4,10})/) ||
      val.match(/\b([1-9]\d{3,9})\b/);
    if (idMatch && idMatch[1]) {
      setCustomerDeviceId(idMatch[1]);
    }
    if (val.includes("الأساسية") || val.includes("100 أوقية")) {
      setSelectedPlan("basic");
    } else if (val.includes("الاحترافية") || val.includes("200 أوقية")) {
      setSelectedPlan("pro");
    } else if (val.includes("السنوية") || val.includes("300 أوقية")) {
      setSelectedPlan("year");
    }
  }

  async function handleCopy(value: string, key = value, feedback?: string) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setCopiedKey(key);
      onToast(feedback || `تم نسخ الكود ${value}`);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } else {
      onToast("تعذّر النسخ");
    }
  }

  async function saveCodeToServer(codeToSave: string, planId: PlanId, isSingleUse: boolean) {
    if (!adminToken) return false;
    setBusy(true);
    setCustomError("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/codes",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            code: codeToSave,
            planId,
            singleUse: isSingleUse,
          }),
        },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return false;
      }
      const data = (await res.json()) as { codes?: CustomCodeRecord[]; error?: string };
      if (!res.ok) {
        setCustomError(data.error || "تعذر حفظ الكود");
        return false;
      }
      if (Array.isArray(data.codes)) {
        setCustomCodes(data.codes);
      }
      setLatestIssuedCode(codeToSave);
      await handleCopy(codeToSave);
      return true;
    } catch (err: unknown) {
      setCustomError(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleInstantGenerate() {
    const newCode = buildRandomCode(customPlan);
    await saveCodeToServer(newCode, customPlan, true);
  }

  async function handleAddManualCode(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = customCodeInput.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (cleaned.length < 3) {
      setCustomError("اكتب كوداً من 3 أحرف/أرقام إنجليزية على الأقل.");
      return;
    }
    const ok = await saveCodeToServer(cleaned, customPlan, singleUse);
    if (ok) {
      setCustomCodeInput("");
    }
  }

  async function handleDeleteCustomCode(code: string) {
    if (!adminToken) return;
    try {
      const res = await fetchWithTimeout(
        `/api/admin/codes/${encodeURIComponent(code)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { codes?: CustomCodeRecord[] };
      if (Array.isArray(data.codes)) {
        setCustomCodes(data.codes);
      }
      if (latestIssuedCode === code) {
        setLatestIssuedCode(null);
      }
      onToast(`تم حذف الكود ${code}`);
    } catch {
      onToast("تعذر حذف الكود");
    }
  }

  function planLabel(planId: PlanId): string {
    const p = PLANS.find((x) => x.id === planId);
    return p ? p.name.split(" ")[0] : planId;
  }

  function buildCustomerReply(code: string): string {
    return `هذا كود تفعيل الخطة الخاص بك: ${code}\nالصقه في خانة «إدخال كود التفعيل الفريد» داخل صفحة الباقات واضغط «تفعيل الباقة الآن» لتتفعّل الباقة مباشرة.`;
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString("ar", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full ${unlocked && mode === "studio" ? "max-w-2xl" : "max-w-lg"} max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-xl space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Shield className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
            <h2 id="admin-modal-title" className="text-base font-extrabold">
              {unlocked
                ? "رسائل وإصدار أكواد الإدارة"
                : authStatus.configured
                  ? "دخول الإدارة المحمي"
                  : "تعيين كلمة مرور الإدارة"}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {unlocked && (
              <button
                type="button"
                onClick={() => {
                  setShowChangePassword((prev) => !prev);
                  setChangePwdError("");
                }}
                aria-label="إعدادات كلمة مرور الإدارة"
                title="إعدادات كلمة مرور الإدارة"
                className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  showChangePassword
                    ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">الحماية</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="إغلاق"
              className="min-h-[38px] min-w-[38px] rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!unlocked ? (
          statusLoading ? (
            <div className="py-6 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              جاري التحقق من حالة الحماية...
            </div>
          ) : !authStatus.configured ? (
            <form onSubmit={handleSetupSubmit} className="space-y-3">
              <div className="rounded-xl bg-orange-500/10 border border-orange-500/25 p-3 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                قم بتعيين كلمة مرور مخصصة لحماية أدوات الإدارة. تُحفظ كلمة المرور مشفرة على الخادم بتجزئة آمنة ولا يُسمح بالوصول قبل إدخالها.
              </div>
              <label
                htmlFor="admin-setup-password-input"
                className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                <Lock className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                <span>كلمة المرور المخصصة</span>
              </label>
              <input
                id="admin-setup-password-input"
                type="password"
                dir="ltr"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError("");
                }}
                placeholder="••••"
                className="w-full min-h-[46px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-4 text-center font-mono-num text-lg tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
              />
              <label
                htmlFor="admin-setup-confirm-input"
                className="block text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                تأكيد كلمة المرور
              </label>
              <input
                id="admin-setup-confirm-input"
                type="password"
                dir="ltr"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (authError) setAuthError("");
                }}
                placeholder="••••"
                className="w-full min-h-[46px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-4 text-center font-mono-num text-lg tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
              />
              {authError && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full min-h-[46px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-sm font-extrabold transition-colors cursor-pointer"
              >
                {loggingIn ? "جاري التشفير والحفظ..." : "حفظ كلمة المرور والدخول"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <label
                htmlFor="admin-password-input"
                className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                <Lock className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                <span>أدخل كلمة مرور الإدارة للمتابعة</span>
              </label>
              <input
                id="admin-password-input"
                type="password"
                dir="ltr"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (authError) setAuthError("");
                }}
                placeholder="••••"
                className="w-full min-h-[46px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-4 text-center font-mono-num text-lg tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
              />
              {authError && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full min-h-[46px] rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-sm font-extrabold transition-colors cursor-pointer"
              >
                {loggingIn ? "جاري التحقق..." : "دخول"}
              </button>
            </form>
          )
        ) : (
          <div className="space-y-4">
            {showChangePassword && (
              <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                    <Lock className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                    <span>حماية كلمة مرور المسؤول (مشفّرة)</span>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    {authStatus.source === "env" ? "محمية عبر إعدادات الخادم" : "محفوظة بتشفير آمن"}
                  </span>
                </div>

                {authStatus.source === "env" ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    كلمة المرور مضبوطة حالياً عبر متغير البيئة <span dir="ltr" className="font-mono-num">ADMIN_PASSWORD</span> في الخادم. لتغييرها حدّث الإعداد من لوحة الخادم.
                  </p>
                ) : (
                  <form onSubmit={handleChangePasswordSubmit} className="space-y-2.5">
                    <input
                      type="password"
                      dir="ltr"
                      value={currentPwd}
                      onChange={(e) => {
                        setCurrentPwd(e.target.value);
                        if (changePwdError) setChangePwdError("");
                      }}
                      placeholder="كلمة المرور الحالية"
                      aria-label="كلمة المرور الحالية"
                      className="w-full min-h-[40px] rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="password"
                        dir="ltr"
                        value={nextPwd}
                        onChange={(e) => {
                          setNextPwd(e.target.value);
                          if (changePwdError) setChangePwdError("");
                        }}
                        placeholder="كلمة المرور الجديدة"
                        aria-label="كلمة المرور الجديدة"
                        className="w-full min-h-[40px] rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                      />
                      <input
                        type="password"
                        dir="ltr"
                        value={confirmNextPwd}
                        onChange={(e) => {
                          setConfirmNextPwd(e.target.value);
                          if (changePwdError) setChangePwdError("");
                        }}
                        placeholder="تأكيد الجديدة"
                        aria-label="تأكيد كلمة المرور الجديدة"
                        className="w-full min-h-[40px] rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                    {changePwdError && (
                      <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                        {changePwdError}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowChangePassword(false)}
                        className="min-h-[36px] px-3 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={changingPwd}
                        className="min-h-[36px] px-4 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-xs font-extrabold cursor-pointer"
                      >
                        {changingPwd ? "جاري التحديث..." : "تحديث كلمة المرور"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setMode("inbox")}
                className={`min-h-[40px] px-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                  mode === "inbox"
                    ? "bg-white dark:bg-[#131D31] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                طلبات التفعيل{pendingCount > 0 ? ` (${pendingCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setMode("device")}
                className={`min-h-[40px] px-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                  mode === "device"
                    ? "bg-white dark:bg-[#131D31] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                كود الجهاز ← الخطة
              </button>
              <button
                type="button"
                onClick={() => setMode("instant")}
                className={`min-h-[40px] px-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer ${
                  mode === "instant"
                    ? "bg-white dark:bg-[#131D31] text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                أكواد عامة
              </button>
              <button
                type="button"
                onClick={() => setMode("studio")}
                className={`min-h-[40px] px-1 rounded-lg text-[11px] font-extrabold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                  mode === "studio"
                    ? "bg-white dark:bg-[#131D31] text-orange-600 dark:text-orange-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <Film className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>استوديو الفيديو</span>
              </button>
            </div>

            {mode === "studio" && adminToken ? (
              <PromoStudioTab
                adminToken={adminToken}
                onSessionExpired={handleSessionExpired}
                onToast={onToast}
              />
            ) : mode === "inbox" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 font-semibold">
                    <Inbox className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                    <span>رسائل التفعيل الخاصة بك وحدك (تصل تلقائياً عند طلب العميل)</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchRequests}
                    disabled={loadingRequests}
                    aria-label="تحديث الطلبات"
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingRequests ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {requests.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-6 text-center space-y-1.5">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      لا توجد طلبات واردة بعد
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      عندما يضغط أي عميل زر الدفع عبر واتساب، ستصلك رسالته الأولى على واتساب وتصل رسالة التفعيل هنا تلقائياً.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-3 max-h-[55vh] overflow-y-auto">
                    {requests.map((req) => (
                      <li
                        key={req.id}
                        className={`rounded-xl border p-3.5 space-y-3 ${
                          req.status === "pending"
                            ? "bg-orange-500/5 border-orange-500/40"
                            : "bg-slate-50 dark:bg-[#0B1220] border-slate-200 dark:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span className="text-slate-500 dark:text-slate-400 font-bold">
                              1. كود صاحب الجهاز:
                            </span>
                            <strong dir="ltr" className="font-mono-num text-orange-600 dark:text-orange-400 text-sm">
                              {req.deviceId}
                            </strong>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            {formatTime(req.createdAt)} ·{" "}
                            {req.status === "pending" ? "جديد" : "تم الإرسال"}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          الباقة: <strong className="text-slate-900 dark:text-white">{req.planName}</strong> ({req.priceMru} أوقية جديدة)
                        </div>

                        <div className="rounded-lg bg-white dark:bg-[#131D31] border border-emerald-500/35 px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            2. كود تفعيل الباقة:
                          </span>
                          <span
                            dir="ltr"
                            className="font-mono-num text-lg font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider select-all"
                          >
                            {req.activationCode}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleCopy(req.activationCode, `req-code-${req.id}`);
                              markRequestSent(req.id);
                            }}
                            className="flex-1 min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            {copiedKey === `req-code-${req.id}` ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>نسخ الكود ({req.activationCode})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleCopy(
                                buildCustomerReply(req.activationCode),
                                `req-reply-${req.id}`,
                                "تم نسخ رسالة التفعيل الجاهزة للعميل"
                              );
                              markRequestSent(req.id);
                            }}
                            className="min-h-[40px] px-3 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            {copiedKey === `req-reply-${req.id}` ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>نسخ الرد</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => deleteRequest(req.id)}
                            aria-label="حذف الطلب"
                            className="min-h-[40px] min-w-[40px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : mode === "device" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="wa-paste-quick"
                    className="block text-xs font-bold text-slate-500 dark:text-slate-400"
                  >
                    لصق سريع لرسالة العميل من واتساب (اختياري)
                  </label>
                  <input
                    id="wa-paste-quick"
                    type="text"
                    value={waPaste}
                    onChange={(e) => handleWaPasteChange(e.target.value)}
                    placeholder="الصق رسالة الواتساب هنا فيُقرأ رقم الجهاز والباقة تلقائياً..."
                    className="w-full min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="customer-device-id"
                        className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-orange-500 shrink-0" aria-hidden="true" />
                        <span>1. كود صاحب الجهاز</span>
                      </label>
                      {currentDeviceId && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerDeviceId(String(currentDeviceId));
                            setCopiedKey(null);
                          }}
                          className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer"
                        >
                          جهازي ({currentDeviceId})
                        </button>
                      )}
                    </div>
                    <input
                      id="customer-device-id"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      maxLength={10}
                      autoFocus
                      value={customerDeviceId}
                      onChange={(e) => {
                        setCustomerDeviceId(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setCopiedKey(null);
                      }}
                      placeholder="4-8 أرقام"
                      className="w-full min-h-[44px] rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 px-3 text-center font-mono-num text-lg font-extrabold tracking-wider text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-3 flex flex-col justify-between space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                      <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>2. كود تفعيل الخطة</span>
                    </div>
                    <div
                      dir="ltr"
                      className="min-h-[44px] rounded-lg bg-white dark:bg-[#0B1220] border border-emerald-500/30 flex items-center justify-center font-mono-num text-lg font-extrabold tracking-wider text-emerald-600 dark:text-emerald-400 select-all"
                    >
                      {generatingDeviceCode ? "..." : planActivationCode || "----"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                    اختر الباقة
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {PLANS.map((p) => {
                      const active = selectedPlan === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlan(p.id);
                            setCopiedKey(null);
                          }}
                          className={`min-h-[48px] px-2 py-2 rounded-xl border text-xs font-bold text-center transition-colors cursor-pointer ${
                            active
                              ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                              : "bg-slate-50 dark:bg-[#0B1220] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <div className="truncate">{p.name.split(" ")[0]}</div>
                          <div className="font-mono-num text-[11px] opacity-80">{p.priceMru} MRU</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!isValidDeviceId || !planActivationCode}
                    onClick={() =>
                      handleCopy(
                        buildCustomerReply(planActivationCode),
                        "device-reply",
                        "تم نسخ رسالة التفعيل الجاهزة للعميل"
                      )
                    }
                    className="min-h-[48px] px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-45 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === "device-reply" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>نسخ الرد للعميل</span>
                  </button>
                  <button
                    type="button"
                    disabled={!isValidDeviceId || !planActivationCode}
                    onClick={() => handleCopy(planActivationCode)}
                    className="min-h-[48px] px-3 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-45 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedKey === planActivationCode && planActivationCode ? (
                      <>
                        <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>تم النسخ</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>نسخ كود الخطة</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                    1. اختر الباقة التي دفعها العميل
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {PLANS.map((p) => {
                      const active = customPlan === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setCustomPlan(p.id)}
                          className={`min-h-[48px] px-2 py-1.5 rounded-xl border text-xs font-bold text-center transition-colors cursor-pointer ${
                            active
                              ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                              : "bg-slate-50 dark:bg-[#0B1220] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          <div className="truncate">{p.name.split(" ")[0]}</div>
                          <div className="font-mono-num text-[11px] opacity-80">{p.priceMru} MRU</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleInstantGenerate}
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-extrabold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>توليد كود جديد ونسخه فوراً للعميل</span>
                </button>

                {latestIssuedCode && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          كود تفعيل الخطة (صالح لمرة واحدة):
                        </div>
                        <div dir="ltr" className="font-mono-num text-xl font-extrabold text-slate-900 dark:text-white tracking-wider">
                          {latestIssuedCode}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(latestIssuedCode)}
                        className="min-h-[38px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedKey === latestIssuedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>نسخ</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          buildCustomerReply(latestIssuedCode),
                          "instant-reply",
                          "تم نسخ رسالة التفعيل الجاهزة للعميل"
                        )
                      }
                      className="w-full min-h-[38px] rounded-lg bg-white dark:bg-[#0B1220] border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الرد الجاهز للعميل</span>
                    </button>
                  </div>
                )}

                <form onSubmit={handleAddManualCode} className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  <label
                    htmlFor="custom-code-input"
                    className="block text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    أو اكتب كوداً يدوياً من اختيارك:
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="custom-code-input"
                      type="text"
                      dir="ltr"
                      maxLength={24}
                      value={customCodeInput}
                      onChange={(e) => {
                        setCustomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
                        if (customError) setCustomError("");
                      }}
                      placeholder="مثال: VIP2026"
                      className="flex-1 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-3 text-center font-mono-num text-sm font-extrabold tracking-widest text-slate-900 dark:text-white uppercase focus:outline-none focus:border-orange-500"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSingleUse(true)}
                      className={`min-h-[36px] rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                        singleUse
                          ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                          : "bg-slate-50 dark:bg-[#0B1220] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      استخدام لعميل واحد
                    </button>
                    <button
                      type="button"
                      onClick={() => setSingleUse(false)}
                      className={`min-h-[36px] rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                        !singleUse
                          ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                          : "bg-slate-50 dark:bg-[#0B1220] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      عام (متعدد الاستخدام)
                    </button>
                  </div>

                  {customError && (
                    <p className="text-xs font-bold text-red-600 dark:text-red-400" role="alert">
                      {customError}
                    </p>
                  )}
                </form>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    سجل الأكواد المُصدرة ({customCodes.length})
                  </h3>

                  {customCodes.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                      اضغط الزر البرتقالي بالأعلى لتوليد أول كود للعميل.
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {customCodes.map((item) => {
                        const exhausted = item.singleUse && item.usedCount >= 1;
                        return (
                          <li
                            key={item.code}
                            className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 px-3 py-2 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  dir="ltr"
                                  className={`font-mono-num text-sm font-extrabold ${
                                    exhausted
                                      ? "line-through text-slate-400"
                                      : "text-slate-900 dark:text-white"
                                  }`}
                                >
                                  {item.code}
                                </span>
                                <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                                  {planLabel(item.planId)}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {item.singleUse
                                  ? exhausted
                                    ? "تم التفعيل (منتهي)"
                                    : "مرة واحدة · جاهز للعميل"
                                  : `عام · استُخدم ${item.usedCount} مرة`}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopy(item.code)}
                                aria-label={`نسخ ${item.code}`}
                                className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
                              >
                                {copiedKey === item.code ? (
                                  <Check className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCustomCode(item.code)}
                                aria-label={`حذف ${item.code}`}
                                className="min-h-[36px] min-w-[36px] rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
