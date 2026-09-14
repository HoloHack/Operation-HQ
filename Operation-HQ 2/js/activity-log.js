// activity-log.js — lightweight shared completion counter feeding the
// weekly stats chart. Records only counts per day per type, never task
// text/content, so it stays small and fast to read even after months.

const ActivityLog = {
  todayKey() {
    return hqLocalDateKey();
  },

  // type: "task" | "daily" | "plan"
  async record(type) {
    const { hq_daily_completion_counts } = await chrome.storage.local.get("hq_daily_completion_counts");
    const counts = hq_daily_completion_counts || {};
    const day = this.todayKey();
    if (!counts[day]) counts[day] = { task: 0, daily: 0, plan: 0 };
    counts[day][type] = (counts[day][type] || 0) + 1;
    await chrome.storage.local.set({ hq_daily_completion_counts: counts });
  },

  async getLastNDays(n) {
    const { hq_daily_completion_counts } = await chrome.storage.local.get("hq_daily_completion_counts");
    const counts = hq_daily_completion_counts || {};
    const days = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const day = new Date(d);
      day.setDate(d.getDate() - i);
      const key = hqLocalDateKey(day);
      const c = counts[key] || { task: 0, daily: 0, plan: 0 };
      days.push({
        key,
        label: day.toLocaleDateString([], { weekday: "short" }),
        task: c.task || 0,
        daily: c.daily || 0,
        plan: c.plan || 0,
        total: (c.task || 0) + (c.daily || 0) + (c.plan || 0),
      });
    }
    return days;
  },
};
