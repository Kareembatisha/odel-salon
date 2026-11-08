import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { TranslateModule } from "@ngx-translate/core";
import { describe, expect, it } from "vitest";

import { FloatLabelInput } from "./float-label-input";

@Component({
  standalone: true,
  imports: [FloatLabelInput, ReactiveFormsModule],
  template: `<app-float-label-input label="Start date" type="date" min="2026-11-07" max="2026-12-31" [ltr]="true" [formControl]="ctrl" />`,
})
class Host {
  ctrl = new FormControl("", { nonNullable: true });
}

describe("FloatLabelInput (date)", () => {
  async function setup(): Promise<ComponentFixture<Host>> {
    TestBed.configureTestingModule({ imports: [Host, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  const input = (f: ComponentFixture<Host>) =>
    (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>("input")!;

  it("renders a native date input with min / max, left-to-right", async () => {
    const f = await setup();
    expect(input(f).type).toBe("date");
    expect(input(f).getAttribute("min")).toBe("2026-11-07");
    expect(input(f).getAttribute("max")).toBe("2026-12-31");
    expect(input(f).getAttribute("dir")).toBe("ltr");
  });

  it("keeps the label lifted while empty (the native mask is always visible)", async () => {
    const f = await setup();
    expect((f.nativeElement as HTMLElement).querySelector(".fli--floated")).not.toBeNull();
  });

  it("writes the yyyy-MM-dd value to the form control", async () => {
    const f = await setup();
    input(f).value = "2026-11-20";
    input(f).dispatchEvent(new Event("input"));
    expect(f.componentInstance.ctrl.value).toBe("2026-11-20");
  });
});
