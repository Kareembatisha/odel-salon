// @ts-check
import tseslint from "typescript-eslint";
import angular from "angular-eslint";

/**
 * Deliberately small rule set: it enforces the approved architecture standard
 * (see docs/step-02) without re-litigating every stylistic choice.
 * Formatting is Prettier's job (npm run format).
 */
export default tseslint.config(
  { ignores: ["dist/**", ".angular/**", "node_modules/**"] },
  {
    files: ["src/**/*.ts"],
    extends: [tseslint.configs.base],
    processor: angular.processInlineTemplates,
    rules: {
      // Cross-layer imports go through the tsconfig aliases, never deep relative paths.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+(shared|core)/",
              message: "Use the @shared/* or @core/* alias instead of a relative path.",
            },
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.spec.ts"],
    plugins: { "@angular-eslint": angular.tsPlugin, "@typescript-eslint": tseslint.plugin },
    rules: {
      // Reported, not yet failing: existing occurrences are cleaned up in Step 04 (R-11).
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@angular-eslint/prefer-on-push-component-change-detection": "error",
      "@angular-eslint/prefer-standalone": "error",
    },
  },
);
