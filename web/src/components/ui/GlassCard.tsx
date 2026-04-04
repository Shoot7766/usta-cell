"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { haptic } from "@/lib/haptic";

type Props = HTMLMotionProps<"div"> & { glow?: boolean };

export function GlassCard({ className = "", glow, onPointerDown, ...rest }: Props) {
  return (
    <motion.div
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 450, damping: 25 }}
      className={`relative overflow-hidden backdrop-blur-xl bg-white/[0.03] border border-white/[0.08] shadow-2xl rounded-2xl ${
        glow ? "ring-1 ring-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.15)]" : ""
      } ${className}`}
      onPointerDown={(e) => {
        haptic.impact("light");
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}
