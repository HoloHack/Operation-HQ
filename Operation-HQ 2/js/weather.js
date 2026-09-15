// weather.js — compact weather chip near the clock + a detail flyout.
// Uses Open-Meteo: free, no API key required, no rate-limit hassle for a
// single personal device (10k calls/day free tier). Location comes from
// the browser's own geolocation prompt, with a manual city fallback if
// that's denied — never silently fails to "no weather."

const WEATHER_CODES = {
  0: { label: "Clear sky", icon: "sun" },
  1: { label: "Mostly clear", icon: "cloud-sun" },
  2: { label: "Partly cloudy", icon: "cloud-sun" },
  3: { label: "Overcast", icon: "cloud" },
  45: { label: "Fog", icon: "cloud-fog" },
  48: { label: "Fog", icon: "cloud-fog" },
  51: { label: "Light drizzle", icon: "cloud-rain" },
  53: { label: "Drizzle", icon: "cloud-rain" },
  55: { label: "Heavy drizzle", icon: "cloud-rain" },
  61: { label: "Light rain", icon: "cloud-rain" },
  63: { label: "Rain", icon: "cloud-rain" },
  65: { label: "Heavy rain", icon: "cloud-rain" },
  71: { label: "Light snow", icon: "cloud-snow" },
  73: { label: "Snow", icon: "cloud-snow" },
  75: { label: "Heavy snow", icon: "cloud-snow" },
  80: { label: "Rain showers", icon: "cloud-rain" },
  81: { label: "Rain showers", icon: "cloud-rain" },
  82: { label: "Violent showers", icon: "cloud-lightning" },
  95: { label: "Thunderstorm", icon: "cloud-lightning" },
  96: { label: "Thunderstorm + hail", icon: "cloud-lightning" },
  99: { label: "Thunderstorm + hail", icon: "cloud-lightning" },
};

