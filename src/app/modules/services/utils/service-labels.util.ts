/** Picks the Arabic or English name for the current UI language. */
export function localizedName(nameAr: string, nameEn: string, lang: string): string {
  return lang === "ar" ? nameAr : nameEn;
}
