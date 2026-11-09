import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { beforeEach, describe, expect, it } from "vitest";

import { RoleForm } from "./role-form";

type Internals = { form: FormGroup; submit(): void };

describe("RoleForm", () => {
  let emitted: string[];

  function create(inputs: { initialName?: string; saving?: boolean } = {}) {
    TestBed.configureTestingModule({ imports: [RoleForm, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(RoleForm);
    fixture.componentRef.setInput("initialName", inputs.initialName ?? "");
    fixture.componentRef.setInput("saving", inputs.saving ?? false);
    emitted = [];
    fixture.componentInstance.submitted.subscribe((v) => emitted.push(v));
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as unknown as Internals };
  }

  beforeEach(() => TestBed.resetTestingModule());

  it("starts empty for a new role", () => {
    const { cmp } = create();
    expect(cmp.form.get("name")!.value).toBe("");
  });

  it("is seeded with the current name when renaming (available right after the first render)", () => {
    const { cmp } = create({ initialName: "Cashier" });
    expect(cmp.form.get("name")!.value).toBe("Cashier");
  });

  it.each(["", "   "])("rejects a blank name (%j) and emits nothing", (v) => {
    const { cmp } = create();
    cmp.form.get("name")!.setValue(v);
    cmp.submit();

    expect(emitted).toEqual([]);
    expect(cmp.form.get("name")!.touched).toBe(true);
    expect(cmp.form.get("name")!.hasError("required")).toBe(true);
  });

  it("applies the 50-character limit to the trimmed name", () => {
    const { cmp } = create();
    const name = cmp.form.get("name")!;
    name.setValue("a".repeat(50) + " ");
    expect(name.errors).toBeNull();
    name.setValue("a".repeat(51));
    expect(name.hasError("maxlength")).toBe(true);
  });

  it("emits the trimmed name", () => {
    const { cmp } = create();
    cmp.form.get("name")!.setValue("  Senior cashier  ");
    cmp.submit();
    expect(emitted).toEqual(["Senior cashier"]);
  });

  it("emits nothing while a save is already running", () => {
    const { cmp } = create({ saving: true });
    cmp.form.get("name")!.setValue("Cashier");
    cmp.submit();
    expect(emitted).toEqual([]);
  });
});
