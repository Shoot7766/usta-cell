export function hapticLight() {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: string) => void } } };
  };
  try {
    w.Telegram?.WebApp?.HapticFeedback?.impactOccurred("light");
  } catch {
    /* noop */
  }
}

export function hapticSuccess() {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    Telegram?: { WebApp?: { HapticFeedback?: { notificationOccurred: (s: string) => void } } };
  };
  try {
    w.Telegram?.WebApp?.HapticFeedback?.notificationOccurred("success");
  } catch {
    /* noop */
  }
}
