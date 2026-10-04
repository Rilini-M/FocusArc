function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function emptyState(message) {
  return `<div class="empty"><p>${message}</p></div>`;
}

async function loadOverview() {
  const overview = await api.get('/analytics/overview');

  document.getElementById('stat-total-quests').textContent = overview.totalQuests;
  document.getElementById('stat-completed-quests').textContent = overview.completedQuests;
  document.getElementById('stat-study-time').textContent = overview.hasStudyData
    ? formatMinutes(overview.studyTimeMinutes)
    : '—';
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

  container.innerHTML = `<div class="pr-rows">${rows
    .map((r) => {
      const pct = data.total > 0 ? (r.count / data.total) * 100 : 0;
      return `
        <div class="pr-row">
          <span class="pr-label">${r.label}</span>
          <div class="pr-track"><div class="pr-fill" style="width:${pct}%"></div></div>
          <span class="pr-count">${r.count}</span>
        </div>`;
    })
    .join('')}</div>`;
}


const DISTRIBUTION_SEGMENTS = [
  { key: 'TODO', label: 'To Do', color: 'var(--chart-todo)' },
  { key: 'IN_PROGRESS', label: 'In Progress', color: 'var(--chart-progress)' },
  { key: 'COMPLETED', label: 'Completed', color: 'var(--chart-done)' },
];


function wholePercents(counts) {
  const total = counts.reduce((sum, c) => sum + c, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const result = exact.map(Math.floor);
  let remaining = 100 - result.reduce((sum, p) => sum + p, 0);
  exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)
    .forEach(({ i }) => {
      if (remaining > 0) {
        result[i] += 1;
        remaining -= 1;
      }
    });
  return result;
}


async function loadQuestDistribution() {
  const container = document.getElementById('quest-distribution-container');
  const quests = await api.get('/quests');

  if (!quests.length) {
    container.innerHTML = emptyState('No quests yet. Create your first study quest.');
    return;
  }

  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const segments = DISTRIBUTION_SEGMENTS.map((s) => ({
    ...s,
    quests: quests.filter((q) => q.status === s.key),
  }));
  const percents = wholePercents(segments.map((s) => s.quests.length));
  segments.forEach((s, i) => {
    s.percent = percents[i];
  });
  
  const gap = segments.filter((s) => s.quests.length > 0).length > 1 ? 3 : 0;

  let offset = 0;
  const arcs = segments
    .map((s) => {
      if (!s.quests.length) return '';
      const length = (s.quests.length / quests.length) * circumference;
      const arc = `
        <circle class="d-arc" cx="80" cy="80" r="${radius}"
          style="stroke: ${s.color}" stroke-dasharray="${Math.max(length - gap, 0.5)} ${circumference}"
          stroke-dashoffset="${-offset}" />`;
      offset += length;
      return arc;
    })
    .join('');

  const summary = segments.map((s) => `${s.label} ${s.percent}%`).join(', ');

  container.innerHTML = `
    <div class="d-layout">
      <div class="d-chart">
        <svg viewBox="0 0 160 160" role="img" aria-label="Quest distribution — ${summary}">
          <circle class="d-track" cx="80" cy="80" r="${radius}" />
          <g transform="rotate(-90 80 80)">${arcs}</g>
        </svg>
      </div>
      <div class="d-groups">
        ${segments
          .map(
            (s) => `
          <div class="d-group">
            <div class="dg-head">
              <span class="d-dot" style="--dot: ${s.color}"></span>
              <span class="dg-label">${s.label}</span>
              <span class="dg-pct">${s.percent}%</span>
            </div>
            ${
              s.quests.length
                ? `<ul class="d-quests">${s.quests
                    .map((q) => `<li>${escapeHtml(q.title)}</li>`)
                    .join('')}</ul>`
                : '<p class="d-none">No quests</p>'
            }
          </div>`
          )
          .join('')}
      </div>
    </div>`;
}

async function loadHeroCompanion(settings) {
  try {
    const character = await api.get(`/characters/${settings.character_id}`);
    const heroImage = document.getElementById('analytics-hero-image');
    heroImage.src = character.image_path;
    heroImage.alt = character.name;
    heroImage.hidden = false;
  } catch (err) {
  
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Rendered first and synchronously — see questboard.js for why this can't wait behind
  // the auth/settings network calls without causing a visible theme/chrome flash.
  renderSidebar('analytics');

  const user = await requireAuth();
  if (!user) return;

  const settings = await loadAndApplyTheme();
  if (settings) loadHeroCompanion(settings);

  try {
    await Promise.all([loadOverview(), loadQuestProgress(), loadQuestDistribution()]);
  } catch (err) {
    showToast(err.message, { isError: true });
  }
});
