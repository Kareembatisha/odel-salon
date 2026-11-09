import { FormControl } from "@angular/forms";
import { describe, expect, it } from "vitest";

import { maxTrimmedLength, notBlank } from "./text.validators";

describe("notBlank", () => {
  it.each(["", "   ", "\t\n", null, undefined])("rejects %j", (v) =>
    expect(notBlank(new FormControl(v))).toEqual({ required: true }),
  );
  it("accepts text", () => expect(notBlank(new FormControl(" Karim "))).toBeNull());
});

describe("maxTrimmedLength", () => {
  const max5 = maxTrimmedLength(5);

  it("accepts text that fits once trimmed, however much padding it has", () => {
    expect(max5(new FormControl("  abcde  "))).toBeNull();
    expect(max5(new FormControl("abcde "))).toBeNull();
  });

  it("rejects text that is too long after trimming, with the maxlength error shape", () => {
    expect(max5(new FormControl(" abcdef "))).toEqual({
      maxlength: { requiredLength: 5, actualLength: 6 },
    });
  });

  it("treats empty / missing values as valid (leave that to notBlank)", () => {
    expect(max5(new FormControl(""))).toBeNull();
    expect(max5(new FormControl(null))).toBeNull();
  });
});
