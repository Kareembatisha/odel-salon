import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { DateFilterComponent } from "./date-filter.component";

@Component({
  standalone: true,
  imports: [DateFilterComponent],
  template: `<app-date-filter
    label="From"
    [value]="value()"
    [min]="min()"
    [max]="max()"
    [invalid]="invalid()"
    (changed)="seen.push($event)"
  />`,
})
class Host {
  value = signal("");
  min = signal("");
  max = signal("");
  invalid = signal(false);
  seen: string[] = [];
}

describe("DateFilterComponent", () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      input: () => el.querySelector<HTMLInputElement>("input")!,
      box: () => el.querySelector<HTMLElement>(".df")!,
    };
  }

  it("shows its label as text and as the input's accessible name", () => {
    const { input, box } = setup();

    expect(box().textContent).toContain("From");
    expect(input().type).toBe("date");
    expect(input().getAttribute("aria-label")).toBe("From");
  });

  it("shows the value it is given and never keeps one of its own", () => {
    const { fixture, host, input } = setup();

    host.value.set("2026-11-12");
    fixture.detectChanges();

    expect(input().value).toBe("2026-11-12");
  });

  it("emits the picked date, and an empty string when cleared", () => {
    const { host, input } = setup();

    input().value = "2026-11-13";
    input().dispatchEvent(new Event("change"));
    input().value = "";
    input().dispatchEvent(new Event("change"));

    expect(host.seen).toEqual(["2026-11-13", ""]);
  });

  it("bounds the picker with min and max, and drops the attributes when they are empty", () => {
    const { fixture, host, input } = setup();
    expect(input().hasAttribute("min")).toBe(false);
    expect(input().hasAttribute("max")).toBe(false);

    host.min.set("2026-11-01");
    host.max.set("2026-11-30");
    fixture.detectChanges();

    expect(input().getAttribute("min")).toBe("2026-11-01");
    expect(input().getAttribute("max")).toBe("2026-11-30");
  });

  it("can be marked invalid", () => {
    const { fixture, host, input, box } = setup();
    expect(input().hasAttribute("aria-invalid")).toBe(false);

    host.invalid.set(true);
    fixture.detectChanges();

    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(box().classList.contains("df--invalid")).toBe(true);
  });
});
