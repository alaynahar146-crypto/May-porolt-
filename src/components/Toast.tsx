import { AnimatePresence, motion } from "motion/react";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-20 lg:bottom-6 inset-x-4 mx-auto max-w-md z-50 rounded-2xl bg-[#142036]/95 dark:bg-slate-800/95 backdrop-blur-md text-slate-50 border border-slate-700/80 px-4 py-3 text-center text-sm font-bold shadow-xl"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
