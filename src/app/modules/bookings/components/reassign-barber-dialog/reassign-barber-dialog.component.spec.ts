import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { ReassignBarberDialogComponent, ReassignOption } from "./reassign-barber-dialog.component";

@Component({
  standalone: true,
  imports: [ReassignBarberDialogComponent],
  template: `<app-reassign-barber-dialog
    [isOpen]="open()"
    [options]="options()"
    [loading]="loading()"
    [busy]="busy()"
    title="Change barber"
    hint="The customer isn't notified."
    label="Barbers of this branch"
    confirmLabel="Change barber"
    cancelLabel="Cancel"
    loadingMessage="Loading barbers…"
    emptyMessage="No other active barber."
    (confirm)="confirmed.push($event)"
    (cancel)="cancelled = cancelled + 1"
  />`,
})
class Host {
  open = signal(true);
  loading = signal(false);
  busy = signal(false);
  options = signal<ReassignOption[]>([
    { id: 8, label: "Youssef Samir" },
    { id: 9, label: "Omar Nabil" },
  ]);
  confirmed: number[] = [];
  cancelled = 0;
}

describe("ReassignBarberDialogComponent", () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>(".dialog__actions button"));
  const radios = () => Array.from(el().querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  async function setup(open = true) {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(open);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  const pick = (index: number) => {
    radios()[index].click();
    fixture.detectChanges();
  };

  it("stays closed until opened", async () => {
    await setup(false);

    expect(el().querySelector('[role="dialog"]')).toBeNull();
  });

  it("is a modal dialog named by its title and described by its hint", async () => {
    await setup();
    const dialog = el().querySelector('[role="dialog"]')!;

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(el().querySelector("#reassign-title")?.textContent?.trim()).toBe("Change barber");
    expect(el().querySelector("#reassign-hint")?.textContent?.trim()).toBe(
      "The customer isn't notified.",
    );
  });

  it("lists the barbers as a radio group and starts with none chosen", async () => {
    await setup();

    expect(el().querySelector("fieldset legend")?.textContent?.trim()).toBe(
      "Barbers of this branch",
    );
    expect(
      Array.from(el().querySelectorAll(".option__label")).map((n) => n.textContent?.trim()),
    ).toEqual(["Youssef Samir", "Omar Nabil"]);
    expect(radios().every((r) => !r.checked)).toBe(true);
  });

  it("does not confirm until a barber is chosen", async () => {
    const host = await setup();

    buttons()[1].click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([]);
    expect(buttons()[1].disabled).toBe(true);
  });

  it("confirms with the id of the chosen barber", async () => {
    const host = await setup();

    pick(1);
    buttons()[1].click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([9]);
  });

  it("forgets the choice when it is opened again", async () => {
    const host = await setup();
    pick(0);

    host.open.set(false);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(radios().every((r) => !r.checked)).toBe(true);
    expect(buttons()[1].disabled).toBe(true);
  });

  it("says so while the barbers load, and when there is no other barber", async () => {
    const host = await setup();

    host.loading.set(true);
    fixture.detectChanges();
    expect(el().querySelector('[role="status"]')?.textContent?.trim()).toBe("Loading barbers…");
    expect(radios()).toHaveLength(0);

    host.loading.set(false);
    host.options.set([]);
    fixture.detectChanges();
    expect(el().querySelector(".dialog__empty")?.textContent?.trim()).toBe(
      "No other active barber.",
    );
  });

  it("ignores a second confirm while busy", async () => {
    const host = await setup();
    pick(0);
    host.busy.set(true);
    fixture.detectChanges();

    buttons()[1].click();
    fixture.detectChanges();

    expect(host.confirmed).toEqual([]);
  });

  it("cancels from the Cancel button, a click on the backdrop and Escape — not from inside", async () => {
    const host = await setup();

    buttons()[0].click();
    el().querySelector<HTMLElement>(".backdrop")!.click();
    el().querySelector<HTMLElement>(".dialog")!.click();
    el()
      .querySelector('[role="dialog"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(host.cancelled).toBe(3);
  });
});
