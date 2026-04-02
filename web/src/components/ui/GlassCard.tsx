"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { hapticLight } from "@/lib/haptic";

type Props = HTMLMotionProps<"div"> & { glow?: boolean };

export function GlassCard({ className = "", glow, onPointerDown, ...rest }: Props) {
  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={`glass-panel rounded-2xl ${glow ? "neon-ring" : ""} ${className}`}
      onPointerDown={(e) => {
        hapticLight();
        onPointerDown?.(e);
      }}
      {...rest}
    />
  );
}
