import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { FocusTrapDirective } from "./focus-trap.directive";

@Component({
  standalone: true,
  imports: [FocusTrapDirective],
  template: `
    <button id="opener" (click)="open.set(true)">open</button>
    <div id="main-content" tabindex="-1"></div>
    @if (open()) {
      <div id="panel" appFocusTrap appFocusTrapInitial="#second" (appFocusTrapEscape)="open.set(false); escapes = escapes + 1">
        <button id="first">first</button>
        <button id="second">second</button>
        <button id="last">last</button>
      </div>
    }
    <button id="outside">outside</button>
  `,
})
class Host {
  open = signal(false);
  escapes = 0;
}

function press(key: string, shiftKey = false): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
}

describe("FocusTrapDirective", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const q = (id: string) => document.getElementById(id) as HTMLElement;
    q("opener").focus();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, q };
  }

  it("moves focus to the preferred element on open", async () => {
    const { q } = await setup();
    expect(document.activeElement).toBe(q("second"));
  });

  it("wraps Tab from the last element to the first, and Shift+Tab the other way", async () => {
    const { q } = await setup();
    q("last").focus();
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q("first"));
    expect(press("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q("last"));
  });

  it("pulls focus back in when it is outside the panel", async () => {
    const { q } = await setup();
    q("outside").focus();
    press("Tab");
    expect(document.activeElement).toBe(q("first"));
  });

  it("closes on Escape even when focus is outside, and restores focus to the opener", async () => {
    const { fixture, q } = await setup();
    q("outside").focus();
    press("Escape");
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    expect(fixture.componentInstance.escapes).toBe(1);
    expect(document.getElementById("panel")).toBeNull();
    expect(document.activeElement).toBe(q("opener"));
  });

  it("falls back to #main-content when the opener no longer exists", async () => {
    const { fixture, q } = await setup();
    q("opener").remove();
    press("Escape");
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).toBe(q("main-content"));
  });
});
