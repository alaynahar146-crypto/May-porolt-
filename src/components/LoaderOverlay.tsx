import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Wrench } from "lucide-react";
import { LOADING_MESSAGES } from "../constants";

interface LoaderOverlayProps {
  visible: boolean;
}

export function LoaderOverlay({ visible }: LoaderOverlayProps) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!visible) {
      setMsgIndex(0);
      return;
    }
    const iv = window.setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => window.clearInterval(iv);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-50 bg-[#0D1524]/90 backdrop-blur-md text-slate-100 flex flex-col items-center justify-center text-center px-6 gap-6"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-24 h-24 flex items-center justify-center"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-orange-500/15 animate-soft-breath"
            />
            <span
              aria-hidden="true"
              className="absolute inset-2 rounded-full border-2 border-orange-400/20 border-t-orange-400 animate-slow-orbit"
            />
            <div className="w-14 h-14 rounded-2xl bg-[#162136] border border-slate-700/80 flex items-center justify-center shadow-lg">
              <Wrench className="w-6 h-6 text-orange-400" aria-hidden="true" />
            </div>
          </motion.div>

          <div className="space-y-1.5 max-w-md min-h-[3.5rem]">
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIndex}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                className="text-base sm:text-lg font-bold text-slate-100 leading-relaxed"
              >
                {LOADING_MESSAGES[msgIndex]}
              </motion.p>
            </AnimatePresence>
            <p className="text-xs text-slate-400">
              فحص مريح ودقيق — ثوانٍ معدودة
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
