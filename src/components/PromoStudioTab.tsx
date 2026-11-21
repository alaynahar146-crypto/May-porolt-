import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";
import { API_TIMEOUTS } from "../constants";
import { copyTextToClipboard } from "../utils/format";
import { fetchWithTimeout } from "../utils/network";

interface PromoSceneSpec {
  badge: string;
  title: string;
  subtitle: string;
  voiceText: string;
  backdropKey: "ac" | "car" | "voice" | "install";
  visualType: "hook" | "diagnose" | "price" | "voice" | "chrome_install";
  accentColor: string;
}

interface PromoPresetTemplate {
  key: string;
  title: string;
  description: string;
  tiktokCaption: string;
  voiceTone: "calm" | "energetic";
  scenes: PromoSceneSpec[];
}

interface PromoVideoAsset {
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

interface PromoStudioTabProps {
  adminToken: string;
  onSessionExpired: () => void;
  onToast: (msg: string) => void;
}

const TIKTOK_PAGE_NAME = "صلاح لي | مستشار الصيانة";
const TIKTOK_BIO_TEXT =
  "افحص أي عطل واعرف السعر العادل في موريتانيا 🔧🇲🇷\nافتح الرابط في Chrome واضغط «تثبيت التطبيق» 👇";

function formatBytesMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} ميجابايت`;
}

export function PromoStudioTab({
  adminToken,
  onSessionExpired,
  onToast,
}: PromoStudioTabProps) {
  const [assets, setAssets] = useState<PromoVideoAsset[]>([]);
  const [presets, setPresets] = useState<PromoPresetTemplate[]>([]);
  const [hasAvatar, setHasAvatar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [generatingCustom, setGeneratingCustom] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Custom video builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [customTitle, setCustomTitle] = useState("فيديو صلاح لي · شرح سريع");
  const [customTone, setCustomTone] = useState<"calm" | "energetic">("calm");
  const [customScenes, setCustomScenes] = useState<PromoSceneSpec[]>([]);

  function fileUrl(name: string, download = false): string {
    const q = new URLSearchParams({ token: adminToken });
    if (download) q.set("download", "1");
    return `/api/admin/promo-file/${encodeURIComponent(name)}?${q.toString()}`;
  }

  async function loadStudioAssets(autoBootstrapIfEmpty = true) {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/promo-assets",
        { headers: { Authorization: `Bearer ${adminToken}` } },
        API_TIMEOUTS.admin
      );
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      if (!res.ok) throw new Error("تعذر تحميل استوديو الفيديو");
      const data = (await res.json()) as {
        assets?: PromoVideoAsset[];
        presets?: PromoPresetTemplate[];
        hasProfileAvatar?: boolean;
      };
      const loadedAssets = Array.isArray(data.assets) ? data.assets : [];
      const loadedPresets = Array.isArray(data.presets) ? data.presets : [];
      setAssets(loadedAssets);
      setPresets(loadedPresets);
      setHasAvatar(Boolean(data.hasProfileAvatar));

      if (loadedPresets.length > 0 && customScenes.length === 0) {
        setCustomScenes(loadedPresets[0].scenes);
      }

      if (loadedAssets.length === 0 && autoBootstrapIfEmpty) {
        void handleBootstrapStarterVideos();
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStudioAssets(true);
  }, [adminToken]);

  async function handleBootstrapStarterVideos() {
    setBootstrapping(true);
    setErrorMsg("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/promo-bootstrap",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
        API_TIMEOUTS.promoBootstrap
      );
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const data = (await res.json()) as { assets?: PromoVideoAsset[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "تعذر توليد الفيديوهات الجاهزة");
      }
      if (Array.isArray(data.assets)) {
        setAssets(data.assets);
        onToast("تم تجهيز الفيديوهات والتعليق الصوتي بنجاح");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "تعذر تجهيز الفيديوهات حالياً");
    } finally {
      setBootstrapping(false);
    }
  }

  async function handleGenerateCustom(e: React.FormEvent) {
    e.preventDefault();
    if (customScenes.length < 2) {
      setErrorMsg("يلزم وجود مشهدين على الأقل.");
      return;
    }
    setGeneratingCustom(true);
    setErrorMsg("");
    try {
      const res = await fetchWithTimeout(
        "/api/admin/promo-generate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            title: customTitle,
            voiceTone: customTone,
            scenes: customScenes,
          }),
        },
        API_TIMEOUTS.promoGenerate
      );
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const data = (await res.json()) as {
        asset?: PromoVideoAsset;
        assets?: PromoVideoAsset[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "تعذر إنتاج الفيديو الجديد");
      }
      if (Array.isArray(data.assets)) {
        setAssets(data.assets);
      }
      if (data.asset) {
        setActivePreviewId(data.asset.id);
      }
      setShowBuilder(false);
      onToast("تم إنتاج الفيديو الجديد بالصوت العربي وجاهز للتحميل");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "تعذر إنتاج الفيديو حالياً");
    } finally {
      setGeneratingCustom(false);
    }
  }

  async function handleCopy(text: string, key: string, msg: string) {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      onToast(msg);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } else {
      onToast("تعذر النسخ");
    }
  }

  function loadPresetIntoBuilder(preset: PromoPresetTemplate) {
    setCustomTitle(preset.title);
    setCustomTone(preset.voiceTone);
    setCustomScenes(preset.scenes.map((s) => ({ ...s })));
  }

  function updateSceneField(idx: number, field: "title" | "subtitle" | "voiceText", val: string) {
    setCustomScenes((prev) =>
      prev.map((scene, i) => (i === idx ? { ...scene, [field]: val } : scene))
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. TikTok Profile Kit (Avatar + Bio + Name) */}
      <section className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {hasAvatar && (
              <img
                src={fileUrl("sallahli-profile-avatar.jpg")}
                alt="صورة بروفايل صلاح لي"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-full object-cover border border-orange-500/40 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                هوية صفحة تيك توك جاهزة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                صورة البروفايل · الاسم · البايو الجاهز
              </p>
            </div>
          </div>

          {hasAvatar && (
            <a
              href={fileUrl("sallahli-profile-avatar.jpg", true)}
              download="sallahli-profile-avatar.jpg"
              className="min-h-[40px] px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>تحميل الصورة</span>
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleCopy(TIKTOK_PAGE_NAME, "tt-name", "تم نسخ اسم الصفحة")}
            className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:border-orange-500/50 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">نسخ الاسم: {TIKTOK_PAGE_NAME}</span>
            {copiedKey === "tt-name" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleCopy(TIKTOK_BIO_TEXT, "tt-bio", "تم نسخ البايو الجاهز لتيك توك")}
            className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:border-orange-500/50 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="truncate">نسخ بايو تيك توك الجاهز</span>
            {copiedKey === "tt-bio" ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>
        </div>
      </section>

      {/* Error banner */}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl bg-red-500/10 border border-red-500/35 px-3.5 py-2.5 text-xs font-bold text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => handleBootstrapStarterVideos()}
            className="min-h-[34px] px-2.5 rounded-lg bg-red-600 text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* 2. Ready Videos Library */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Film className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-extrabold">
              فيديوهات تيك توك الجاهزة ({assets.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowBuilder((v) => !v)}
              className="min-h-[38px] px-3 rounded-xl bg-slate-900 dark:bg-slate-800 hover:opacity-90 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-orange-400" aria-hidden="true" />
              <span>{showBuilder ? "إغلاق المصمم" : "فيديو جديد"}</span>
            </button>
            <button
              type="button"
              onClick={() => loadStudioAssets(false)}
              disabled={loading || bootstrapping}
              aria-label="تحديث الفيديوهات"
              className="min-h-[38px] min-w-[38px] rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {(loading || bootstrapping) && assets.length === 0 ? (
          <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-6 text-center space-y-2.5">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              جاري توليد الصوت العربي وتركيب الفيديوهات الـ 3 الجاهزة...
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              يتم الآن تسجيل التعليق الصوتي الذكي وتجهيز مشاهد 1080×1920 بدقة تيك توك الكاملة (يستغرق نحو 20–35 ثانية).
            </p>
          </div>
        ) : assets.length === 0 ? (
          <div className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-5 text-center space-y-3">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              لم تُنشأ الفيديوهات الافتتاحية بعد
            </p>
            <button
              type="button"
              onClick={handleBootstrapStarterVideos}
              disabled={bootstrapping}
              className="min-h-[44px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>إنشاء الفيديوهات الـ 3 بالصوت العربي الآن</span>
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {assets.map((asset) => {
              const isOpen = activePreviewId === asset.id;
              return (
                <li
                  key={asset.id}
                  className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800 p-3.5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {asset.title}
                      </h4>
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                        {asset.durationSec} ثانية · {asset.resolution} · {formatBytesMb(asset.videoSizeBytes)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActivePreviewId(isOpen ? null : asset.id)}
                      className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:border-orange-500/50 text-xs font-bold text-slate-800 dark:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-orange-500" aria-hidden="true" />
                      <span>{isOpen ? "إخفاء المعاينة" : "تشغيل المعاينة"}</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {asset.description}
                  </p>

                  {isOpen && (
                    <div className="space-y-2.5 pt-1">
                      <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex justify-center">
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          poster={fileUrl(asset.posterFile)}
                          src={fileUrl(asset.videoFile)}
                          className="w-full max-w-[230px] max-h-[360px] object-contain"
                        />
                      </div>
                      <div className="flex items-center gap-2 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-800 px-3 py-2">
                        <Volume2 className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                        <audio controls src={fileUrl(asset.audioFile)} className="w-full h-8" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <a
                      href={fileUrl(asset.videoFile, true)}
                      download={asset.videoFile}
                      className="min-h-[42px] px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>تحميل الفيديو MP4</span>
                    </a>

                    <a
                      href={fileUrl(asset.audioFile, true)}
                      download={asset.audioFile}
                      className="min-h-[42px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>تحميل الصوت WAV</span>
                    </a>

                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          asset.tiktokCaption,
                          `cap-${asset.id}`,
                          "تم نسخ وصف الفيديو والهاشتاغات لتيك توك"
                        )
                      }
                      className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 hover:border-orange-500/50 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedKey === `cap-${asset.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>نسخ وصف تيك توك</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. Custom Video Generator Form */}
      {showBuilder && (
        <form
          onSubmit={handleGenerateCustom}
          className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-orange-500/35 p-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
              تعديل وإنتاج فيديو جديد مخصص
            </h4>
            {presets.length > 0 && (
              <div className="flex items-center gap-1">
                {presets.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => loadPresetIntoBuilder(p)}
                    className="min-h-[30px] px-2 rounded-lg bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:border-orange-500 cursor-pointer"
                  >
                    قالب {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label htmlFor="promo-custom-title" className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                عنوان الفيديو
              </label>
              <input
                id="promo-custom-title"
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-700 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="space-y-1">
              <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                نبرة الصوت العربي
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setCustomTone("calm")}
                  className={`min-h-[42px] rounded-xl border text-xs font-bold cursor-pointer ${
                    customTone === "calm"
                      ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                      : "bg-white dark:bg-[#131D31] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  هادئ وواضح
                </button>
                <button
                  type="button"
                  onClick={() => setCustomTone("energetic")}
                  className={`min-h-[42px] rounded-xl border text-xs font-bold cursor-pointer ${
                    customTone === "energetic"
                      ? "bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300"
                      : "bg-white dark:bg-[#131D31] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  }`}
                >
                  حماسي سريع
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pl-1">
            {customScenes.map((scene, idx) => (
              <div
                key={idx}
                className="rounded-xl bg-white dark:bg-[#131D31] border border-slate-200 dark:border-slate-800 p-3 space-y-2"
              >
                <div className="text-[11px] font-extrabold text-orange-600 dark:text-orange-400">
                  المشهد {idx + 1} · {scene.badge}
                </div>
                <input
                  type="text"
                  value={scene.title}
                  onChange={(e) => updateSceneField(idx, "title", e.target.value)}
                  placeholder="العنوان الكبير على الشاشة"
                  className="w-full min-h-[38px] rounded-lg bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-orange-500"
                />
                <textarea
                  rows={2}
                  value={scene.voiceText}
                  onChange={(e) => updateSceneField(idx, "voiceText", e.target.value)}
                  placeholder="النص الذي سيُنطق بالصوت العربي في هذا المشهد"
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 p-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={generatingCustom}
            className="w-full min-h-[46px] px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-55 text-white text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer"
          >
            {generatingCustom ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تسجيل الصوت وإنتاج الفيديو MP4...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>إنتاج الفيديو والصوت العربي الآن</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
