import dynamic from "next/dynamic";

const BootClient = dynamic(
  () => import("@/components/auth/BootClient").then((m) => m.BootClient),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[#070a12] px-6">
        <div className="h-10 w-10 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
        <p className="mt-4 text-sm text-white/60">Usta Call yuklanmoqda…</p>
      </div>
    ),
  }
);

export default function Home() {
  return <BootClient />;
}
