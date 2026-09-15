import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function filesUnder(folder) {
  return fs.readdirSync(folder, { withFileTypes:true }).flatMap(entry => {
    const target = path.join(folder, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

// `node --check file.js` parses CommonJS inside a wrapper function, so it did
// not catch a stray top-level `return` that Chrome correctly rejected as an
// "Illegal return statement". vm.Script uses browser-classic-script grammar.
const classicScripts = filesUnder(path.join(root, "js")).filter(file =>
  file.endsWith(".js") && !file.includes(`${path.sep}lib${path.sep}webllm${path.sep}`)
);
for (const file of classicScripts) {
  assert.doesNotThrow(
    () => new vm.Script(fs.readFileSync(file, "utf8"), { filename:path.relative(root, file) }),
    undefined,
    `${path.relative(root, file)} is not valid as a browser classic script`,
  );
}

const storage = new Map();
const storageApi = {
  async get(keys) {
    const names = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
    return Object.fromEntries(names.filter(key => storage.has(key)).map(key => [key, storage.get(key)]));
  },
  async set(values) { Object.entries(values).forEach(([key, value]) => storage.set(key, value)); },
  async remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(key => storage.delete(key)); },
};
const weatherContext = vm.createContext({
  chrome:{ storage:{ local:storageApi } },
  navigator:{},
  document:{ dispatchEvent() {} },
  CustomEvent:class CustomEvent { constructor(type) { this.type = type; } },
  AbortController,
  URL,
  setTimeout,
  clearTimeout,
  console,
  Date,
  Number,
  String,
});
vm.runInContext(read("js/weather.js"), weatherContext, { filename:"js/weather.js" });
const WeatherUnit = vm.runInContext("Weather", weatherContext);
let forecastCalls = 0;
WeatherUnit.fetchWeather = async () => {
  forecastCalls += 1;
  await new Promise(resolve => setTimeout(resolve, 5));
  return { current:{ temperature_2m:20, weather_code:0 }, daily:{ temperature_2m_max:[22], temperature_2m_min:[12] } };
};
await Promise.all([
  WeatherUnit.refreshForecast({ lat:-33.86, lon:151.2 }),
  WeatherUnit.refreshForecast({ lat:-33.86, lon:151.2 }),
  WeatherUnit.refreshForecast({ lat:-33.86, lon:151.2 }),
]);
assert.equal(forecastCalls, 1, "Concurrent weather surfaces must share one forecast request");

WeatherUnit.fetchWeather = async () => { throw new TypeError("Failed to fetch"); };
await WeatherUnit.refreshForecast({ lat:-37.81, lon:144.96 });
assert.equal(WeatherUnit._lastForecastError, "Failed to fetch");
assert(WeatherUnit._forecastRetryAfter > Date.now(), "Provider failure must activate forecast backoff");

const wallpaperContext = vm.createContext({
  chrome:{ storage:{ local:storageApi } },
  CredentialVault:{ async get() { return {}; } },
  URL,
  Request,
  Response,
  AbortController,
  setTimeout,
  clearTimeout,
  console,
  Date,
  Number,
  String,
});
vm.runInContext(read("js/wallpaper.js"), wallpaperContext, { filename:"js/wallpaper.js" });
const WallpaperUnit = vm.runInContext("Wallpaper", wallpaperContext);
assert.equal(WallpaperUnit.is4KDimensions(3840, 1600), true, "4K-width ultrawides must pass the quality gate");
assert.equal(WallpaperUnit.is4KDimensions(3839, 2160), false, "Sub-4K-width images must remain rejected");
let fallbackOrder = [];
WallpaperUnit.fetchUnsplash = async () => { fallbackOrder.push("unsplash"); return null; };
WallpaperUnit.fetchPexels = async () => { fallbackOrder.push("pexels"); return { url:"https://images.pexels.com/example.jpg", provider:"pexels" }; };
const recovered = await WallpaperUnit.fetchPhotoFallback("cars", { q:"night car" }, { unsplash:"key", pexels:"key" });
assert.deepEqual(fallbackOrder, ["unsplash", "pexels"]);
assert.equal(recovered.providerFallback, true);
assert.equal(await WallpaperUnit.fetchPhotoFallback("anime", { q:"anime" }, { unsplash:"key", pexels:"key" }), null, "Named anime must not silently degrade to an unrelated stock photo");

const gmailContext = vm.createContext({ console, String });
vm.runInContext(read("js/gmail.js"), gmailContext, { filename:"js/gmail.js" });
const GmailUnit = vm.runInContext("Gmail", gmailContext);
assert.match(GmailUnit.diagnoseAuthError(new Error("403 access_denied")), /Test users/);

const bootstrap = read("js/newtab.js");
assert(
  bootstrap.indexOf("document.activeElement?.blur?.()") < bootstrap.indexOf('f.setAttribute("aria-hidden", "true")'),
  "Panel focus must move before aria-hidden is applied",
);
assert(bootstrap.includes('.settings-tab[data-cat="general"]'), "Recovery diagnostics must route to the real General settings tab");

console.log(`✓ Browser runtime: ${classicScripts.length} classic scripts parse, Gmail loads, weather deduplicates/backoffs, wallpaper recovery and focus-safe panel closing hold`);
