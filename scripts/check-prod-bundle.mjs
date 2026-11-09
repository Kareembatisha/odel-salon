// Fails when a production-like bundle contains mock code or a mock-enabled environment.
// Usage: npm run build && npm run check:prod-bundle   (also after `npm run build:template-brand`)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist/odel-salon-admin/browser";
if (!existsSync(dir)) {
  console.error(`check-prod-bundle: ${dir} not found — run a production build first.`);
  process.exit(2);
}

// Strings that only exist in mock repositories / mock data (see src/app/core/mock, *-mock.repository.ts).
const MOCK_MARKERS = [
  "Nasr City",
  "Chair not found",
  "Offer not found",
  'startsWith("manager")',
  "Operation completed successfully",
];

const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
const text = files.map((f) => [f, readFileSync(join(dir, f), "utf8")]);
const problems = [];

for (const [file, src] of text) {
  for (const marker of MOCK_MARKERS) {
    if (src.includes(marker))
      problems.push(`${file}: contains mock marker ${JSON.stringify(marker)}`);
  }
  if (src.includes("useMock:!0")) problems.push(`${file}: environment.useMock is true`);
}
if (!text.some(([, src]) => src.includes("useMock:!1"))) {
  problems.push("no `useMock:!1` found — the production environment may not have been applied");
}

if (problems.length) {
  console.error("check-prod-bundle: FAILED\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(`check-prod-bundle: OK (${files.length} JS files, no mock code, useMock is false)`);
