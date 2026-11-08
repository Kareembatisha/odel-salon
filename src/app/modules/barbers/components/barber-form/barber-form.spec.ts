import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "@core/services/notification.service";
import {
  BARBER_IMAGE_MAX_BYTES,
  BarberBranchOption,
  BarberDetails,
  CreateBarberPayload,
  UpdateBarberPayload,
} from "../../model/barber.model";
import { BarberForm } from "./barber-form";

const BRANCHES: BarberBranchOption[] = [
  { id: 3, nameAr: "مدينة نصر", nameEn: "Nasr City" },
  { id: 5, nameAr: "القاهرة الجديدة", nameEn: "New Cairo" },
];

const DETAILS: BarberDetails = {
  id: 7,
  branchId: 3,
  branchNameAr: "مدينة نصر",
  branchNameEn: "Nasr City",
  fullName: "Karim Mostafa",
  phone: "+201001234567",
  imageUrl: "https://api-odel.com/barbers/k.jpg",
  isActive: true,
  createdAt: "2026-11-02T15:02:40Z",
  updatedAt: null,
};

describe("BarberForm", () => {
  let fixture: ComponentFixture<BarberForm>;
  let submitted: ReturnType<typeof vi.fn>;
  let cancelled: ReturnType<typeof vi.fn>;
  let notifyError: ReturnType<typeof vi.spyOn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? "";
  const branchSelect = () =>
    el().querySelector<HTMLSelectElement>("app-float-label-select select")!;
  const inputs = () =>
    Array.from(el().querySelectorAll<HTMLInputElement>("app-float-label-input input"));
  const nameInput = () => inputs()[0];
  const phoneInput = () => inputs()[1];
  const fileInput = () => el().querySelector<HTMLInputElement>('input[type="file"]')!;
  const form = () => el().querySelector("form") as HTMLFormElement;
  const button = (label: string) =>
    Array.from(el().querySelectorAll<HTMLButtonElement>("button")).find((b) =>
      (b.textContent ?? "").includes(label),
    );

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function setup(inputsIn: {
    mode: "create" | "edit";
    details?: BarberDetails | null;
    branches?: BarberBranchOption[];
    initialBranchId?: number | null;
    saving?: boolean;
  }) {
    TestBed.configureTestingModule({ imports: [BarberForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    notifyError = vi.spyOn(TestBed.inject(NotificationService), "error");
    fixture = TestBed.createComponent(BarberForm);
    fixture.componentRef.setInput("mode", inputsIn.mode);
    fixture.componentRef.setInput("details", inputsIn.details ?? null);
    fixture.componentRef.setInput("branches", inputsIn.branches ?? BRANCHES);
    fixture.componentRef.setInput("initialBranchId", inputsIn.initialBranchId ?? null);
    fixture.componentRef.setInput("saving", inputsIn.saving ?? false);

    submitted = vi.fn();
    cancelled = vi.fn();
    fixture.componentInstance.submitted.subscribe(
      submitted as (v: CreateBarberPayload | UpdateBarberPayload) => void,
    );
    fixture.componentInstance.cancelled.subscribe(cancelled as () => void);
    await settle();
  }

  function type(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  }

  function choose(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }

  async function pickFile(file: File) {
    Object.defineProperty(fileInput(), "files", { value: [file], configurable: true });
    fileInput().dispatchEvent(new Event("change"));
    await settle();
  }

  async function submit() {
    form().dispatchEvent(new Event("submit"));
    await settle();
  }

  const photo = (type = "image/jpeg", size = 100) => {
    const f = new File(["x"], "p.jpg", { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  afterEach(() => vi.restoreAllMocks());

  describe("create", () => {
    it("lists a placeholder plus the branches and preselects the one the list is filtered to", async () => {
      await setup({ mode: "create", initialBranchId: 5 });

      expect(Array.from(branchSelect().options).map((o) => o.value)).toEqual(["", "3", "5"]);
      expect(branchSelect().value).toBe("5");
    });

    it("starts without a branch when nothing is filtered", async () => {
      await setup({ mode: "create" });
      expect(branchSelect().value).toBe("");
    });

    it("does not emit and shows errors when branch, name and phone are empty", async () => {
      await setup({ mode: "create" });
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("BARBERS.FORM.BRANCH_REQUIRED");
      expect(text()).toContain("BARBERS.FORM.NAME_REQUIRED");
      expect(text()).toContain("BARBERS.FORM.PHONE_REQUIRED");
    });

    it("rejects a whitespace-only name", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      type(nameInput(), "   ");
      type(phoneInput(), "01001234567");
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("BARBERS.FORM.NAME_REQUIRED");
    });

    it("rejects a name over 100 characters", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      type(nameInput(), "x".repeat(101));
      type(phoneInput(), "01001234567");
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("BARBERS.FORM.NAME_MAX");
    });

    it("rejects a phone that is not an Egyptian mobile", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      type(nameInput(), "Karim");
      type(phoneInput(), "12345");
      await submit();

      expect(submitted).not.toHaveBeenCalled();
      expect(text()).toContain("BARBERS.FORM.PHONE_INVALID");
    });

    it("emits the payload with a trimmed name and the phone normalised to +201XXXXXXXXX", async () => {
      await setup({ mode: "create" });
      choose(branchSelect(), "5");
      type(nameInput(), "  Karim Mostafa ");
      type(phoneInput(), "0100 123 4567");
      await submit();

      expect(submitted).toHaveBeenCalledTimes(1);
      expect(submitted).toHaveBeenCalledWith({
        branchId: 5,
        fullName: "Karim Mostafa",
        phone: "+201001234567",
        image: null,
      });
      expect(submitted.mock.calls[0][0]).not.toHaveProperty("removeImage");
    });

    it("includes a valid photo the person picked", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      type(nameInput(), "Karim");
      type(phoneInput(), "01001234567");
      const file = photo("image/png");
      await pickFile(file);

      expect(text()).toContain("BARBERS.FORM.PHOTO_PENDING");
      await submit();

      expect(submitted.mock.calls[0][0].image).toBe(file);
    });

    it.each([
      ["a GIF", photo("image/gif"), "FILE_VALIDATION.UNSUPPORTED_TYPE"],
      [
        "a photo over 5 MB",
        photo("image/png", BARBER_IMAGE_MAX_BYTES + 1),
        "FILE_VALIDATION.FILE_TOO_LARGE",
      ],
    ])("refuses %s with a toast and keeps the form photo-less", async (_label, file, key) => {
      await setup({ mode: "create", initialBranchId: 3 });
      await pickFile(file);

      expect(notifyError).toHaveBeenCalledWith(key, "BARBERS.FORM.PHOTO_HINT");
      expect(text()).not.toContain("BARBERS.FORM.PHOTO_PENDING");

      type(nameInput(), "Karim");
      type(phoneInput(), "01001234567");
      await submit();
      expect(submitted.mock.calls[0][0].image).toBeNull();
    });

    it('offers "add photo" first and "remove" only once there is one', async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      expect(text()).toContain("BARBERS.FORM.PHOTO_ADD");
      expect(button("BARBERS.FORM.PHOTO_REMOVE")).toBeUndefined();

      await pickFile(photo());
      expect(text()).toContain("BARBERS.FORM.PHOTO_CHANGE");
      button("BARBERS.FORM.PHOTO_REMOVE")!.click();
      await settle();

      expect(text()).toContain("BARBERS.FORM.PHOTO_ADD");
      expect(text()).not.toContain("BARBERS.FORM.PHOTO_PENDING"); // dropping a just-picked photo is not a pending change
    });

    it("never shows the transfer note when creating", async () => {
      await setup({ mode: "create", initialBranchId: 3 });
      choose(branchSelect(), "5");
      await settle();
      expect(text()).not.toContain("BARBERS.FORM.TRANSFER_NOTE");
    });

    it("Cancel emits cancelled and is disabled while saving", async () => {
      await setup({ mode: "create" });
      button("COMMON.CANCEL")!.click();
      expect(cancelled).toHaveBeenCalledTimes(1);

      fixture.componentRef.setInput("saving", true);
      await settle();
      expect(button("COMMON.CANCEL")!.disabled).toBe(true);
    });
  });

  describe("edit", () => {
    it("prefills branch, name and phone", async () => {
      await setup({ mode: "edit", details: DETAILS });

      expect(branchSelect().value).toBe("3");
      expect(nameInput().value).toBe("Karim Mostafa");
      expect(phoneInput().value).toBe("+201001234567");
      expect(text()).toContain("BARBERS.FORM.PHOTO_CHANGE");
    });

    it("emits an update with removeImage=false and no image when nothing about the photo changed", async () => {
      await setup({ mode: "edit", details: DETAILS });
      type(nameInput(), "Karim M.");
      await submit();

      expect(submitted).toHaveBeenCalledWith({
        branchId: 3,
        fullName: "Karim M.",
        phone: "+201001234567",
        image: null,
        removeImage: false,
      });
    });

    it('"Remove photo" sends removeImage=true', async () => {
      await setup({ mode: "edit", details: DETAILS });
      button("BARBERS.FORM.PHOTO_REMOVE")!.click();
      await settle();
      expect(text()).toContain("BARBERS.FORM.PHOTO_PENDING");
      await submit();

      expect(submitted.mock.calls[0][0]).toMatchObject({ removeImage: true, image: null });
    });

    it("picking a new photo after removing cancels the removal (the image wins)", async () => {
      await setup({ mode: "edit", details: DETAILS });
      button("BARBERS.FORM.PHOTO_REMOVE")!.click();
      const file = photo();
      await pickFile(file);
      await submit();

      expect(submitted.mock.calls[0][0]).toMatchObject({ removeImage: false, image: file });
    });

    it("shows no remove button, and never asks to remove, for a barber without a photo", async () => {
      await setup({ mode: "edit", details: { ...DETAILS, imageUrl: null } });
      expect(button("BARBERS.FORM.PHOTO_REMOVE")).toBeUndefined();
      await submit();
      expect(submitted.mock.calls[0][0].removeImage).toBe(false);
    });

    it("warns that saving moves the barber when another branch is chosen, and sends the new branch", async () => {
      await setup({ mode: "edit", details: DETAILS });
      expect(text()).not.toContain("BARBERS.FORM.TRANSFER_NOTE");

      choose(branchSelect(), "5");
      await settle();
      expect(text()).toContain("BARBERS.FORM.TRANSFER_NOTE");

      await submit();
      expect(submitted.mock.calls[0][0]).toMatchObject({ branchId: 5 });

      choose(branchSelect(), "3");
      await settle();
      expect(text()).not.toContain("BARBERS.FORM.TRANSFER_NOTE");
    });

    it("keeps the barber’s current branch selectable even if the branch list no longer has it", async () => {
      await setup({ mode: "edit", details: DETAILS, branches: [BRANCHES[1]] });

      expect(Array.from(branchSelect().options).map((o) => o.value)).toEqual(["", "5", "3"]);
      expect(branchSelect().value).toBe("3");
    });

    it('labels the primary button "save" instead of "add"', async () => {
      await setup({ mode: "edit", details: DETAILS });
      expect(el().querySelector('button[type="submit"]')!.textContent).toContain("COMMON.SAVE");
    });
  });
});
