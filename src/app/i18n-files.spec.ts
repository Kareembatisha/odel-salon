import { describe, expect, it } from "vitest";

import ar from "../assets/i18n/ar.json";
import en from "../assets/i18n/en.json";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? { ...acc, [path]: value }
      : { ...acc, ...leaves(value, path) };
  }, {});
}

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

describe("translation files", () => {
  const english = leaves(en as Tree);
  const arabic = leaves(ar as Tree);

  it("define the same keys in English and Arabic", () => {
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
  });

  it("have no empty values", () => {
    const empty = [...Object.entries(english), ...Object.entries(arabic)]
      .filter(([, value]) => !value.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it("use the same {{placeholders}} in both languages", () => {
    const mismatched = Object.keys(english).filter(
      (key) =>
        JSON.stringify(placeholders(english[key])) !== JSON.stringify(placeholders(arabic[key])),
    );
    expect(mismatched).toEqual([]);
  });

  it("label every field name the API reports in validation errors for users, auth and profile", () => {
    // Field names come from the OpenAPI request models; without a label the toast shows the
    // humanised English name even in the Arabic UI.
    const apiFields = [
      "Email",
      "CountryCode",
      "PhoneNumber",
      "Password",
      "PasswordConfirmation",
      "CurrentPassword",
      "NewPassword",
      "NewPasswordConfirmation",
      "RoleId",
      "Permissions",
      "Code",
      "Token",
      "FullName",
      "Name",
    ];
    const missing = apiFields.filter(
      (f) => !english[`VALIDATION_FIELDS.${f}`] || !arabic[`VALIDATION_FIELDS.${f}`],
    );
    expect(missing).toEqual([]);
  });
});
