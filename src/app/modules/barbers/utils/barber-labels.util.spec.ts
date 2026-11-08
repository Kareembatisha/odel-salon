import { describe, expect, it } from "vitest";
import { localizedBranchName, localizedName } from "./barber-labels.util";

describe("barber labels", () => {
  const both = { branchNameAr: "مدينة نصر", branchNameEn: "Nasr City" };

  it("picks the branch name for the active language", () => {
    expect(localizedBranchName(both, "ar")).toBe("مدينة نصر");
    expect(localizedBranchName(both, "en")).toBe("Nasr City");
  });

  it("falls back to the other language when one name is empty", () => {
    expect(localizedBranchName({ branchNameAr: "", branchNameEn: "Nasr City" }, "ar")).toBe(
      "Nasr City",
    );
    expect(localizedBranchName({ branchNameAr: "مدينة نصر", branchNameEn: "" }, "en")).toBe(
      "مدينة نصر",
    );
  });

  it("picks nameAr / nameEn for dropdown options", () => {
    expect(localizedName({ nameAr: "فرع", nameEn: "Branch" }, "ar")).toBe("فرع");
    expect(localizedName({ nameAr: "", nameEn: "Branch" }, "ar")).toBe("Branch");
  });
});
