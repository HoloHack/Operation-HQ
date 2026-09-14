// seed.js — initializes an honest empty workspace once.
// Real user data is never fabricated. Existing installations keep all of
// their current tasks and ventures; this only affects a genuinely fresh start.
const Seed = {
  async run() {
    const { hq_tasks, hq_ventures, hq_seeded } = await chrome.storage.local.get(["hq_tasks", "hq_ventures", "hq_seeded"]);
    if (hq_seeded) return;
    await chrome.storage.local.set({
      hq_tasks: Array.isArray(hq_tasks) ? hq_tasks : [],
      hq_ventures: Array.isArray(hq_ventures) ? hq_ventures : [],
      hq_seeded: true
    });
  }
};
