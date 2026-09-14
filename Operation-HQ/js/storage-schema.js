// storage-schema.js — versioned, non-destructive storage migrations.
// Every future data-shape change must be added as a numbered migration.
const StorageSchema = {
  KEY: "hq_schema_version",
  CURRENT: 8,

  migrations: {
    // Establish honest empty collections without replacing existing data.
    1(state) {
      const patch = {};
      for (const key of ["hq_tasks", "hq_ventures", "hq_daily_templates", "hq_capture_inbox", "hq_wallpaper_blocklist"]) {
        if (!Array.isArray(state[key])) patch[key] = [];
      }
      if (!state.hq_context || typeof state.hq_context !== "object" || Array.isArray(state.hq_context)) {
        patch.hq_context = null;
      }
      return patch;
    },

    // Normalise values known to cause UI/runtime faults when malformed imports
    // supplied strings, nulls or out-of-range numbers.
    2(state) {
      const patch = {};
      const interval = Number(state.hq_wallpaper_interval_value);
      if (!Number.isFinite(interval) || interval < 1) patch.hq_wallpaper_interval_value = 1;
      const volume = Number(state.hq_sound_volume);
      if (!Number.isFinite(volume)) patch.hq_sound_volume = 0.25;
      else if (volume < 0 || volume > 1) patch.hq_sound_volume = Math.max(0, Math.min(1, volume));
      if (state.hq_custom_wallpapers != null && !Array.isArray(state.hq_custom_wallpapers)) patch.hq_custom_wallpapers = [];
      return patch;
    },

    // Communications/workspace collections are explicitly empty on first use.
    3(state) {
      const patch = {};
      if (!Array.isArray(state.hq_browser_workspaces)) patch.hq_browser_workspaces = [];
      if (!Array.isArray(state.hq_nexus_recent)) patch.hq_nexus_recent = [];
      const cache = state.hq_gmail_cache_v1;
      if (cache != null && (!cache || typeof cache !== "object" || !Array.isArray(cache.messages))) patch.hq_gmail_cache_v1 = null;
      return patch;
    },

    // Unified Today and focus scenes use bounded local collections only.
    4(state) {
      const patch = {};
      if (!Array.isArray(state.hq_followups)) patch.hq_followups = [];
      if (!Array.isArray(state.hq_focus_interruptions)) patch.hq_focus_interruptions = [];
      if (!state.hq_focus_timeline || typeof state.hq_focus_timeline !== "object" || Array.isArray(state.hq_focus_timeline)) patch.hq_focus_timeline = {};
      return patch;
    },

    // Assessment Intake starts empty and keeps optional scan preferences in a
    // bounded object. Folder handles live separately in IndexedDB because
    // chrome.storage cannot preserve File System Access capabilities.
    5(state) {
      const patch = {};
      if (!Array.isArray(state.hq_assessment_intake_v1)) patch.hq_assessment_intake_v1 = [];
      if (!Array.isArray(state.hq_assessment_download_events_v1)) patch.hq_assessment_download_events_v1 = [];
      const settings = state.hq_assessment_intake_settings_v1;
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        patch.hq_assessment_intake_settings_v1 = { autoScan: true, onlyLikely: true };
      }
      return patch;
    },

    // Gleam is hidden until opened and starts without a profile or synthetic
    // progress. Curriculum content lives in code; only real activity is saved.
    6(state) {
      const patch = {};
      const gleam = state.hq_gleam_v1;
      if (gleam != null && (!gleam || typeof gleam !== "object" || Array.isArray(gleam))) patch.hq_gleam_v1 = null;
      return patch;
    },

    // Notes and Calendar gain richer, versioned metadata without replacing
    // their legacy plain-text compatibility mirrors. Malformed imports are
    // quarantined to empty/null shapes; real existing content is preserved and
    // migrated by the owning module where it can also create a recovery copy.
    7(state) {
      const patch = {};
      const notes = state.hq_notes_document_v2;
      if (notes != null && (!notes || typeof notes !== "object" || Array.isArray(notes) || notes.version !== 2 || typeof notes.html !== "string" || typeof notes.plain !== "string")) {
        patch.hq_notes_document_v2 = null;
      }
      const calendar = state.hq_calendar_details_v2;
      if (calendar != null && (!calendar || typeof calendar !== "object" || Array.isArray(calendar))) patch.hq_calendar_details_v2 = {};
      const undo = state.hq_calendar_undo_v2;
      if (undo != null && (!undo || typeof undo !== "object" || Array.isArray(undo))) patch.hq_calendar_undo_v2 = null;
      return patch;
    },

    // Study OS adds research provenance and bounded recall-session settings.
    // Existing assignments and flashcards keep their original keys/shapes;
    // their owning modules enrich them non-destructively on load.
    8(state) {
      const patch = {};
      if (!Array.isArray(state.hq_assignments_v1)) patch.hq_assignments_v1 = [];
      if (!Array.isArray(state.hq_research_sources_v1)) patch.hq_research_sources_v1 = [];
      if (!Array.isArray(state.hq_srs_cards)) patch.hq_srs_cards = [];
      if (!Array.isArray(state.hq_srs_languages)) patch.hq_srs_languages = [];
      const study = state.hq_study_preferences_v1;
      if (!study || typeof study !== "object" || Array.isArray(study)) patch.hq_study_preferences_v1 = { missionMinutes: 25 };
      const recall = state.hq_srs_settings_v2;
      if (!recall || typeof recall !== "object" || Array.isArray(recall)) patch.hq_srs_settings_v2 = { sessionLimit: 20 };
      return patch;
    },
  },

  async migrate() {
    const state = await chrome.storage.local.get(null);
    let version = Number(state[this.KEY]) || 0;
    if (version > this.CURRENT) throw new Error(`Data schema ${version} is newer than this extension supports.`);
    for (let next = version + 1; next <= this.CURRENT; next += 1) {
      const changes = this.migrations[next]?.(Object.assign(state, {})) || {};
      Object.assign(state, changes, { [this.KEY]: next });
      await chrome.storage.local.set({ ...changes, [this.KEY]: next });
      version = next;
    }
    return version;
  },
};
