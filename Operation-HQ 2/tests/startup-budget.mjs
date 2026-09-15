import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const bootstrap = read("js/newtab.js");
const html = read("newtab.html");
const manifest = bootstrap.match(/const CORE_SCRIPTS[^[]*\[([\s\S]*?)\n\]\);/);
assert(manifest, "CORE_SCRIPTS manifest was not found");

const core = [...manifest[1].matchAll(/"([^"]+\.js)"/g)].map(match => match[1]);
const bytes = core.reduce((total, file) => {
  assert(fs.existsSync(path.join(root, file)), `Missing core script: ${file}`);
  return total + fs.statSync(path.join(root, file)).size;
}, 0);

const forbiddenAtBoot = [
  "js/lib/webllm/web-llm.js",
  "js/lib/tiptap/tiptap-bundle.js",
  "js/lib/chart.umd.min.js",
  "js/local-ai.js",
  "js/gmail.js",
  "js/calendar.js",
  "js/notes-editor.js",
  "js/daily-planner.js",
  "js/assessment-intake.js",
];
forbiddenAtBoot.forEach(file => assert(!core.includes(file), `${file} must remain demand-loaded`));

assert(core.length <= 30, `Startup script count regressed to ${core.length}`);
assert(bytes <= 375_000, `Startup source budget regressed to ${bytes.toLocaleString()} bytes`);
assert.deepEqual(
  [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]),
  ["js/early-diagnostics.js", "js/newtab.js"],
  "HTML must keep only diagnostics and the bootstrap entrypoint",
);
assert(bootstrap.includes("deferOptionalStartup()"), "Conditional post-paint hydration is missing");

const compositor = read("js/ambient-compositor.js");
assert(compositor.includes("releaseDrawingBuffer()"), "Hidden compositor does not release its screen-sized drawing buffer");
assert(compositor.includes('powerPreference = this.settings.quality === "ultra" ? "high-performance" : "low-power"'), "Auto compositor must prefer the low-power GPU path");

const oldCoreBytes = 501_347;
const reduction = Math.round((1 - bytes / oldCoreBytes) * 1000) / 10;
console.log(`✓ Startup budget: ${core.length} core scripts, ${bytes.toLocaleString()} source bytes (${reduction}% below the prior core), heavy vendors demand-loaded, hidden GPU buffer released`);
