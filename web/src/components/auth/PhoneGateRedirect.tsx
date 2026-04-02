"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/lib/api-client";

/**
 * Mini App ko‘pincha to‘g‘ridan-to‘g‘ri /client/* yoki /worker/* da ochiladi;
 * BootClient (/) o‘tkazib ketadi va telefon bosqichi chiqmaydi. Telefon bo‘lmasa —
 * bosh sahifaga yuboramiz, u yerda ulash yoki «keyinroq» tanlanadi.
 */
export function PhoneGateRedirect() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const me = await apiJson<{ user: { phone?: string | null } }>("/api/me");
      if (!me.ok || !me.data?.user) return;
      const phone = me.data.user.phone;
      if (phone != null && String(phone).trim() !== "") return;
      router.replace("/");
    })();
  }, [router]);

  return null;
}
