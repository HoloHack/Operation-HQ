import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../Operation-HQ 2/", import.meta.url));
const suites = ["bookmarks", "bookmark-safety", "model-lifecycle", "intelligence", "integrity", "startup-budget", "browser-runtime", "verify"];
for (const suite of suites) {
  console.log(`\nChecking ${suite}`);
  const result = spawnSync(process.execPath, [`tests/${suite}.mjs`], { cwd, stdio: "inherit", timeout: 120_000 });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message || `${suite} failed`);
    process.exit(result.status || 1);
  }
}
console.log(`\nAll ${suites.length} source regression suites passed. Real Chrome, OAuth and device RAM acceptance are separate gates.`);
