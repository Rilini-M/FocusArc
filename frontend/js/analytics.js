function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function emptyState(message) {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

async function loadOverview() {
  const overview = await api.get('/analytics/overview');

  document.getElementById('stat-total-quests').textContent = overview.totalQuests;
  document.getElementById('stat-completed-quests').textContent = overview.completedQuests;
  document.getElementById('stat-completion-rate').textContent = `${overview.completionRate}%`;
  document.getElementById('stat-study-time').textContent = overview.hasStudyData
    ? formatMinutes(overview.studyTimeMinutes)
    : '—';

  document.getElementById('streak-value').textContent = overview.studyStreakDays;
  document.getElementById('streak-label').textContent = overview.hasStudyData
    ? overview.studyStreakDays > 0
      ? 'Consecutive days studied'
      : 'Study today to start a streak.'
    : 'No study sessions yet.';
}

async function loadProductivityTrend() {
  const container = document.getElementById('productivity-trend-container');
  const trend = await api.get('/analytics/productivity');

  if (!trend.hasData) {
    container.innerHTML = emptyState('No study sessions yet.');
    return;
  }

  const maxMinutes = Math.max(...trend.trend.map((d) => d.minutes), 1);

  container.innerHTML = `<div class="trend-bars">${trend.trend
    .map((d) => {
      const heightPct = Math.max((d.minutes / maxMinutes) * 100, 3);
      const label = new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' });
      return `
        <div class="trend-bar-wrap">
          <div class="trend-bar" style="height:${heightPct}%" title="${d.minutes} min"></div>
          <span class="trend-bar-label">${label}</span>
        </div>`;
    })
    .join('')}</div>`;
}

async function loadFocusRatio() {
  const container = document.getElementById('focus-ratio-container');
  const focus = await api.get('/analytics/focus');

  if (!focus.hasData) {
    container.innerHTML = emptyState('No study sessions yet.');
    return;
  }

  const pct = focus.focusRatio;
  container.innerHTML = `
    <div class="focus-donut-wrap">
      <div class="focus-donut" style="background: conic-gradient(var(--accent) ${pct}%, var(--bg-tertiary) ${pct}% 100%);">
        <div class="focus-donut-inner">
          <strong>${pct}%</strong>
          <span>Focus</span>
        </div>
      </div>
      <div class="focus-legend">
        ${focus.completedSessions} of ${focus.totalSessions} study sessions completed<br />
        ${formatMinutes(focus.focusMinutes)} total focused time
      </div>
    </div>`;
}

async function loadQuestProgress() {
  const container = document.getElementById('quest-progress-container');
  const data = await api.get('/analytics/quest-progress');

  if (!data.hasData) {
    container.innerHTML = emptyState('No quests yet. Create your first study quest.');
    return;
  }

  const rows = [
    { label: 'To Do', count: data.progress.TODO },
    { label: 'In Progress', count: data.progress.IN_PROGRESS },
    { label: 'Completed', count: data.progress.COMPLETED },
  ];

  container.innerHTML = `<div class="progress-rows">${rows
    .map((r) => {
      const pct = data.total > 0 ? (r.count / data.total) * 100 : 0;
      return `
        <div class="progress-row">
          <span class="progress-row-label">${r.label}</span>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span class="progress-row-count">${r.count}</span>
        </div>`;
    })
    .join('')}</div>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireAuth();
  if (!user) return;

  await loadAndApplyTheme();
  renderSidebar('analytics');
  refreshIcons();

  try {
    await Promise.all([loadOverview(), loadProductivityTrend(), loadFocusRatio(), loadQuestProgress()]);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
});
