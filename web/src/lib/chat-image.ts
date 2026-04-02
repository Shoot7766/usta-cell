import type { SupabaseClient } from "@supabase/supabase-js";

/** Faqat o‘sha foydalanuvchi chat papkasidagi yo‘l. */
export function safeChatImageStoragePath(
  imagePath: string | undefined,
  userId: string
): string | null {
  if (!imagePath?.trim()) return null;
  const p = imagePath.replace(/^\/+/, "").trim();
  if (p.includes("..") || p.length > 512) return null;
  if (!p.startsWith(`${userId}/`)) return null;
  return p;
}

export async function chatImagePathToDataUrl(
  sb: SupabaseClient,
  imagePath: string,
  userId: string
): Promise<string | null> {
  const normalized = imagePath.replace(/^\/+/, "");
  if (!normalized.startsWith(`${userId}/`)) {
    return null;
  }
  if (normalized.includes("..") || normalized.length > 512) {
    return null;
  }
  const { data, error } = await sb.storage.from("usta_chat").download(normalized);
  if (error || !data) {
    return null;
  }
  const ab = await data.arrayBuffer();
  const buf = Buffer.from(ab);
  const mime = normalized.endsWith(".png")
    ? "image/png"
    : normalized.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
