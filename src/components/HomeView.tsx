import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Lock,
  Mic,
  Search,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { CATEGORIES, FREE_LIMIT } from "../constants";
import type { CategoryId, HistoryEntry, MediaAudio, MediaImage } from "../types";
import { blobToBase64, compressImageFile, encodeBlobToWav16k } from "../utils/audio";
import { formatArabicDate, getCategory } from "../utils/format";
import { CategoryIcon } from "./CategoryIcon";

interface HomeViewProps {
  selectedCat: CategoryId | "";
  onSelectCat: (cat: CategoryId) => void;
  description: string;
  onChangeDescription: (val: string) => void;
  image: MediaImage | null;
  onChangeImage: (img: MediaImage | null) => void;
  audio: MediaAudio | null;
  onChangeAudio: (aud: MediaAudio | null) => void;
  isPro: boolean;
  hasActivePlan: boolean;
  usedFree: number;
  isSubmitting: boolean;
  rejectionAlert: {
    reason: string;
    detectedSubject?: string;
    detectedCategory?: CategoryId;
    rejectionCode?: string;
    rejectionSource?: "image" | "audio" | "text";
  } | null;
  onDismissRejection: () => void;
  recentHistory: HistoryEntry[];
  onDiagnose: () => void;
  onOpenPlans: () => void;
  onOpenHistoryItem: (entry: HistoryEntry) => void;
  onToast: (msg: string) => void;
}

