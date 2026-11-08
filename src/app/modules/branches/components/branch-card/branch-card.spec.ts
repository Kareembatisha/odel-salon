import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LanguageService } from "@core/services/language.service";
import { BranchListItem } from "../../model/branch.model";
import { BranchCard } from "./branch-card";

const BRANCH: BranchListItem = {
  id: 3,
  nameAr: "مدينة نصر",
  nameEn: "Nasr City",
  address: "12 Abbas El Akkad St",
  phone: "+201001102194",
  allowsRegular: true,
  allowsVip: true,
  allowsHome: false,
  isVisible: true,
  barbersCount: 6,
  regularChairsCount: 4,
  vipChairsCount: 2,
};

describe("BranchCard", () => {
  let fixture: ComponentFixture<BranchCard>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";

  function render(
    branch: Partial<BranchListItem> = {},
    inputs: { canEdit?: boolean; canDelete?: boolean } = {},
  ) {
    fixture = TestBed.createComponent(BranchCard);
    fixture.componentRef.setInput("branch", { ...BRANCH, ...branch });
    fixture.componentRef.setInput("canEdit", inputs.canEdit ?? false);
    fixture.componentRef.setInput("canDelete", inputs.canDelete ?? false);
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BranchCard, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
  });

  afterEach(() => localStorage.clear());

  describe("content", () => {
    it("shows the name, address, phone and the three totals", () => {
      render();

      expect(text()).toContain("Nasr City");
      expect(text()).toContain("12 Abbas El Akkad St");
      expect(el().querySelector(".branch__info .u-num")?.textContent).toContain("+201001102194");
      expect(text()).toMatch(/6\s*BRANCHES\.COUNT\.BARBERS/);
      expect(text()).toMatch(/4\s*BRANCHES\.COUNT\.REGULAR_CHAIRS/);
      expect(text()).toMatch(/2\s*BRANCHES\.COUNT\.VIP_CHAIRS/);
    });

    it("keeps the phone number left-to-right", () => {
      render();
      expect(el().querySelector(".branch__info .u-num")?.getAttribute("dir")).toBe("ltr");
    });

    it("leads with the English name and puts Arabic second in English", () => {
      render();

      expect(el().querySelector("h3")?.textContent).toContain("Nasr City");
      expect(el().querySelector(".branch__alt")?.textContent).toContain("مدينة نصر");
      expect(el().querySelector(".branch__alt")?.getAttribute("lang")).toBe("ar");
    });

    it("leads with the Arabic name and puts English second in Arabic", () => {
      TestBed.inject(LanguageService).setLang("ar");
      render();

      expect(el().querySelector("h3")?.textContent).toContain("مدينة نصر");
      expect(el().querySelector("h3")?.getAttribute("lang")).toBe("ar");
      expect(el().querySelector(".branch__alt")?.textContent).toContain("Nasr City");
    });

    it("shows a badge only for the enabled booking types", () => {
      render({ allowsRegular: false, allowsVip: true, allowsHome: true });
      const types = el().querySelector(".branch__types")?.textContent ?? "";

      expect(types).not.toContain("BRANCHES.TYPE.REGULAR");
      expect(types).toContain("BRANCHES.TYPE.VIP");
      expect(types).toContain("BRANCHES.TYPE.HOME");
    });

    it("shows a dash when no booking type is enabled", () => {
      render({ allowsRegular: false, allowsVip: false, allowsHome: false });
      expect(el().querySelector(".branch__none")?.textContent).toBe("—");
    });

    it("shows a success badge for a visible branch and a neutral one for a hidden branch", () => {
      render({ isVisible: true });
      expect(el().querySelector(".branch__head .badge--success")).not.toBeNull();

      render({ isVisible: false });
      expect(el().querySelector(".branch__head .badge--neutral")).not.toBeNull();
      expect(el().querySelector(".branch__head")?.textContent).toContain("BRANCHES.STATUS.HIDDEN");
    });
  });

  describe("permissions are decided by the page", () => {
    it("renders no footer without edit or delete rights", () => {
      render();
      expect(el().querySelector(".branch__footer")).toBeNull();
    });

    it("renders only the switch and the edit button with canEdit", () => {
      render({}, { canEdit: true });

      expect(el().querySelector("app-switch")).not.toBeNull();
      expect(el().querySelectorAll(".branch__actions button").length).toBe(1);
    });

    it("renders only the delete button with canDelete", () => {
      render({}, { canDelete: true });

      expect(el().querySelector("app-switch")).toBeNull();
      expect(el().querySelectorAll(".branch__actions button").length).toBe(1);
    });
  });

  describe("visibility switch", () => {
    it("has a visible label, so the user knows what the switch does", () => {
      render({}, { canEdit: true });

      expect(el().querySelector(".branch__visibility-text")?.textContent).toContain(
        "BRANCHES.SHOW_IN_APP",
      );
      expect(el().querySelector("app-switch button")?.getAttribute("aria-label")).toBe(
        "BRANCHES.SHOW_IN_APP",
      );
    });

    it("explains the effect in a tooltip", () => {
      render({}, { canEdit: true });

      expect(el().querySelector(".branch__visibility")?.getAttribute("title")).toBe(
        "BRANCHES.VISIBILITY_HINT",
      );
    });

    it("clicking the label text flips the switch too", () => {
      render({}, { canEdit: true });
      const seen: number[] = [];
      fixture.componentInstance.toggleStatus.subscribe((b) => seen.push(b.id));

      (el().querySelector(".branch__visibility-text") as HTMLElement).click();

      expect(seen).toEqual([3]);
    });

    it("is disabled while a mutation is running", () => {
      render({}, { canEdit: true });
      fixture.componentRef.setInput("busy", true);
      fixture.detectChanges();
      const seen: number[] = [];
      fixture.componentInstance.toggleStatus.subscribe((b) => seen.push(b.id));

      const button = el().querySelector("app-switch button") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      (el().querySelector(".branch__visibility-text") as HTMLElement).click();
      expect(seen).toEqual([]);
    });
  });

  describe("events", () => {
    it("emits view when the name is clicked — available without any permission", () => {
      render();
      const seen: BranchListItem[] = [];
      fixture.componentInstance.view.subscribe((b) => seen.push(b));

      (el().querySelector(".branch__link") as HTMLButtonElement).click();

      expect(seen).toEqual([{ ...BRANCH }]);
    });

    it("emits edit, delete and toggleStatus with the branch", () => {
      render({}, { canEdit: true, canDelete: true });
      const seen: string[] = [];
      fixture.componentInstance.edit.subscribe((b) => seen.push(`edit:${b.id}`));
      fixture.componentInstance.delete.subscribe((b) => seen.push(`delete:${b.id}`));
      fixture.componentInstance.toggleStatus.subscribe((b) => seen.push(`toggle:${b.id}`));

      el()
        .querySelectorAll<HTMLButtonElement>(".branch__actions button")
        .forEach((b) => b.click());
      (el().querySelector("app-switch button") as HTMLButtonElement).click();

      expect(seen).toEqual(["edit:3", "delete:3", "toggle:3"]);
    });

    it("never changes isVisible itself — the switch only asks the parent", () => {
      render({ isVisible: true }, { canEdit: true });

      (el().querySelector("app-switch button") as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el().querySelector("app-switch button")?.getAttribute("aria-checked")).toBe("true");
    });
  });

  it("labels the card with the branch name for screen readers", () => {
    render();
    const article = el().querySelector("article")!;

    expect(article.getAttribute("aria-labelledby")).toBe("branch-name-3");
    expect(el().querySelector("#branch-name-3")).not.toBeNull();
  });
});
