type HapticImpact = "light" | "medium" | "heavy" | "rigid" | "soft";
type HapticNotification = "error" | "success" | "warning";

/**
 * Telegram Haptic Feedback utility
 */
export const haptic = {
  impact: (style: HapticImpact = "medium") => {
    if (typeof window === "undefined") return;
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch (e) {
      console.warn("Haptic impact failed", e);
    }
  },
  notification: (type: HapticNotification) => {
    if (typeof window === "undefined") return;
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
    } catch (e) {
      console.warn("Haptic notification failed", e);
    }
  },
  selection: () => {
    if (typeof window === "undefined") return;
    try {
      (window as any).Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    } catch (e) {
      console.warn("Haptic selection failed", e);
    }
  },
};

// Backward compatibility or quick access
export const hapticLight = () => haptic.impact("light");
export const hapticMedium = () => haptic.impact("medium");
export const hapticSuccess = () => haptic.notification("success");
export const hapticError = () => haptic.notification("error");
export const hapticWarning = () => haptic.notification("warning");
export const hapticSelection = () => haptic.selection();