export function HomeView({
  selectedCat,
  onSelectCat,
  description,
  onChangeDescription,
  image,
  onChangeImage,
  audio,
  onChangeAudio,
  isPro,
  hasActivePlan,
  usedFree,
  isSubmitting,
  rejectionAlert,
  onDismissRejection,
  recentHistory,
  onDiagnose,
  onOpenPlans,
  onOpenHistoryItem,
  onToast,
}: HomeViewProps) {
  const camInputRef = useRef<HTMLInputElement>(null);
  const galInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rejectionRef = useRef<HTMLDivElement>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<number>(0);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);

  const remainingFree = Math.max(0, FREE_LIMIT - usedFree);
  const activeCategory = selectedCat ? getCategory(selectedCat) : null;

  useEffect(() => {
    if (rejectionAlert) {
      rejectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [rejectionAlert]);

  useEffect(() => {
    return () => {
      cleanupRecorder();
    };
  }, []);

  function cleanupRecorder() {
    window.clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      onChangeImage(compressed);
    } catch {
      onToast("تعذّر قراءة الصورة، جرّب صورة أخرى");
    }
  }

  function drawWaveform(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#F97316";
      const barCount = 40;
      const barWidth = canvas.width / barCount;
      for (let i = 0; i < barCount; i++) {
        const val = data[i * 2] || 0;
        const height = Math.max(4, (val / 255) * canvas.height);
        ctx.fillRect(i * barWidth + 2, (canvas.height - height) / 2, barWidth - 4, height);
      }
    };
    tick();
  }

  async function startRecording() {
    if (!isPro) {
      onToast("التسجيل الصوتي لمشتركي الباقة الاحترافية والسنوية");
      onOpenPlans();
      return;
    }
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const chunks: Blob[] = [];
      chunksRef.current = chunks;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;

      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const playbackUrl = URL.createObjectURL(blob);
        try {
          const wavBlob = await encodeBlobToWav16k(blob);
          const base64 = await blobToBase64(wavBlob);
          onChangeAudio({ mime: "audio/wav", data: base64, playbackUrl });
        } catch {
          URL.revokeObjectURL(playbackUrl);
          onToast("تعذّرت معالجة التسجيل الصوتي، أعد المحاولة");
        }
      };

      rec.start();
      setIsRecording(true);
      setRecSeconds(0);

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const actx = new AudioCtx();
      audioCtxRef.current = actx;
      const analyser = actx.createAnalyser();
      analyser.fftSize = 128;
      actx.createMediaStreamSource(stream).connect(analyser);
      drawWaveform(analyser);

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setRecSeconds(elapsed);
        if (elapsed >= 60) {
          stopRecording();
        }
      }, 250);
    } catch {
      onToast("تعذّر الوصول إلى الميكروفون");
      cleanupRecorder();
      setIsRecording(false);
    }
  }

  function stopRecording() {
    window.clearInterval(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setIsRecording(false);
  }

  function removeAudio() {
    if (audio?.playbackUrl) {
      URL.revokeObjectURL(audio.playbackUrl);
    }
    onChangeAudio(null);
  }

  const formattedRecTime = `${String(Math.floor(recSeconds / 60)).padStart(2, "0")}:${String(recSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-5">
        <section aria-labelledby="cat-heading">
          <div className="flex items-baseline justify-between mb-3">
            <h1 id="cat-heading" className="text-lg lg:text-xl font-extrabold text-slate-900 dark:text-white">
              ما نوع العطل؟
            </h1>
            <span className="text-xs text-slate-500 dark:text-slate-400">اختياري — أو نحدده تلقائياً</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {CATEGORIES.map((c) => {
              const active = selectedCat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCat(c.id)}
                  className={`group min-h-[78px] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 text-center border transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer ${
                    active
                      ? "bg-orange-500/10 border-orange-500 ring-1 ring-orange-500/25 text-orange-700 dark:text-orange-300 shadow-sm"
                      : "bg-white dark:bg-[#131D31] border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm"
                  }`}
                >
                  <CategoryIcon
                    id={c.id}
                    className={`w-6 h-6 transition-transform duration-300 group-hover:scale-105 ${active ? "text-orange-600 dark:text-orange-400" : "text-slate-600 dark:text-slate-300"}`}
                  />
                  <span className="text-xs sm:text-sm font-bold leading-tight">{c.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="desc-heading"
          className="animate-card-enter stagger-1 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="desc-heading" className="text-base font-extrabold text-slate-900 dark:text-white">
              صف المشكلة أو أرفق صورة
            </h2>
            <span className="text-xs font-mono-num text-slate-400 tabular-nums">
              {description.length}/1500
            </span>
          </div>

          <textarea
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
            maxLength={1500}
            rows={4}
            placeholder="مثال: لدي مكثف خاسر، أو المكيف يشتغل لكن ما يبرّد..."
            className="w-full rounded-xl bg-slate-50/90 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700/80 p-3.5 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 transition-colors duration-300 resize-y"
          />

          {activeCategory && !description && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                أمثلة سريعة لـ {activeCategory.name}:
              </p>
              <div className="flex flex-wrap gap-2">
                {activeCategory.samplePrompts.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => onChangeDescription(sample)}
                    className="text-right text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300 transition-colors cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => camInputRef.current?.click()}
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer"
            >
              <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>الكاميرا</span>
            </button>

            <button
              type="button"
              onClick={() => galInputRef.current?.click()}
              className="min-h-[46px] px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>المعرض</span>
            </button>

            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`min-h-[46px] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-300 ease-out active:scale-[0.98] cursor-pointer ${
                isRecording
                  ? "bg-red-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100"
              }`}
            >
              {isRecording ? (
                <>
                  <Square className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>إيقاف</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>صوت</span>
                  {!isPro && <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />}
                </>
              )}
            </button>
          </div>

          <input
            ref={camInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={galInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {image && (
            <div className="animate-card-enter relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900">
              <img
                src={image.previewUrl}
                alt="صورة العطل المرفقة"
                referrerPolicy="no-referrer"
                className="w-full max-h-60 object-cover block"
              />
              <button
                type="button"
                onClick={() => onChangeImage(null)}
                aria-label="حذف الصورة"
                className="absolute top-2.5 start-2.5 min-h-[36px] min-w-[36px] rounded-full bg-slate-900/75 text-white flex items-center justify-center hover:bg-slate-900 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {isRecording && (
            <div className="animate-card-enter rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-orange-500/40 p-3 space-y-2">
              <canvas ref={canvasRef} width={480} height={56} className="w-full h-14 rounded-lg" />
              <div className="flex items-center justify-between">
                <span className="font-mono-num text-sm font-bold text-orange-600 dark:text-orange-400">
                  {formattedRecTime} / 01:00
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="min-h-[40px] px-4 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>إيقاف التسجيل</span>
                </button>
              </div>
            </div>
          )}

          {audio && !isRecording && (
            <div className="animate-card-enter rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <audio src={audio.playbackUrl} controls className="w-full" />
              <button
                type="button"
                onClick={removeAudio}
                className="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف التسجيل الصوتي</span>
              </button>
            </div>
          )}
        </section>

        {rejectionAlert && (
          <div
            ref={rejectionRef}
            role="alert"
            className="animate-card-enter rounded-2xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-300/90 dark:border-amber-800 p-4 space-y-3 text-amber-950 dark:text-amber-100"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-1 text-xs sm:text-sm leading-relaxed">
                  <p className="font-extrabold">
                    {rejectionAlert.rejectionSource === "audio"
                      ? "تم رفض التسجيل الصوتي (لم يتم خصم أي محاولة):"
                      : rejectionAlert.rejectionSource === "image"
                      ? "تم رفض الصورة المرفقة (لم يتم خصم أي محاولة):"
                      : "تم رفض التحليل (لم يتم خصم أي محاولة):"}
                  </p>
                  {rejectionAlert.detectedSubject && (
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      {rejectionAlert.rejectionSource === "audio"
                        ? "ما سُمع في التسجيل: "
                        : rejectionAlert.rejectionSource === "image"
                        ? "هوية الصورة المرصودة: "
                        : "المحتوى المرصود: "}
                      {rejectionAlert.detectedSubject}
                    </p>
                  )}
                  <p>{rejectionAlert.reason}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onDismissRejection}
                aria-label="إغلاق التنبيه"
                className="min-h-[32px] min-w-[32px] rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(rejectionAlert.detectedCategory || image || audio) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {rejectionAlert.detectedCategory &&
                  rejectionAlert.detectedCategory !== selectedCat && (
                    <button
                      type="button"
                      onClick={() => onSelectCat(rejectionAlert.detectedCategory!)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-colors cursor-pointer"
                    >
                      تبديل الفئة إلى «{getCategory(rejectionAlert.detectedCategory).name}»
                    </button>
                  )}
                {image && rejectionAlert.rejectionSource !== "audio" && (
                  <button
                    type="button"
                    onClick={() => onChangeImage(null)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#0B1220] border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    {description.trim()
                      ? "إزالة الصورة والاعتماد على الوصف"
                      : "إزالة هذه الصورة"}
                  </button>
                )}
                {audio && rejectionAlert.rejectionSource === "audio" && (
                  <button
                    type="button"
                    onClick={removeAudio}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#0B1220] border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                  >
                    {description.trim() || image
                      ? "إزالة التسجيل الصوتي والمتابعة"
                      : "إزالة هذا التسجيل"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onDiagnose}
            className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-base sm:text-lg font-extrabold flex items-center justify-center gap-2.5 shadow-md shadow-orange-500/20 hover:shadow-lg hover:shadow-orange-500/25 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-300 ease-out cursor-pointer"
          >
            <Search className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>افحص العطل بالذكاء الاصطناعي</span>
          </button>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            بدون تسجيل وبدون أي بيانات شخصية · التقديرات إرشادية وفق السوق الموريتاني
          </p>
        </div>
      </div>

      <aside className="lg:col-span-5 space-y-4">
        <div className="animate-card-enter stagger-2 bg-[#121C30] text-white rounded-2xl p-5 sm:p-6 border border-slate-800/80 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-orange-400">دليل الصيانة في موريتانيا</p>
            <h2 className="text-lg sm:text-xl font-extrabold leading-snug text-balance">
              اعرف سبب العطل والسعر العادل قبل استدعاء الفني
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              صوّر العطل أو صفه، فيشرح لك الذكاء الاصطناعي السبب المحتمل، وخطوات الفحص الآمن، وتكلفة القطع واليد العاملة بالأوقية الجديدة والقديمة.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-2.5 pt-2 border-t border-slate-800/90 text-sm">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0 mt-1" aria-hidden="true" />
              <span className="text-slate-200">مدقق تسعيرة الفني: أدخل السعر الذي طلبه الفني لتكتشف فوراً هل هو عادل أم مبالغ فيه</span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0 mt-1" aria-hidden="true" />
              <span className="text-slate-200">متابعة تفاعلية داخل الفحص + تسعير بأسواق نواكشوط ونواذيبو (جديدة وقديمة)</span>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-orange-400 shrink-0 mt-1" aria-hidden="true" />
              <span className="text-slate-200">
                {hasActivePlan
                  ? "اشتراكك مفعل — استمتع بفحوصات ومدقق تسعيرة غير محدود"
                  : `لديك ${remainingFree} من أصل ${FREE_LIMIT} فحوصات مجانية بدون تسجيل`}
              </span>
            </div>
          </div>

          {!hasActivePlan && (
            <button
              type="button"
              onClick={onOpenPlans}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold flex items-center justify-between transition-all duration-300 active:scale-[0.985] cursor-pointer"
            >
              <span>استكشف باقات صلاح لي (ابتداءً من 100 أوقية جديدة)</span>
              <ArrowLeft className="w-4 h-4 text-orange-400 shrink-0" />
            </button>
          )}
        </div>

        {recentHistory.length > 0 && (
          <div className="animate-card-enter stagger-3 bg-white dark:bg-[#131D31] border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm shadow-slate-900/[0.02] dark:shadow-black/20">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">أحدث الفحوصات المحفوظة</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentHistory.slice(0, 3).map((item) => {
                const c = getCategory(item.cat);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenHistoryItem(item)}
                    className="w-full py-2.5 px-2 -mx-2 first:mt-0 rounded-xl text-right flex items-start justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors duration-200 cursor-pointer"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{c.name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatArabicDate(item.ts)}</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 truncate">
                        {item.res.diagnosis}
                      </p>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
