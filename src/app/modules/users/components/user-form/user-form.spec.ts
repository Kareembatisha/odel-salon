import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { beforeEach, describe, expect, it } from "vitest";

import { CreateUserPayload, UpdateUserPayload, UserDetails } from "../../model/user.model";
import { UserForm } from "./user-form";

const ROLES = [
  { id: 1, name: "Admin" },
  { id: 2, name: "Receptionist" },
];

const DETAILS: UserDetails = {
  id: 5,
  imageUrl: null,
  fullName: "Ali Hassan",
  role: "Receptionist",
  email: "ali@example.com",
  countryCode: "+20",
  phoneNumber: "1001234567",
};

const STRONG = "Str0ng!Pass";

type Internals = {
  form: FormGroup;
  submit(): void;
  setChangePassword(on: boolean): void;
};

describe("UserForm", () => {
  let emitted: Array<CreateUserPayload | UpdateUserPayload>;

  function create(inputs: {
    mode: "create" | "edit";
    details?: UserDetails | null;
    saving?: boolean;
  }) {
    TestBed.configureTestingModule({ imports: [UserForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(UserForm);
    fixture.componentRef.setInput("mode", inputs.mode);
    fixture.componentRef.setInput("details", inputs.details ?? null);
    fixture.componentRef.setInput("roles", ROLES);
    fixture.componentRef.setInput("saving", inputs.saving ?? false);
    emitted = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as Internals };
  }

  const fillCreate = (cmp: Internals) =>
    cmp.form.patchValue({
      fullName: "  Ali Hassan  ",
      email: "ali@example.com",
      phoneNumber: "1001234567",
      roleId: "2",
      password: STRONG,
      passwordConfirmation: STRONG,
    });

  beforeEach(() => TestBed.resetTestingModule());

  describe("validation", () => {
    it.each(["", "   "])("rejects a blank name (%j)", (v) => {
      const { cmp } = create({ mode: "create" });
      cmp.form.get("fullName")!.setValue(v);
      expect(cmp.form.get("fullName")!.hasError("required")).toBe(true);
    });

    it("applies the 100-character limit to the trimmed name", () => {
      const { cmp } = create({ mode: "create" });
      const name = cmp.form.get("fullName")!;
      name.setValue("a".repeat(100) + " ");
      expect(name.errors).toBeNull();
      name.setValue("a".repeat(101));
      expect(name.hasError("maxlength")).toBe(true);
    });

    it("requires a valid email, a 6–15 digit phone and a role", () => {
      const { cmp } = create({ mode: "create" });
      cmp.form.patchValue({ email: "nope", phoneNumber: "12ab", roleId: "" });
      expect(cmp.form.get("email")!.hasError("email")).toBe(true);
      expect(cmp.form.get("phoneNumber")!.hasError("pattern")).toBe(true);
      expect(cmp.form.get("roleId")!.hasError("required")).toBe(true);
    });

    it("flags a password that doesn't meet the policy, and a mismatching confirmation", () => {
      const { cmp } = create({ mode: "create" });
      cmp.form.patchValue({ password: "weak", passwordConfirmation: "other" });
      expect(cmp.form.get("password")!.hasError("weak")).toBe(true);
      expect(cmp.form.hasError("mismatch")).toBe(true);
    });
  });

  describe("create", () => {
    it("emits nothing and marks fields touched when invalid", () => {
      const { cmp } = create({ mode: "create" });
      cmp.submit();
      expect(emitted).toEqual([]);
      expect(cmp.form.get("fullName")!.touched).toBe(true);
    });

    it("emits a CreateUserPayload with a trimmed name and the password pair", () => {
      const { cmp } = create({ mode: "create" });
      fillCreate(cmp);
      cmp.submit();

      expect(emitted).toEqual([
        {
          fullName: "Ali Hassan",
          email: "ali@example.com",
          countryCode: "+20",
          phoneNumber: "1001234567",
          roleId: 2,
          password: STRONG,
          passwordConfirmation: STRONG,
        },
      ]);
    });

    it("emits nothing while a save is already running", () => {
      const { cmp } = create({ mode: "create", saving: true });
      fillCreate(cmp);
      cmp.submit();
      expect(emitted).toEqual([]);
    });
  });

  describe("edit", () => {
    it("fills the form from the details, mapping the role NAME back to its id", () => {
      const { cmp } = create({ mode: "edit", details: DETAILS });
      expect(cmp.form.getRawValue()).toMatchObject({
        fullName: "Ali Hassan",
        email: "ali@example.com",
        countryCode: "+20",
        phoneNumber: "1001234567",
        roleId: "2",
      });
    });

    it("does not need a password unless 'change password' is on", () => {
      const { cmp } = create({ mode: "edit", details: DETAILS });
      cmp.submit();

      expect(emitted).toEqual([
        {
          fullName: "Ali Hassan",
          email: "ali@example.com",
          countryCode: "+20",
          phoneNumber: "1001234567",
          roleId: 2,
        },
      ]);
    });

    it("sends newPassword / newPasswordConfirmation when the password is being changed", () => {
      const { cmp } = create({ mode: "edit", details: DETAILS });
      cmp.setChangePassword(true);
      cmp.form.patchValue({ password: STRONG, passwordConfirmation: STRONG });
      cmp.submit();

      expect(emitted[0]).toMatchObject({
        newPassword: STRONG,
        newPasswordConfirmation: STRONG,
      });
    });

    it("blocks submit while 'change password' is on but the new password is empty", () => {
      const { cmp } = create({ mode: "edit", details: DETAILS });
      cmp.setChangePassword(true);
      cmp.submit();
      expect(emitted).toEqual([]);
    });
  });

  it("emits `cancelled`", () => {
    const { fixture } = create({ mode: "create" });
    let cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    fixture.componentInstance.cancelled.emit();
    expect(cancelled).toBe(1);
  });
});
