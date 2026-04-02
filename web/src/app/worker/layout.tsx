"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { PhoneGateRedirect } from "@/components/auth/PhoneGateRedirect";
import { AdminTelegramFab } from "@/components/support/AdminTelegramFab";

const tabs = [
  { href: "/worker", label: "Inbox" },
  { href: "/worker/orders", label: "Buyurtmalar" },
  { href: "/worker/profile", label: "Profil" },
];

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh pb-24">
      <PhoneGateRedirect />
      <AdminTelegramFab />
      {children}
      <nav className="fixed bottom-0 inset-x-0 z-40 safe-pb">
        <div className="mx-3 mb-3 glass-panel rounded-2xl px-2 py-2 flex justify-around">
          {tabs.map((t) => {
            const active =
              t.href === "/worker"
                ? pathname === "/worker"
                : pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className="relative flex-1 text-center py-2">
                {active && (
                  <motion.span
                    layoutId="wtab"
                    className="absolute inset-1 rounded-xl bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 border border-white/10"
                  />
                )}
                <span
                  className={`relative text-[13px] font-semibold ${
                    active ? "text-white" : "text-white/45"
                  }`}
                >
                  {t.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
