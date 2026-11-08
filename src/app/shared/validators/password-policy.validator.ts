/**
 * password-policy.validator.ts
 *
 * PM-8 — single source of truth for the application's password policy.
 *
 * These rules previously lived inline inside
 * `auth/pages/create-new-password/create-new-password.ts`, while the
 * Profile "Change Password" flow only enforced `Validators.minLength(8)`.
 * Two password-setting flows, two different policies — the weaker one
 * silently accepting passwords the stronger one rejects.
 *
 * The rules below are the EXISTING stronger policy, moved here verbatim
 * (same 5 checks, same i18n label keys) so both flows share one
 * definition. Nothing was tightened or loosened in the move.
 */

import { AbstractControl, ValidationErrors, ValidatorFn } from "@angular/forms";

export interface PasswordStrengthRule {
  key: "minLength" | "upper" | "lower" | "number" | "special";
  labelKey: string;
  test: (value: string) => boolean;
}

/** The application's password policy — every rule must pass. */
export const PASSWORD_POLICY_RULES: readonly PasswordStrengthRule[] = [
  {
    key: "minLength",
    labelKey: "AUTH.RULE_MIN_LENGTH",
    test: (v) => v.length >= 8,
  },
  {
    key: "upper",
    labelKey: "AUTH.RULE_UPPERCASE",
    test: (v) => /[A-Z]/.test(v),
  },
  {
    key: "lower",
    labelKey: "AUTH.RULE_LOWERCASE",
    test: (v) => /[a-z]/.test(v),
  },
  {
    key: "number",
    labelKey: "AUTH.RULE_NUMBER",
    test: (v) => /[0-9]/.test(v),
  },
  {
    key: "special",
    labelKey: "AUTH.RULE_SPECIAL",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/**
 * Returns `{ weak: true }` unless the value satisfies every rule above.
 * Error key kept as `weak` — that's what the existing Create New Password
 * template already checks for, so no template had to change there.
 */
export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: string = control.value ?? "";
    if (!value) return null; // `Validators.required` owns the empty case.
    return PASSWORD_POLICY_RULES.every((rule) => rule.test(value)) ? null : { weak: true };
  };
}

/** Set of rule keys the given value currently satisfies (drives the checklist UI). */
export function passedPasswordRules(value: string): Set<string> {
  const passed = new Set<string>();
  for (const rule of PASSWORD_POLICY_RULES) {
    if (rule.test(value)) passed.add(rule.key);
  }
  return passed;
}
