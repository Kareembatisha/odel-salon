// Keeps the two repository-provider files in step and mock-free where it matters.
//   src/app/app.providers.ts       development / mock-capable
//   src/app/app.providers.prod.ts  production — swapped in by angular.json fileReplacements
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/app/${f}`, import.meta.url), "utf8");
const dev = read("app.providers.ts");
const prod = read("app.providers.prod.ts");
const tokens = (src) =>
  [...src.matchAll(/provide:\s*([A-Z_]+_REPOSITORY)/g)].map((m) => m[1]).sort();

const problems = [];
const devTokens = tokens(dev);
const prodTokens = tokens(prod);

if (JSON.stringify(devTokens) !== JSON.stringify(prodTokens)) {
  problems.push(
    `token lists differ.\n    dev:  ${devTokens.join(", ")}\n    prod: ${prodTokens.join(", ")}`,
  );
}
if (new Set(prodTokens).size !== prodTokens.length) problems.push("prod registers a token twice");
if (/mock/i.test(prod.replace(/\/\*[\s\S]*?\*\//g, ""))) {
  problems.push("app.providers.prod.ts references mock code (outside comments)");
}
if (!/useMock/.test(dev))
  problems.push("app.providers.ts no longer switches on environment.useMock");

// angular.json must swap the file in for every production-like configuration.
const angular = JSON.parse(readFileSync(new URL("../angular.json", import.meta.url), "utf8"));
const configs = Object.values(angular.projects)[0].architect.build.configurations;
for (const name of ["production", "production-brand-template"]) {
  const swaps = (configs[name]?.fileReplacements ?? []).map((r) => `${r.replace} -> ${r.with}`);
  const want = "src/app/app.providers.ts -> src/app/app.providers.prod.ts";
  if (!swaps.includes(want))
    problems.push(`angular.json "${name}" does not swap the providers file`);
}

if (problems.length) {
  console.error("check-providers: FAILED\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
console.log(
  `check-providers: OK (${prodTokens.length} tokens in both files; prod has no mock references)`,
);
