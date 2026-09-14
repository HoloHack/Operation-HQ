// weekly-stats.js — renders the completion history as a real chart (bundled
// Chart.js, loaded locally per MV3's CSP — no CDN scripts are allowed in
// extension pages). Framing follows the research: lead with the gap to the
// next milestone ("2 days to your next reward" tests better than restating
// a completed history), not just a bare number.

const WeeklyStats = {
  chart: null,

  async render() {
    const canvas = document.getElementById("weekly-stats-canvas");
    if (!canvas || typeof Chart === "undefined") return;

    const days = await ActivityLog.getLastNDays(7);
    const streak = await DailyTasks.computeStreak();
    const milestone = DailyTasks.nextMilestoneGap(streak);
    const freezesLeft = DailyTasks.freezesRemaining();

    document.getElementById("weekly-stats-headline").textContent = milestone
      ? `${milestone.gap} day${milestone.gap === 1 ? "" : "s"} to your ${milestone.next}-day streak milestone`
      : `${streak}-day streak — past every milestone tracked, incredible`;
    document.getElementById("weekly-stats-sub").textContent =
      `${freezesLeft} streak freeze${freezesLeft === 1 ? "" : "s"} left this month · ${days.reduce((s, d) => s + d.total, 0)} completions this week`;

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: days.map(d => d.label),
        datasets: [
          { label: "Daily Non-Negotiables", data: days.map(d => d.daily), backgroundColor: "#7c5cff" },
          { label: "Tasks", data: days.map(d => d.task), backgroundColor: "#4da6ff" },
          { label: "Today's Plan", data: days.map(d => d.plan), backgroundColor: "#00d4a0" },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: "#a0a0b0" } },
          y: { stacked: true, beginAtZero: true, ticks: { color: "#a0a0b0", stepSize: 1 }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
        plugins: {
          legend: { labels: { color: "#e0e0e8", boxWidth: 12, font: { size: 11 } } },
        },
      },
    });
  },

  init() {
    this.render();
  },
};
