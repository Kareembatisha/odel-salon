import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { FormGroup } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../../service/auth.service";
import { EmailVerification } from "./email-verification";

type Internals = {
  form: FormGroup;
  secondsLeft: number;
  submitError: string;
  formattedTime: string;
  onSubmit(): void;
  resendCode(): void;
  changeEmail(): void;
  onPaste(e: ClipboardEvent, index?: number): void;
};

describe("EmailVerification", () => {
  let verifyPasswordCode: ReturnType<typeof vi.fn>;
  let forgotPassword: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let loading: ReturnType<typeof signal<boolean>>;

  function create(email: string | null = "sara@example.com") {
    TestBed.configureTestingModule({
      imports: [EmailVerification, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: { verifyPasswordCode, forgotPassword, loading } },
        { provide: Router, useValue: { navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => email } } },
        },
      ],
    });
    TestBed.inject(TranslateService).use("en");
    const fixture = TestBed.createComponent(EmailVerification);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance as unknown as Internals };
  }

  const fill = (page: Internals, digits: string) =>
    page.form.setValue({
      d0: digits[0],
      d1: digits[1],
      d2: digits[2],
      d3: digits[3],
      d4: digits[4],
      d5: digits[5],
    });

  beforeEach(() => {
    vi.useFakeTimers();
    verifyPasswordCode = vi.fn(() => of("reset-token"));
    forgotPassword = vi.fn(() => of(true));
    navigate = vi.fn();
    loading = signal(false);
  });

  afterEach(() => vi.useRealTimers());

  const pasteOf = (text: string) =>
    ({
      clipboardData: { getData: () => text },
      preventDefault: vi.fn(),
    }) as unknown as ClipboardEvent;

  it("goes back to forgot-password when opened without an email", () => {
    create(null);
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });

  it("verifies automatically once all six digits are in and continues with the reset token", () => {
    const { page } = create();
    fill(page, "123456");

    expect(verifyPasswordCode).toHaveBeenCalledWith({ email: "sara@example.com", code: "123456" });
    expect(navigate).toHaveBeenCalledWith(["/create-new-password"], {
      queryParams: { email: "sara@example.com", token: "reset-token" },
    });
  });

  it("shows an error and stays when the code is wrong", () => {
    verifyPasswordCode.mockReturnValue(of(null));
    const { page } = create();
    fill(page, "123456");

    expect(page.submitError).toBe("AUTH.OTP_INVALID");
    expect(navigate).not.toHaveBeenCalledWith(["/create-new-password"], expect.anything());
  });

  it("does not send the single-use code twice while a request is running", () => {
    const { page } = create();
    loading.set(true);
    fill(page, "123456");
    page.onSubmit();

    expect(verifyPasswordCode).not.toHaveBeenCalled();
  });

  it("an incomplete code is invalid and sends nothing", () => {
    const { page } = create();
    page.form.patchValue({ d0: "1", d1: "2" });
    page.onSubmit();

    expect(verifyPasswordCode).not.toHaveBeenCalled();
    expect(page.submitError).toBe("AUTH.OTP_INVALID");
  });

  it("pasting a code fills the digits and verifies", () => {
    const { page } = create();
    page.onPaste(pasteOf(" 98-76 54 "));

    expect(verifyPasswordCode).toHaveBeenCalledWith({ email: "sara@example.com", code: "987654" });
  });

  describe("six digits", () => {
    it("has six boxes, each one digit, numeric on mobile and ready for an SMS autofill", () => {
      const { fixture } = create();
      const boxes = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(".otp-box"),
      );

      expect(boxes).toHaveLength(6);
      for (const box of boxes) {
        expect(box.getAttribute("inputmode")).toBe("numeric");
        expect(box.getAttribute("autocomplete")).toBe("one-time-code");
        expect(box.getAttribute("pattern")).toBe("[0-9]*");
      }
    });

    it("names every box for a screen reader, and the row as one group", () => {
      const { fixture } = create();
      const el = fixture.nativeElement as HTMLElement;
      const boxes = Array.from(el.querySelectorAll<HTMLInputElement>(".otp-box"));

      expect(el.querySelector(".otp-row")?.getAttribute("role")).toBe("group");
      expect(boxes[0].getAttribute("aria-label")).toBe("AUTH.OTP_DIGIT_LABEL");
    });

    it("five digits are not a code: nothing is sent and the form is invalid", () => {
      const { page } = create();
      page.form.patchValue({ d0: "1", d1: "2", d2: "3", d3: "4", d4: "5" });
      page.onSubmit();

      expect(verifyPasswordCode).not.toHaveBeenCalled();
      expect(page.form.invalid).toBe(true);
      expect(page.submitError).toBe("AUTH.OTP_INVALID");
    });

    it("a box takes one digit only: a letter or a longer value is invalid", () => {
      const { page } = create();

      for (const bad of ["a", "12", " "]) {
        page.form.patchValue({ d0: bad });
        expect(page.form.controls["d0"].invalid, bad).toBe(true);
      }
      page.form.patchValue({ d0: "7" });
      expect(page.form.controls["d0"].valid).toBe(true);
    });

    it("pasting more than six digits keeps the first six", () => {
      const { page } = create();
      page.onPaste(pasteOf("123456789"));

      expect(verifyPasswordCode).toHaveBeenCalledTimes(1);
      expect(verifyPasswordCode).toHaveBeenCalledWith({
        email: "sara@example.com",
        code: "123456",
      });
    });

    it("pasting fewer than six digits fills from the box it was pasted into and does not verify", () => {
      const { page } = create();
      page.onPaste(pasteOf("123"), 2);

      expect(page.form.getRawValue()).toEqual({
        d0: "",
        d1: "",
        d2: "1",
        d3: "2",
        d4: "3",
        d5: "",
      });
      expect(verifyPasswordCode).not.toHaveBeenCalled();
    });

    it("a paste with no digits at all is left to the browser", () => {
      const { page } = create();
      const event = pasteOf("abc");

      page.onPaste(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(page.form.getRawValue()).toEqual({ d0: "", d1: "", d2: "", d3: "", d4: "", d5: "" });
    });

    it("pasting a new code over a complete one sends only the new code, once", () => {
      const { page } = create();
      fill(page, "111111");
      verifyPasswordCode.mockClear();

      page.onPaste(pasteOf("222222"));

      expect(verifyPasswordCode).toHaveBeenCalledTimes(1);
      expect(verifyPasswordCode).toHaveBeenCalledWith({
        email: "sara@example.com",
        code: "222222",
      });
    });

    it("understands the digits an Arabic keyboard types", () => {
      const { page } = create();
      page.onPaste(pasteOf("١٢٣٤٥٦"));

      expect(verifyPasswordCode).toHaveBeenCalledWith({
        email: "sara@example.com",
        code: "123456",
      });
    });
  });

  describe("typing and keys", () => {
    const boxesOf = (fixture: { nativeElement: HTMLElement }) =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(".otp-box"),
      );

    /** Types into a box the way a browser does: set the value, then fire `input`. */
    const type = (box: HTMLInputElement, value: string, data: string | null = value.slice(-1)) => {
      box.value = value;
      box.dispatchEvent(new InputEvent("input", { data, inputType: "insertText", bubbles: true }));
    };
    const key = (box: HTMLInputElement, name: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      box.dispatchEvent(event);
      return event;
    };

    it("typing a digit fills the box and moves to the next one", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      document.body.append(fixture.nativeElement);

      boxes[0].focus();
      type(boxes[0], "4");

      expect(page.form.controls["d0"].value).toBe("4");
      expect(document.activeElement).toBe(boxes[1]);
      fixture.nativeElement.remove();
    });

    it("typing over a filled box replaces its digit instead of adding to it", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      page.form.patchValue({ d2: "5" });

      type(boxes[2], "58", "8");

      expect(page.form.controls["d2"].value).toBe("8");
      expect(boxes[2].value).toBe("8");
    });

    it("a letter typed into a box is thrown away and the box keeps its digit", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      page.form.patchValue({ d1: "3" });

      type(boxes[1], "3x", "x");

      expect(page.form.controls["d1"].value).toBe("3");
      expect(boxes[1].value).toBe("3");
    });

    it("an SMS autofill that puts the whole code into one box spreads over all six", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);

      type(boxes[3], "482901", null); // not a keystroke: the OS filled the field

      expect(page.form.getRawValue()).toEqual({
        d0: "4",
        d1: "8",
        d2: "2",
        d3: "9",
        d4: "0",
        d5: "1",
      });
      expect(verifyPasswordCode).toHaveBeenCalledTimes(1);
      expect(verifyPasswordCode).toHaveBeenCalledWith({
        email: "sara@example.com",
        code: "482901",
      });
    });

    it("typing the sixth digit verifies the code", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      page.form.patchValue({ d0: "1", d1: "2", d2: "3", d3: "4", d4: "5" });
      verifyPasswordCode.mockClear();

      type(boxes[5], "6");

      expect(verifyPasswordCode).toHaveBeenCalledWith({
        email: "sara@example.com",
        code: "123456",
      });
    });

    it("Backspace on an empty box clears the previous box and goes back to it", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      document.body.append(fixture.nativeElement);
      page.form.patchValue({ d0: "1", d1: "2" });

      boxes[2].focus();
      const event = key(boxes[2], "Backspace");

      expect(event.defaultPrevented).toBe(true);
      expect(page.form.controls["d1"].value).toBe("");
      expect(page.form.controls["d0"].value).toBe("1");
      expect(document.activeElement).toBe(boxes[1]);
      fixture.nativeElement.remove();
    });

    it("Backspace on a filled box leaves the deleting to the browser", () => {
      const { fixture, page } = create();
      const boxes = boxesOf(fixture);
      page.form.patchValue({ d2: "7" });

      expect(key(boxes[2], "Backspace").defaultPrevented).toBe(false);
    });

    it("Arrow Left / Right, Home and End move between the boxes without leaving the row", () => {
      const { fixture } = create();
      const boxes = boxesOf(fixture);
      document.body.append(fixture.nativeElement);

      boxes[2].focus();
      key(boxes[2], "ArrowRight");
      expect(document.activeElement).toBe(boxes[3]);
      key(boxes[3], "ArrowLeft");
      key(boxes[2], "ArrowLeft");
      expect(document.activeElement).toBe(boxes[1]);
      key(boxes[1], "End");
      expect(document.activeElement).toBe(boxes[5]);
      key(boxes[5], "ArrowRight"); // already the last one
      expect(document.activeElement).toBe(boxes[5]);
      key(boxes[5], "Home");
      expect(document.activeElement).toBe(boxes[0]);
      key(boxes[0], "ArrowLeft"); // already the first one
      expect(document.activeElement).toBe(boxes[0]);
      fixture.nativeElement.remove();
    });

    it("blocks letters and symbols, but not digits, Arabic digits, Tab or Ctrl+V", () => {
      const { fixture } = create();
      const box = boxesOf(fixture)[0];

      expect(key(box, "a").defaultPrevented).toBe(true);
      expect(key(box, "-").defaultPrevented).toBe(true);
      expect(key(box, "5").defaultPrevented).toBe(false);
      expect(key(box, "٥").defaultPrevented).toBe(false);
      expect(key(box, "Tab").defaultPrevented).toBe(false);
      expect(key(box, "v", { ctrlKey: true }).defaultPrevented).toBe(false);
    });

    it("an Arabic digit typed is stored as a Western one", () => {
      const { fixture, page } = create();

      type(boxesOf(fixture)[0], "٣");

      expect(page.form.controls["d0"].value).toBe("3");
    });
  });

  describe("resend countdown", () => {
    it("starts at 00:45, counts down, and resend is blocked until it reaches zero", () => {
      const { page } = create();
      expect(page.formattedTime).toBe("00:45");

      page.resendCode();
      expect(forgotPassword).not.toHaveBeenCalled();

      vi.advanceTimersByTime(10_000);
      expect(page.formattedTime).toBe("00:35");

      vi.advanceTimersByTime(35_000);
      expect(page.secondsLeft).toBe(0);
    });

    it("after the countdown, resend asks for a new code and restarts the timer", () => {
      const { page } = create();
      vi.advanceTimersByTime(46_000);

      page.resendCode();

      expect(forgotPassword).toHaveBeenCalledWith({ email: "sara@example.com" });
      expect(page.secondsLeft).toBe(45);
    });

    it("a failed resend keeps the countdown at zero", () => {
      forgotPassword.mockReturnValue(of(false));
      const { page } = create();
      vi.advanceTimersByTime(46_000);

      page.resendCode();
      expect(page.secondsLeft).toBe(0);
    });
  });

  it("can change the email", () => {
    const { page } = create();
    page.changeEmail();
    expect(navigate).toHaveBeenCalledWith(["/forget-password"]);
  });
});
