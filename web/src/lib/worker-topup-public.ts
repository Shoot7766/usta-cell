/** Karta rekvizitlari (mijozga ko‘rsatish uchun — ochiq ma’lumot). */
export function getWorkerTopupCardDisplay(): { number: string; holder: string } {
  const number = (process.env.NEXT_PUBLIC_WORKER_TOPUP_CARD || "8600 0204 1894 8647").trim();
  const holder = (process.env.NEXT_PUBLIC_WORKER_TOPUP_HOLDER || "Salomov Shaxboz").trim();
  return { number, holder };
}
