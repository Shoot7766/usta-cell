function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Brauzerda yangi varaqda ochiladi — «Chop etish» orqali PDF sifatida saqlash mumkin. */
export function openPrintableContract(opts: {
  orderId: string;
  subjectLine: string;
  priceCents: number;
  address?: string;
  workerName?: string;
  signedAt?: string;
}): void {
  const priceStr = `${opts.priceCents.toLocaleString("uz-UZ")} so‘m`;
  const when = opts.signedAt ?? new Date().toLocaleString("uz-UZ");
  const html = `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Kelishuv — Usta Call</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 16px; color: #111; line-height: 1.5; }
    h1 { font-size: 1.25rem; border-bottom: 2px solid #333; padding-bottom: 8px; }
    .row { margin: 12px 0; }
    .label { font-size: 0.75rem; text-transform: uppercase; color: #555; }
    .muted { font-size: 0.85rem; color: #444; margin-top: 24px; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>Usta Call — qisqa kelishuv</h1>
  <div class="row"><span class="label">Buyurtma ID</span><br/><strong>${esc(opts.orderId)}</strong></div>
  <div class="row"><span class="label">Ish / so‘rov</span><br/>${esc(opts.subjectLine || "—")}</div>
  ${opts.workerName ? `<div class="row"><span class="label">Usta</span><br/>${esc(opts.workerName)}</div>` : ""}
  ${opts.address ? `<div class="row"><span class="label">Manzil</span><br/>${esc(opts.address)}</div>` : ""}
  <div class="row"><span class="label">Kelishilgan narx</span><br/><strong>${esc(priceStr)}</strong></div>
  <div class="row"><span class="label">Sana</span><br/>${esc(when)}</div>
  <p class="muted">Tomonlar telefon orqali kelishgan. To‘lov ish yakunlangach platforma hamyoni bo‘yicha amalga oshiriladi.</p>
  <p style="margin-top:20px"><button type="button" onclick="window.print()" style="padding:10px 18px;font-size:14px;cursor:pointer;border-radius:8px;border:1px solid #333;background:#f4f4f4">Chop etish / PDF sifatida saqlash</button></p>
</body>
</html>`;
  try {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) {
      w.addEventListener("load", () => {
        try {
          w.focus();
        } catch {
          /* */
        }
      });
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    window.alert("Chop etish oynasini ochib bo‘lmadi. Brauzer sozlamalarini tekshiring.");
  }
}
