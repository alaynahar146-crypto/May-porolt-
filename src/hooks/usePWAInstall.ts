import { useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __sallahliDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

export type InstallOutcome =
  | "accepted"
  | "dismissed"
  | "ios"
  | "in-app"
  | "chrome-guide";

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window === "undefined") return null;
    return window.__sallahliDeferredPrompt || null;
  });

  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });

  const [isIos, setIsIos] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isTopWindow, setIsTopWindow] = useState(true);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const iosDevice =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const androidDevice = /Android/i.test(ua);
    const inApp =
      /FBAN|FBAV|FB_IAB|Instagram|TikTok|BytedanceWebview|musical_ly|Snapchat|Line\/|MicroMessenger|Pinterest/i.test(
        ua
      ) ||
      (androidDevice && /\bwv\b/i.test(ua));

    setIsIos(iosDevice);
    setIsAndroid(androidDevice);
    setIsInAppBrowser(inApp);
    try {
      setIsTopWindow(window.self === window.top);
    } catch {
      setIsTopWindow(false);
    }

    if (window.__sallahliDeferredPrompt) {
      setDeferredPrompt(window.__sallahliDeferredPrompt);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__sallahliDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.__sallahliDeferredPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<InstallOutcome> {
    const activePrompt = deferredPrompt || window.__sallahliDeferredPrompt || null;
    if (activePrompt) {
      await activePrompt.prompt();
      const { outcome } = await activePrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        window.__sallahliDeferredPrompt = null;
        setIsInstalled(true);
      }
      return outcome;
    }

    if (isInAppBrowser) {
      return "in-app";
    }
    if (isIos && !isInstalled) {
      return "ios";
    }
    return "chrome-guide";
  }

  return {
    canInstall: !isInstalled,
    hasNativePrompt: Boolean(deferredPrompt),
    isInstalled,
    isIos,
    isAndroid,
    isInAppBrowser,
    isTopWindow,
    promptInstall,
  };
}
