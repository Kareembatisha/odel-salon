import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

import { ProofViewerComponent } from "./proof-viewer.component";

@Component({
  standalone: true,
  imports: [ProofViewerComponent],
  template: `<app-proof-viewer
    [src]="src()"
    alt="Payment proof of #489"
    title="Payment proof"
    caption="#489 · EGP 340 · InstaPay"
    closeLabel="Close"
    openLabel="Open original"
    (closed)="closedCount = closedCount + 1"
  />`,
})
class Host {
  src = signal<string | null>(null);
  closedCount = 0;
}

describe("ProofViewerComponent", () => {
  async function setup(src: string | null = "https://api.odelsalon.com/payments/a.jpg") {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.src.set(src);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      dialog: () => el.querySelector<HTMLElement>('[role="dialog"]'),
      image: () => el.querySelector<HTMLImageElement>("img"),
      close: () => el.querySelector<HTMLButtonElement>("button.viewer__close"),
      backdrop: () => el.querySelector<HTMLElement>(".backdrop"),
      original: () => el.querySelector<HTMLAnchorElement>("a.viewer__open"),
    };
  }

  it("stays closed while there is no image", async () => {
    const { dialog } = await setup(null);

    expect(dialog()).toBeNull();
  });

  it("shows the screenshot with its title, caption and alt text", async () => {
    const { dialog, image } = await setup();

    expect(dialog()!.getAttribute("aria-modal")).toBe("true");
    expect(dialog()!.getAttribute("aria-label")).toBe("Payment proof");
    expect(dialog()!.textContent).toContain("#489 · EGP 340 · InstaPay");
    expect(image()!.getAttribute("src")).toBe("https://api.odelsalon.com/payments/a.jpg");
    expect(image()!.getAttribute("alt")).toBe("Payment proof of #489");
  });

  it("shows an inline (data:) image too", async () => {
    const url = "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E";
    const { image } = await setup(url);

    expect(image()!.getAttribute("src")).toBe(url);
  });

  it("moves focus to the close button on open", async () => {
    const { close } = await setup();

    expect(document.activeElement).toBe(close());
  });

  it("closes from the close button", async () => {
    const { close, host } = await setup();

    close()!.click();

    expect(host.closedCount).toBe(1);
    expect(close()!.getAttribute("aria-label")).toBe("Close");
  });

  it("closes with Escape", async () => {
    const { host } = await setup();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(host.closedCount).toBe(1);
  });

  it("closes on a click on the backdrop, but not on the dialog itself", async () => {
    const { backdrop, dialog, host } = await setup();

    dialog()!.click();
    expect(host.closedCount).toBe(0);

    backdrop()!.click();
    expect(host.closedCount).toBe(1);
  });

  it("offers 'Open original' for a web address, safely", async () => {
    const { original } = await setup();

    expect(original()!.getAttribute("href")).toBe("https://api.odelsalon.com/payments/a.jpg");
    expect(original()!.getAttribute("target")).toBe("_blank");
    expect(original()!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("offers no 'Open original' for a data: image (browsers block opening it)", async () => {
    const { original } = await setup("data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E");

    expect(original()).toBeNull();
  });

  it("closes when the image is cleared", async () => {
    const { fixture, host, dialog } = await setup();

    host.src.set(null);
    fixture.detectChanges();

    expect(dialog()).toBeNull();
  });
});
