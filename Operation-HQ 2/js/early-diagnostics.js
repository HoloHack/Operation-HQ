// early-diagnostics.js — executes before every feature script.
// Captures errors that previously appeared only as "newtab.html:0", keeps a
// small redacted ring buffer, and detects repeated incomplete startups.
(() => {
  const LOG_KEY = "hq_early_diagnostics_v1";
  const PENDING_KEY = "hq_boot_pending_v1";
  const CRASH_KEY = "hq_boot_crash_count_v1";
  const SAFE_KEY = "hq_safe_mode_v1";
  const MAX_ENTRIES = 25;
  const now = Date.now();

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function clean(value) {
    return String(value || "Unknown error")
      .replace(/(?:api[_-]?key|token|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "credential=[redacted]")
      .slice(0, 500);
  }

  function record(type, message, source, line, column) {
    const log = read(LOG_KEY, []);
    log.push({
      at: new Date().toISOString(),
      type: clean(type),
      message: clean(message),
      source: source ? String(source).split("/").slice(-2).join("/") : "newtab",
      line: Number(line) || 0,
      column: Number(column) || 0,
    });
    write(LOG_KEY, log.slice(-MAX_ENTRIES));
  }

  const previousPending = read(PENDING_KEY, null);
  let crashCount = Number(read(CRASH_KEY, 0)) || 0;
  if (previousPending && now - previousPending > 2500 && now - previousPending < 10 * 60 * 1000) {
    crashCount += 1;
    write(CRASH_KEY, crashCount);
    record("incomplete-startup", "The previous new-tab boot did not reach its healthy checkpoint.");
  }
  if (crashCount >= 3) write(SAFE_KEY, true);
  write(PENDING_KEY, now);

  window.addEventListener("error", event => {
    record("error", event.error?.message || event.message, event.filename, event.lineno, event.colno);
  }, true);
  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    record("unhandled-rejection", reason?.message || reason);
  });

  window.HQEarlyDiagnostics = {
    isSafeMode: () => read(SAFE_KEY, false) === true,
    entries: () => read(LOG_KEY, []),
    record,
    clearEntries() {
      try { localStorage.removeItem(LOG_KEY); } catch {}
    },
    markHealthy() {
      try { localStorage.removeItem(PENDING_KEY); localStorage.removeItem(CRASH_KEY); } catch {}
    },
    clearAndExitSafeMode() {
      try {
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(CRASH_KEY);
        localStorage.removeItem(SAFE_KEY);
        localStorage.removeItem(LOG_KEY);
      } catch {}
    },
  };
})();
