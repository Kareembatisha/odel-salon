/** Anything that carries both branch names (list rows, details). */
export interface BranchNamed {
  branchNameAr: string;
  branchNameEn: string;
}

/** Pick the branch name for the active UI language, falling back to the other one if it is empty. */
export function localizedBranchName(item: BranchNamed, lang: string): string {
  return lang === "ar"
    ? item.branchNameAr || item.branchNameEn
    : item.branchNameEn || item.branchNameAr;
}

/** Pick `nameAr` / `nameEn` for the active UI language (branch dropdown options). */
export function localizedName(item: { nameAr: string; nameEn: string }, lang: string): string {
  return lang === "ar" ? item.nameAr || item.nameEn : item.nameEn || item.nameAr;
}