const Weather = {
  CACHE_MS: 45 * 60 * 1000, // 45 min — weather doesn't need to be fetched every tab open
  LOCATION_REFRESH_MS: 6 * 60 * 60 * 1000,
  _forecastRequest: null,
  _forecastRetryAfter: 0,
  _lastForecastError: null,
  _lastLocationError: null,

  async settings() {
    const saved = await chrome.storage.local.get(["hq_weather_auto_location", "hq_weather_unit", "hq_weather_refresh"]);
    return {
      automatic: saved.hq_weather_auto_location !== false,
      unit: saved.hq_weather_unit === "fahrenheit" ? "fahrenheit" : "celsius",
      refreshMinutes: [15, 45, 90].includes(Number(saved.hq_weather_refresh)) ? Number(saved.hq_weather_refresh) : 45,
    };
  },

  async permissionState() {
    if (!navigator.geolocation) return "unavailable";
    try {
      const result = await navigator.permissions.query({ name: "geolocation" });
      return result.state || "unknown";
    } catch {
      return "unknown";
    }
  },

  formatTemperature(celsius, unit) {
    const value = unit === "fahrenheit" ? (Number(celsius) * 9 / 5) + 32 : Number(celsius);
    return `${Math.round(value)}°`;
  },

  async fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort("weather-timeout"); }, timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      const wrapped = new Error(timedOut || error?.name === "AbortError"
        ? "Weather service timed out"
        : "Weather service is unreachable");
      wrapped.code = timedOut || error?.name === "AbortError" ? "timeout" : "network";
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  },

  codeInfo(code) {
    return WEATHER_CODES[code] || { label: "—", icon: "thermometer-sun" };
  },

  async getLocation() {
    const { hq_weather_location } = await chrome.storage.local.get("hq_weather_location");
    return hq_weather_location || null;
  },

  async setLocationFromGeolocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      try {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const loc = {
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                name: "Current location",
                source: "automatic",
                accuracy: Math.round(pos.coords.accuracy || 0),
                updatedAt: Date.now(),
              };
              await chrome.storage.local.set({
                hq_weather_location: loc,
                hq_weather_auto_location: true,
                hq_weather_geo_next_offer: 0,
              });
              this._lastLocationError = null;
              resolve(loc);
            } catch (error) {
              this._lastLocationError = "Location was found, but Chrome could not save it.";
              resolve(null);
            }
          },
          (err) => {
            this._lastLocationError = err?.code === 1
              ? "Location permission is blocked."
              : err?.code === 3
                ? "Location lookup timed out."
                : "Location is temporarily unavailable.";
            resolve(null);
          },
          { enableHighAccuracy: false, maximumAge: 30 * 60 * 1000, timeout: 12000 }
        );
      } catch (e) {
        // Some Chrome extension-page contexts can throw synchronously here
        // (restrictive Permissions-Policy, etc.) instead of invoking the
        // error callback above. Without this catch, the returned Promise
        // would simply hang forever — the UI would sit on "Requesting
        // location…" indefinitely with no fallback ever shown, which is
        // functionally identical to a silent failure from the user's side.
        this._lastLocationError = "Chrome could not start location lookup.";
        resolve(null);
      }
    });
  },

  // Builds the same "City, Region, Country" label everywhere a hit gets
  // turned into a stored location, so a typed-Enter match and a clicked
  // suggestion always produce an identically-formatted name.
  labelFor(hit) {
    return [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  },

  async setLocationFromHit(hit) {
    const loc = { lat: hit.latitude, lon: hit.longitude, name: this.labelFor(hit), source: "manual", updatedAt: Date.now() };
    await chrome.storage.local.set({ hq_weather_location: loc, hq_weather_auto_location: false });
    return loc;
  },

  async setLocationByCity(city) {
    try {
      const res = await this.fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
      const data = await res.json();
      const hit = data.results?.[0];
      if (!hit) return null;
      return this.setLocationFromHit(hit);
    } catch (e) {
      this._lastLocationError = e?.message || "City lookup is temporarily unavailable.";
      return null;
    }
  },

  // As-you-type suggestions. Open-Meteo's own matching rules (verified
  // against their live docs, not assumed): empty and single-character
  // searches return nothing, so there's no point calling before 2 chars.
  async searchCities(query) {
    const q = (query || "").trim();
    if (q.length < 2) return [];
    try {
      const res = await this.fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results || [];
    } catch (e) {
      this._lastLocationError = e?.message || "City search is temporarily unavailable.";
      return [];
    }
  },

  async fetchWeather(loc) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
    const res = await this.fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return res.json();
  },

  locationKey(loc) {
    return `${Number(loc?.lat).toFixed(4)},${Number(loc?.lon).toFixed(4)}`;
  },

  async refreshForecast(loc) {
    const key = this.locationKey(loc);
    if (this._forecastRequest?.key === key) return this._forecastRequest.promise;
    if (Date.now() < this._forecastRetryAfter) return null;
    const promise = (async () => {
      try {
        const data = await this.fetchWeather(loc);
        await chrome.storage.local.set({ hq_weather_cache: { data, locationKey:key, fetchedAt:Date.now() } });
        this._lastForecastError = null;
        this._forecastRetryAfter = 0;
        document.dispatchEvent(new CustomEvent("hq:weather-updated"));
        return data;
      } catch (error) {
        this._lastForecastError = error?.message || "Weather service is unavailable";
        // One provider outage must not produce a fetch storm from the chip,
        // detail panel, living widget and scheduler at the same time.
        this._forecastRetryAfter = Date.now() + 5 * 60 * 1000;
        return null;
      } finally {
        if (this._forecastRequest?.promise === promise) this._forecastRequest = null;
      }
    })();
    this._forecastRequest = { key, promise };
    return promise;
  },

  async getCachedOrFetch() {
    const loc = await this.getLocation();
    if (!loc) return null;

    const { refreshMinutes } = await this.settings();
    const maxAge = refreshMinutes * 60 * 1000;
    const { hq_weather_cache } = await chrome.storage.local.get("hq_weather_cache");
    const key = this.locationKey(loc);
    const cacheMatches = hq_weather_cache?.data && (!hq_weather_cache.locationKey || hq_weather_cache.locationKey === key);
    if (cacheMatches && Date.now() - hq_weather_cache.fetchedAt < maxAge) {
      return hq_weather_cache.data;
    }
    if (cacheMatches) {
      // Stale-while-revalidate: paint the last real forecast instantly and
      // refresh once in the background instead of blocking every new tab.
      void this.refreshForecast(loc);
      return hq_weather_cache.data;
    }
    return this.refreshForecast(loc);
  },

  async renderChip() {
    const chip = document.getElementById("weather-chip");
    const tempEl = document.getElementById("weather-temp");
    if (!chip) return;
    const loc = await this.getLocation();
    if (!loc) {
      tempEl.innerHTML = `${Icons.span("map-pin")} Set location`;
      chip.classList.add("weather-chip-empty");
      return;
    }
    chip.classList.remove("weather-chip-empty");
    const data = await this.getCachedOrFetch();
    if (!data) {
      tempEl.innerHTML = `${Icons.span("thermometer-sun")} —`;
      chip.title = this._lastForecastError || "Weather will retry automatically";
      return;
    }
    chip.title = "Weather";
    const info = this.codeInfo(data.current.weather_code);
    const { unit } = await this.settings();
    tempEl.innerHTML = `${Icons.span(info.icon)} ${this.formatTemperature(data.current.temperature_2m, unit)}`;
  },

  async renderDetail() {
    const el = document.getElementById("weather-detail");
    const locLabel = document.getElementById("weather-location-label");
    if (!el) return;
    const loc = await this.getLocation();
    if (!loc) {
      el.innerHTML = '<p class="settings-note">No location set yet — allow geolocation or enter a city below.</p>';
      locLabel.textContent = "";
      return;
    }
    locLabel.textContent = loc.name;
    const source = document.getElementById("weather-source-badge");
    if (source) source.textContent = loc.source === "manual" ? "Manual" : "Automatic";
    const data = await this.getCachedOrFetch();
    if (!data) {
      el.innerHTML = `<p class="settings-note">${escapeHtml(this._lastForecastError || "The forecast service is temporarily unavailable")}. Your saved location is intact; HQ will retry automatically.</p>`;
      return;
    }
    const info = this.codeInfo(data.current.weather_code);
    const { unit } = await this.settings();
    const temp = this.formatTemperature(data.current.temperature_2m, unit);
    const hi = this.formatTemperature(data.daily.temperature_2m_max[0], unit);
    const lo = this.formatTemperature(data.daily.temperature_2m_min[0], unit);
    el.innerHTML = `
      <div class="weather-big">${Icons.span(info.icon)} ${temp}</div>
      <div class="weather-desc">${info.label}</div>
      <div class="weather-hilo">High ${hi} · Low ${lo}</div>
    `;
  },

  async renderPermissionState() {
    const el = document.getElementById("weather-permission-state");
    const settingsButton = document.getElementById("weather-open-settings-btn");
    const manual = document.getElementById("weather-manual-wrap");
    if (!el || !settingsButton || !manual) return;
    const { automatic } = await this.settings();
    const state = await this.permissionState();
    manual.classList.toggle("hidden", automatic && state !== "denied" && state !== "unavailable");
    settingsButton.classList.toggle("hidden", state !== "denied");
    el.dataset.state = state;
    if (!automatic) el.textContent = "Manual mode is active. Your typed city stays on this device.";
    else if (state === "granted") el.textContent = this._lastLocationError || "Automatic location is on. Coordinates stay on this device and are sent only to Open-Meteo for the forecast.";
    else if (state === "denied") el.textContent = "Location is blocked in Chrome or macOS. Open settings, allow Google Chrome, then refresh your location.";
    else if (state === "unavailable") el.textContent = "This device does not expose location. Switch off automatic location and choose a city.";
    else el.textContent = "Chrome will ask for location when the automatic refresh begins.";
  },

  async refreshAutomaticLocation({ force = false } = {}) {
    const { automatic } = await this.settings();
    if (!automatic) return this.getLocation();
    const existing = await this.getLocation();
    if (!force && existing?.source === "automatic" && Date.now() - Number(existing.updatedAt || 0) < this.LOCATION_REFRESH_MS) return existing;
    const result = await this.setLocationFromGeolocation();
    if (result) await chrome.storage.local.remove("hq_weather_cache");
    return result || existing || null;
  },

  async init() {
    const preferences = await this.settings();
    document.getElementById("weather-auto-location").checked = preferences.automatic;
    document.getElementById("weather-unit").value = preferences.unit;
    document.getElementById("weather-refresh").value = String(preferences.refreshMinutes);
    await Promise.all([this.renderPermissionState(), this.renderChip(), this.renderDetail()]);
    if (preferences.automatic) {
      // Geolocation may take twelve seconds on a sleeping network/OS service.
      // It refreshes after first paint and never blocks the new-tab boot.
      setTimeout(async () => {
        const before = await this.getLocation();
        const loc = await this.refreshAutomaticLocation();
        if (loc && (!before || loc.updatedAt !== before.updatedAt)) {
          await Promise.all([this.renderChip(), this.renderDetail(), this.renderPermissionState()]);
        } else if (!loc) await this.renderPermissionState();
      }, 0);
    }
    // weather-chip's click-to-open is handled by the shared dock system
    // (it has class="dock-btn") — just keep the data fresh in the background.
    PageScheduler.register("weather", 5 * 60 * 1000, () => Promise.all([this.renderChip(), this.renderDetail()]));
    document.addEventListener("hq:weather-updated", () => {
      this.renderChip();
      this.renderDetail();
      if (typeof LivingWidgets !== "undefined") LivingWidgets.queueRender();
    });
    document.getElementById("weather-use-geo-btn").onclick = async () => {
      document.getElementById("weather-detail").innerHTML = '<p class="settings-note">Requesting location…</p>';
      const loc = await this.refreshAutomaticLocation({ force: true });
      if (!loc) {
        document.getElementById("weather-detail").innerHTML = '<p class="settings-note">Location is still unavailable. Check Chrome and macOS location access, or use manual city mode.</p>';
        await this.renderPermissionState();
        return;
      }
      await chrome.storage.local.remove("hq_weather_cache");
      await Promise.all([this.renderDetail(), this.renderChip(), this.renderPermissionState()]);
    };
    document.getElementById("weather-open-settings-btn").onclick = () => chrome.tabs.create({ url: "chrome://settings/content/location" });
    document.getElementById("weather-auto-location").onchange = async (event) => {
      await chrome.storage.local.set({ hq_weather_auto_location: event.target.checked });
      if (event.target.checked) await this.refreshAutomaticLocation({ force: true });
      await Promise.all([this.renderPermissionState(), this.renderDetail(), this.renderChip()]);
    };
    document.getElementById("weather-unit").onchange = async (event) => {
      await chrome.storage.local.set({ hq_weather_unit: event.target.value });
      await Promise.all([this.renderDetail(), this.renderChip()]);
    };
    document.getElementById("weather-refresh").onchange = async (event) => {
      await chrome.storage.local.set({ hq_weather_refresh: Number(event.target.value) });
      await chrome.storage.local.remove("hq_weather_cache");
      await Promise.all([this.renderDetail(), this.renderChip()]);
    };
    this.wireCityAutocomplete();
  },

  // Shared by both the "click a suggestion" and "type + Enter without
  // picking one" paths, so the two can never drift out of sync in what
  // happens after the location actually changes.
  async afterLocationSet() {
    await chrome.storage.local.remove("hq_weather_cache");
    document.getElementById("weather-city-input").value = "";
    this.hideSuggestions();
    document.getElementById("weather-auto-location").checked = false;
    await Promise.all([this.renderDetail(), this.renderChip(), this.renderPermissionState()]);
  },

  hideSuggestions() {
    const box = document.getElementById("weather-city-suggestions");
    box.innerHTML = "";
    box.classList.add("hidden");
    this._suggestions = [];
    this._selectedSuggestion = -1;
  },

  renderSuggestions() {
    const box = document.getElementById("weather-city-suggestions");
    if (!this._suggestions.length) { this.hideSuggestions(); return; }
    box.innerHTML = this._suggestions.map((hit, i) => `
      <li class="weather-suggestion ${i === this._selectedSuggestion ? "selected" : ""}" data-i="${i}">
        ${escapeHtml(this.labelFor(hit))}
      </li>`).join("");
    box.classList.remove("hidden");
    // mousedown, not click — fires before the input's blur, so a click on a
    // suggestion registers before hideSuggestions() (triggered on blur)
    // would otherwise remove it out from under the click.
    box.querySelectorAll(".weather-suggestion").forEach(el => {
      el.onmousedown = (e) => { e.preventDefault(); this.chooseSuggestion(parseInt(el.dataset.i)); };
    });
  },

  async chooseSuggestion(i) {
    const hit = this._suggestions[i];
    if (!hit) return;
    await this.setLocationFromHit(hit);
    await this.afterLocationSet();
  },

  wireCityAutocomplete() {
    const input = document.getElementById("weather-city-input");
    this._suggestions = [];
    this._selectedSuggestion = -1;
    let debounceTimer = null;

    input.oninput = () => {
      clearTimeout(debounceTimer);
      const query = input.value;
      if (query.trim().length < 2) { this.hideSuggestions(); return; }
      debounceTimer = setTimeout(async () => {
        this._suggestions = await this.searchCities(query);
        this._selectedSuggestion = -1;
        this.renderSuggestions();
      }, 300);
    };

    input.onblur = () => {
      // Slight delay so a suggestion's mousedown (which preventDefault()s,
      // so blur still fires) has already run chooseSuggestion() first.
      setTimeout(() => this.hideSuggestions(), 150);
    };

    input.onkeydown = async (e) => {
      if (e.key === "ArrowDown" && this._suggestions.length) {
        e.preventDefault();
        this._selectedSuggestion = Math.min(this._selectedSuggestion + 1, this._suggestions.length - 1);
        this.renderSuggestions();
        return;
      }
      if (e.key === "ArrowUp" && this._suggestions.length) {
        e.preventDefault();
        this._selectedSuggestion = Math.max(this._selectedSuggestion - 1, -1);
        this.renderSuggestions();
        return;
      }
      if (e.key === "Escape") { this.hideSuggestions(); return; }
      if (e.key !== "Enter") return;

      e.preventDefault();
      if (this._selectedSuggestion >= 0 && this._suggestions[this._selectedSuggestion]) {
        await this.chooseSuggestion(this._selectedSuggestion);
        return;
      }
      // Enter with nothing highlighted — fall back to a direct lookup of
      // whatever's typed, same as before autocomplete existed.
      const city = input.value.trim();
      if (!city) return;
      document.getElementById("weather-detail").innerHTML = '<p class="settings-note">Looking up city…</p>';
      const loc = await this.setLocationByCity(city);
      if (!loc) {
        document.getElementById("weather-detail").innerHTML = '<p class="settings-note">Couldn\'t find that city — try a different spelling.</p>';
        return;
      }
      await this.afterLocationSet();
    };
  },
};
