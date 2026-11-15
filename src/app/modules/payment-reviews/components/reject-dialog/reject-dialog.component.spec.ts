import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { RejectDialogComponent } from "./reject-dialog.component";

@Component({
  standalone: true,
  imports: [RejectDialogComponent],
  template: `<app-reject-dialog
    [isOpen]="open()"
    [busy]="busy()"
    [maxLength]="max()"
    title="Reject this booking?"
    hint="The customer will see this reason."
    label="Reason"
    placeholder="e.g. Wrong amount"
    confirmLabel="Reject booking"
    cancelLabel="Cancel"
    requiredMessage="Write the reason."
    (confirm)="confirmed.push($event)"
    (cancel)="cancelled = cancelled + 1"
  />`,
})
class Host {
  open = signal(true);
  busy = signal(false);
  max = signal(500);
  confirmed: string[] = [];
  cancelled = 0;
}

describe("RejectDialogComponent", () => {
  let fixture: ComponentFixture<Host>;
  const el = () => fixture.nativeElement as HTMLElement;
  const box = () => el().querySelector<HTMLTextAreaElement>("textarea")!;
  const buttons = () =>
    Array.from(el().querySelectorAll<HTMLButtonElement>(".dialog__actions button"));
  const counter = () => el().querySelector("#reject-counter")?.textContent?.trim();
  const error = () => el().querySelector<HTMLElement>('[role="alert"]');

  async function setup(open = true) {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.open.set(open);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  const type = (value: string) => {
    box().value = value;
    box().dispatchEvent(new Event("input"));
    fixture.detectChanges();
  };
  const submit = () => {
    buttons()[1].click();
    fixture.detectChanges();
  };

  it("stays closed until opened", async () => {
    await setup(false);

    expect(el().querySelector('[role="dialog"]')).toBeNull();
  });

  it("shows the title, the hint, the label, the placeholder and an empty counter", async () => {
    await setup();

    expect(el().querySelector("h2")?.textContent).toBe("Reject this booking?");
    expect(el().textContent).toContain("The customer will see this reason.");
    expect(el().querySelector(".field__label")?.textContent).toBe("Reason");
    expect(box().placeholder).toBe("e.g. Wrong amount");
    expect(counter()).toBe("0/500");
    expect(el().querySelector('[role="dialog"]')!.getAttribute("aria-modal")).toBe("true");
  });

  it("focuses the text box on open", async () => {
    await setup();

    expect(document.activeElement).toBe(box());
  });

  it("limits the reason to maxLength and counts what is typed", async () => {
    const host = await setup();
    host.max.set(20);
    fixture.detectChanges();

    expect(box().getAttribute("maxlength")).toBe("20");
    type("Wrong amount");
    expect(counter()).toBe("12/20");
  });

  it("asks for a reason instead of sending an empty one", async () => {
    const host = await setup();

    submit();

    expect(host.confirmed).toEqual([]);
    expect(error()?.textContent).toBe("Write the reason.");
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(box().getAttribute("aria-describedby")).toContain("reject-error");
  });

  it("counts blank text as no reason", async () => {
    const host = await setup();
    type("    \n  ");

    submit();

    expect(host.confirmed).toEqual([]);
    expect(error()).not.toBeNull();
  });

  it("shows no error before the first submit, and clears it once the user types", async () => {
    await setup();
    expect(error()).toBeNull();

    submit();
    expect(error()).not.toBeNull();

    type("The amount doesn't match.");
    expect(error()).toBeNull();
    expect(box().hasAttribute("aria-invalid")).toBe(false);
  });

  it("sends the trimmed reason", async () => {
    const host = await setup();
    type("   The transferred amount doesn't match.  ");

    submit();

    expect(host.confirmed).toEqual(["The transferred amount doesn't match."]);
  });

  it("cancels from the button, the backdrop and Escape — without sending", async () => {
    const host = await setup();
    type("something");

    buttons()[0].click();
    expect(host.cancelled).toBe(1);

    el().querySelector<HTMLElement>(".backdrop")!.click();
    expect(host.cancelled).toBe(2);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(host.cancelled).toBe(3);
    expect(host.confirmed).toEqual([]);
  });

  it("does not cancel on a click inside the dialog", async () => {
    const host = await setup();

    el().querySelector<HTMLElement>(".dialog")!.click();

    expect(host.cancelled).toBe(0);
  });

  it("starts empty every time it opens (a reason never carries over to another booking)", async () => {
    const host = await setup();
    type("Wrong amount");
    submit();
    expect(host.confirmed).toHaveLength(1);

    host.open.set(false);
    fixture.detectChanges();
    host.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(box().value).toBe("");
    expect(counter()).toBe("0/500");
    expect(error()).toBeNull();
  });

  it("ignores a second submit while the request is running", async () => {
    const host = await setup();
    type("Wrong amount");
    host.busy.set(true);
    fixture.detectChanges();

    submit();

    expect(host.confirmed).toEqual([]);
    expect(
      el()
        .querySelector(".dialog__actions app-button:last-child button")
        ?.getAttribute("aria-busy"),
    ).toBe("true");
  });
});
