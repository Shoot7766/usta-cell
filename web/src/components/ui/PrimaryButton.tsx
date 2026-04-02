"use client";

import { motion } from "framer-motion";
import { hapticLight } from "@/lib/haptic";

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className = "",
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const base =
    variant === "primary"
      ? "bg-gradient-to-r from-cyan-400/90 to-fuchsia-500/90 text-slate-950 shadow-lg shadow-cyan-500/20"
      : "bg-white/5 text-white border border-white/10";
  return (
    <motion.button
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          hapticLight();
          onClick?.();
        }
      }}
      className={`w-full rounded-2xl px-4 py-3.5 text-[15px] font-semibold disabled:opacity-40 ${base} ${className}`}
    >
      {children}
    </motion.button>
  );
}
