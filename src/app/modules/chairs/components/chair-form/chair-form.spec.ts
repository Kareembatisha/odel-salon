import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { describe, expect, it, vi } from "vitest";

import {
  ChairBranchOption,
  ChairDetails,
  ChairType,
  CreateChairPayload,
  UpdateChairPayload,
} from "../../model/chair.model";
import { ChairForm } from "./chair-form";

const BRANCHES: ChairBranchOption[] = [
  { id: 3, nameAr: "مدينة نصر", nameEn: "Nasr City" },
  { id: 5, nameAr: "القاهرة الجديدة", nameEn: "New Cairo" },
];

const DETAILS: ChairDetails = {
  id: 12,
  branchId: 3,
  branchNameAr: "مدينة نصر",
  branchNameEn: "Nasr City",
  name: "V1",
  type: ChairType.Vip,
  isActive: true,
  createdAt: "2026-11-02T14:20:11Z",
  updatedAt: null,
};

describe("ChairForm", () => {
  let fixture: ComponentFixture<ChairForm>;
  let submitted: ReturnType<typeof vi.fn>;
  let cancelled: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const selects = () =>
    Array.from(el().querySelectorAll<HTMLSelectElement>("app-float-label-select select"));
  const branchSelect = () => selects()[0];
  const typeSelect = () => selects()[1];
  const nameInput = () => el().querySelector<HTMLInputElement>("app-float-label-input input")!;
  const form = () => el().querySelector("form") as HTMLFormElement;
  const submitButton = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(inputs: {
    mode: "create" | "edit";
    details?: ChairDetails | null;
    branches?: ChairBranchOption[];
    initialBranchId?: number | null;
    saving?: boolean;
  }) {
    TestBed.configureTestingModule({ imports: [ChairForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    fixture = TestBed.createComponent(ChairForm);
    fixture.componentRef.setInput("mode", inputs.mode);
    fixture.componentRef.setInput("details", inputs.details ?? null);
    fixture.componentRef.setInput("branches", inputs.branches ?? BRANCHES);
    fixture.componentRef.setInput("initialBranchId", inputs.initialBranchId ?? null);
    fixture.componentRef.setInput("saving", inputs.saving ?? false);

    submitted = vi.fn();
    cancelled = vi.fn();
    fixture.componentInstance.submitted.subscribe(
      submitted as (v: CreateChairPayload | UpdateChairPayload) => void,
    );
    fixture.componentInstance.cancelled.subscribe(cancelled as () => void);
    await settle();
  }

  function type(value: string) {
    nameInput().value = value;
    nameInput().dispatchEvent(new Event("input"));
  }

  function choose(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }

  async function submit() {
    form().dispatchEvent(new Event("submit"));
    await settle();
  }

  describe("create", () => {
    it("lists the branches plus a placeholder and offers Regular / VIP, defaulting to Regular", async () => {
      await setup({ mode: "create" });

      expect(Array.from(branchSelect().options).map((o) => o.value)).toEqual(["", "3", "5"]);
      expect(Array.from(typeSelect().options).map((o) => o.value)).toEqual(["0", "1"]);
      expect(typeSelect().value).toBe("0");
    });

    it("does not emit and shows errors when branch and name are empty", async () => {
      await setup({ mode: "create" });
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(el().textContent).toContain("CHAIRS.FORM.BRANCH_REQUIRED");
      expect(el().textContent).toContain("CHAIRS.FORM.NAME_REQUIRED");
    });

    it("treats a whitespace-only name as empty", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      type("    ");
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(el().textContent).toContain("CHAIRS.FORM.NAME_REQUIRED");
    });

    it("rejects a name longer than 50 characters and accepts exactly 50", async () => {
      await setup({ mode: "create", initialBranchId: 3 });

      type("x".repeat(51));
      await submit();
      expect(submitted).not.toHaveBeenCalled();
      expect(el().textContent).toContain("CHAIRS.FORM.NAME_MAX");

      type("x".repeat(50));
      await submit();
      expect(submitted).toHaveBeenCalledTimes(1);
    });

    it("emits numeric branchId / type and a trimmed name", async () => {
      await setup({ mode: "create" });
      choose(branchSelect(), "5");
      type("  V2  ");
      choose(typeSelect(), "1");
      await submit();

      expect(submitted).toHaveBeenCalledWith({ branchId: 5, name: "V2", type: ChairType.Vip });
    });

    it("pre-selects the filtered branch when it is in the list", async () => {
      await setup({ mode: "create", initialBranchId: 5 });
      expect(branchSelect().value).toBe("5");
    });

    it("ignores a pre-selected branch that is not in the list", async () => {
      await setup({ mode: "create", initialBranchId: 99 });
      expect(branchSelect().value).toBe("");
    });

    it('labels the primary action "create" and emits cancelled', async () => {
      await setup({ mode: "create" });
      expect(submitButton().textContent).toContain("CHAIRS.FORM.CREATE");

      el().querySelector<HTMLButtonElement>('button:not([type="submit"])')!.click();
      expect(cancelled).toHaveBeenCalledTimes(1);
    });
  });

  describe("edit", () => {
    it("fills the form and locks the branch", async () => {
      await setup({ mode: "edit", details: DETAILS });

      expect(branchSelect().value).toBe("3");
      expect(branchSelect().disabled).toBe(true);
      expect(nameInput().value).toBe("V1");
      expect(typeSelect().value).toBe("1");
      expect(el().textContent).toContain("CHAIRS.FORM.BRANCH_LOCKED");
    });

    it("emits only name and type — never branchId", async () => {
      await setup({ mode: "edit", details: DETAILS });
      type("V9");
      choose(typeSelect(), "0");
      await submit();

      expect(submitted).toHaveBeenCalledWith({ name: "V9", type: ChairType.Regular });
      expect(Object.keys(submitted.mock.calls[0][0])).not.toContain("branchId");
    });

    it("still shows the chair's branch when it is missing from the loaded list", async () => {
      await setup({ mode: "edit", details: DETAILS, branches: [BRANCHES[1]] });

      expect(Array.from(branchSelect().options).map((o) => o.value)).toContain("3");
      expect(branchSelect().value).toBe("3");
    });

    it('labels the primary action "save"', async () => {
      await setup({ mode: "edit", details: DETAILS });
      expect(submitButton().textContent).toContain("COMMON.SAVE");
    });
  });

  it("does not emit while a save is already in flight", async () => {
    await setup({ mode: "edit", details: DETAILS, saving: true });
    await submit();
    expect(submitted).not.toHaveBeenCalled();
  });
});
