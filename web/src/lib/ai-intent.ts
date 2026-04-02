/**
 * Aniq ta’mirlash / xizmat so‘rovi — ortiqcha savollarsiz ustalar ro‘yxatiga yo‘naltirish.
 */
export function isLikelyClearServiceIntent(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /rozetka|розетк|socket|vilka|vilka|elektr|sim\s|simni|lamp|chiroq|svet|switch|avtomat/,
    /santex|suv\s|quvur|kran|hojat|kanalizatsiya|unitaz/,
    /plita|gaz|pech|kondits|klimat|ventilyatsiya/,
    /eshik|qulf|oyna|shisha|ta['']mir|ремонт|o‘rnat|montaj/,
    /kabel|transform|schetchik|schetchik|elektrik/,
  ];
  return patterns.some((r) => r.test(t)) && t.length >= 8;
}
