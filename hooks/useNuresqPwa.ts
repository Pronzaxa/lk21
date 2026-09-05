"use client";

import { useEffect, useState } from "react";

export function useNuresqPwa() {
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", beforeInstall);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return false;
    const promptEvent = installPrompt as Event & { prompt: () => Promise<void> };
    await promptEvent.prompt();
    setInstallPrompt(null);
    return true;
  };

  return { canInstall: Boolean(installPrompt), install };
}
