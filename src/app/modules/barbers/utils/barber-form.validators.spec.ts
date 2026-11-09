import { FormControl } from "@angular/forms";
import { describe, expect, it } from "vitest";
import { egyptianMobile } from "./barber-form.validators";

describe("egyptianMobile", () => {
  it.each(["+201001234567", "01001234567", "+20 100 123 4567", "0100-123-4567"])(
    "accepts %s",
    (v) => expect(egyptianMobile(new FormControl(v))).toBeNull(),
  );

  it.each(["12345", "+14155550123", "0200123456", "abc"])("rejects %s", (v) =>
    expect(egyptianMobile(new FormControl(v))).toEqual({ phone: true }),
  );

  it("leaves an empty value to `required`", () =>
    expect(egyptianMobile(new FormControl(""))).toBeNull());
});
