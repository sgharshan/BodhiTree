/* ===================== State ===================== */
let state = {
  tasks: [],
  logs: {},
  years: {},
  milestones: {},
  settings: { reminderHour: 21 },
  updatedAt: 0,
};
let currentTab = 'today';
let driveSyncTimer = null;
let lastSyncedAt = null;
let syncError = null;

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function currentYearKey() { return String(new Date().getFullYear()); }
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return todayKey(monday);
}

/* ===================== Persistence ===================== */
function loadLocal() {
  try {
    const cached = localStorage.getItem('bodhi_state_cache');
    if (cached) state = Object.assign(state, JSON.parse(cached));
  } catch (e) { /* ignore */ }
}

function persist({ skipDriveSync } = {}) {
  state.updatedAt = Date.now();
  try { localStorage.setItem('bodhi_state_cache', JSON.stringify(state)); } catch (e) {}
  if (!skipDriveSync && driveSync.isConnected()) scheduleDriveSync();
}

function scheduleDriveSync() {
  clearTimeout(driveSyncTimer);
  driveSyncTimer = setTimeout(async () => {
    try {
      await driveSync.saveState(state);
      lastSyncedAt = Date.now();
      syncError = null;
    } catch (e) {
      syncError = e.message;
    }
    if (currentTab === 'manage') renderManage();
  }, 2000);
}

async function connectDrive() {
  try {
    await driveSync.connect();
    const remote = await driveSync.loadState();
    if (remote && (Number(remote.updatedAt) || 0) > (state.updatedAt || 0)) {
      state = sanitizeImportedState(remote);
      persist({ skipDriveSync: true });
    } else {
      await driveSync.saveState(state);
      lastSyncedAt = Date.now();
    }
    checkYearRollover();
    render();
  } catch (e) {
    syncError = e.message === 'not_configured'
      ? 'Add your Google Client ID in js/config.js first — see README.'
      : 'Could not connect to Google Drive.';
    renderManage();
  }
}

function disconnectDrive() {
  driveSync.disconnect();
  syncError = null;
  lastSyncedAt = null;
  renderManage();
}

/* ===================== Task model ===================== */
function activeTasks() { return state.tasks.filter(t => !t.archivedAt); }

function tasksForDay(dateKey = todayKey()) {
  const d = new Date(dateKey + 'T00:00:00');
  const dayOfWeek = d.getDay();
  return activeTasks().filter(t => t.createdAt <= dateKey && (!t.days || t.days.includes(dayOfWeek)));
}

function addTask({ name, icon, type, targetPerWeek, days, notes }) {
  const task = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, icon: icon || '●', type,
    targetPerWeek: type === 'weekly' ? Math.max(1, Math.min(7, Number(targetPerWeek) || 3)) : undefined,
    days: Array.isArray(days) && days.length > 0 ? days : undefined,
    createdAt: todayKey(),
    notes: typeof notes === 'string' ? notes.slice(0, 200).trim() : undefined,
  };
  state.tasks.push(task);
  persist();
  return task;
}
function archiveTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (t) { t.archivedAt = todayKey(); persist(); }
}

/* ===================== Completion & scoring ===================== */
function isCompleted(taskId, dateKey = todayKey()) {
  return !!(state.logs[dateKey] && state.logs[dateKey][taskId]);
}
function toggleCompletion(taskId, dateKey = todayKey()) {
  if (!state.logs[dateKey]) state.logs[dateKey] = {};
  if (state.logs[dateKey][taskId]) delete state.logs[dateKey][taskId];
  else state.logs[dateKey][taskId] = true;
  persist();
}
function weeklyProgress(task, dateKey = todayKey()) {
  const week = isoWeekKey(dateKey);
  let count = 0;
  for (const [d, entries] of Object.entries(state.logs)) {
    if (isoWeekKey(d) === week && entries[task.id]) count++;
  }
  return count;
}
function isDone(t, dateKey = todayKey()) {
  return t.type === 'daily' ? isCompleted(t.id, dateKey) : weeklyProgress(t, dateKey) >= t.targetPerWeek;
}
function dayScore(dateKey = todayKey()) {
  const tasks = tasksForDay(dateKey);
  if (tasks.length === 0) return 0;
  const earned = tasks.reduce((n, t) => n + (isDone(t, dateKey) ? 1 : 0), 0);
  return earned / tasks.length;
}
function currentStreak() {
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = todayKey(d);
    if (tasksForDay(key).length > 0 && dayScore(key) >= 1) {
      streak++; d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function earliestTaskDate() {
  const dates = state.tasks.map(t => t.createdAt).sort();
  return dates[0] || todayKey();
}

function bestStreak() {
  let best = 0, run = 0;
  const start = new Date(earliestTaskDate() + 'T00:00:00');
  const end = new Date();
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = todayKey(d);
    if (activeTasks().filter(t => t.createdAt <= key).length > 0 && dayScore(key) >= 1) {
      run++; best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

function reflectionNote(streak) {
  if (streak === 0) return 'Every practice starts with a single day. Plant the first one today.';
  if (streak < 3) return "You've begun. The first few days are the hardest to start and the easiest to lose — keep going.";
  if (streak < 7) return 'A few days in a row now. The habit is still a choice, but it’s getting lighter to carry.';
  if (streak < 21) return 'A full week or more of showing up. Somewhere in here, it starts becoming part of who you are.';
  if (streak < 60) return 'Weeks of consistency. This is no longer effort — it’s rhythm.';
  return 'Months of quiet discipline. The tree barely notices missing a leaf; the roots are what hold it now.';
}

/* ===================== Year / tree ===================== */
const TREE_STAGES = ['seed', 'sprout', 'sapling', 'young', 'full'];
function yearScore(yearKey = currentYearKey()) {
  const start = new Date(Number(yearKey), 0, 1);
  const end = yearKey === currentYearKey() ? new Date() : new Date(Number(yearKey), 11, 31);
  let total = 0, days = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    total += dayScore(todayKey(d));
    days++;
  }
  return days === 0 ? 0 : total / days;
}
function treeStage(score) {
  const idx = Math.min(TREE_STAGES.length - 1, Math.floor(score * TREE_STAGES.length));
  return TREE_STAGES[idx];
}
function checkYearRollover() {
  const key = currentYearKey();
  if (!state.years[key]) state.years[key] = { sealed: false };
  let changed = false;
  Object.keys(state.years).forEach(y => {
    if (y !== key && !state.years[y].sealed) {
      const s = yearScore(y);
      state.years[y] = { sealed: true, finalStage: treeStage(s), finalScore: s };
      changed = true;
    }
  });
  if (changed) persist();
}

function treeSvg(stage) {
  const canopy = (cx, cy, r, op) => `<circle class="glow-dot" cx="${cx}" cy="${cy}" r="${r}" fill="var(--accent)" opacity="${op}"/>`;
  const trunk = (y1, y2, w) => `<line x1="110" y1="${y1}" x2="110" y2="${y2}" stroke="#7a5a34" stroke-width="${w}" stroke-linecap="round"/>`;
  const svgs = {
    seed:    `<svg viewBox="0 0 220 220">${trunk(205,196,4)}<ellipse cx="110" cy="200" rx="9" ry="6" fill="var(--accent)"/></svg>`,
    sprout:  `<svg viewBox="0 0 220 220">${trunk(205,150,5)}${canopy(110,140,16,.85)}</svg>`,
    sapling: `<svg viewBox="0 0 220 220">${trunk(205,110,7)}${canopy(110,98,30,.55)}${canopy(90,118,20,.8)}${canopy(130,118,20,.8)}</svg>`,
    young:   `<svg viewBox="0 0 220 220">${trunk(205,85,9)}${canopy(110,72,42,.45)}${canopy(72,100,26,.75)}${canopy(148,100,26,.75)}${canopy(110,110,24,.85)}</svg>`,
    full:    `<svg viewBox="0 0 220 220">${trunk(210,70,11)}${canopy(110,55,52,.35)}${canopy(60,90,32,.65)}${canopy(160,90,32,.65)}${canopy(85,105,30,.8)}${canopy(135,105,30,.8)}${canopy(110,95,34,.9)}<circle class="glow-dot" cx="110" cy="55" r="10" fill="var(--accent-glow)"/></svg>`,
  };
  return svgs[stage] || svgs.seed;
}

/* ===================== Rendering ===================== */
function render() { screens[currentTab](); }
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  render();
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

function ringSvg(pct) {
  const r = 22, c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return `<svg viewBox="0 0 56 56">
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
  </svg>`;
}

function currentStreakForTask(taskId) {
  let streak = 0;
  let d = new Date();
  while (true) {
    const key = todayKey(d);
    if (isCompleted(taskId, key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function checkMilestone(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return null;

  const streak = currentStreakForTask(taskId);
  if (![7, 30, 100].includes(streak)) return null;

  if (!state.milestones[taskId]) state.milestones[taskId] = {};
  if (state.milestones[taskId][streak]) return null;

  state.milestones[taskId][streak] = true;
  persist();

  return streak;
}

function showCelebration(task, milestone) {
  const messages = {
    7: { emoji: '🔥', text: '7-Day Streak!' },
    30: { emoji: '🌳', text: '30-Day Milestone!' },
    100: { emoji: '⭐', text: '100 Days of Practice!' },
  };

  const msg = messages[milestone] || { emoji: '✨', text: 'Milestone!' };

  const modal = document.createElement('div');
  modal.className = 'celebration-modal';
  modal.innerHTML = `
    <div class="celebration-content">
      <div class="celebration-emoji">${msg.emoji}</div>
      <div style="margin:12px 0;text-align:center;">
        <div style="font-size:.9rem;color:var(--text-faint);">${escapeHtml(task.name)}</div>
        <h2 style="margin:4px 0 0;font-size:1.4rem;color:var(--accent);">${msg.text}</h2>
      </div>
      <div class="celebration-flourish">
        <svg viewBox="0 0 100 40" style="height:30px;opacity:.6;">
          <circle cx="20" cy="20" r="3" fill="var(--accent)" opacity="0.4"/>
          <circle cx="40" cy="15" r="3" fill="var(--accent)" opacity="0.6"/>
          <circle cx="60" cy="20" r="3" fill="var(--accent)" opacity="0.5"/>
          <circle cx="80" cy="18" r="3" fill="var(--accent)" opacity="0.4"/>
        </svg>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  setTimeout(() => {
    modal.remove();
  }, 3000);

  modal.addEventListener('click', () => {
    modal.remove();
  });
}

function dayStripHtml() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  let html = '<div class="day-strip">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = todayKey(d);
    const isFuture = key > todayKey();
    const isToday = key === todayKey();
    const s = isFuture ? 0 : dayScore(key);
    const cls = isFuture ? '' : s >= 1 ? 'full' : s > 0 ? 'partial' : '';
    html += `<div class="day-pill ${cls}${isToday ? ' today' : ''}">
      <span class="dow">${d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
      <span class="dot"></span>
      <span class="num">${d.getDate()}</span>
    </div>`;
  }
  return html + '</div>';
}

function getLastCompletionDate(taskId) {
  let lastDate = null;
  // Single-pass iteration to find latest date (O(n) instead of O(n log n))
  for (const dateStr of Object.keys(state.logs)) {
    if (state.logs[dateStr][taskId] && (!lastDate || dateStr > lastDate)) {
      lastDate = dateStr;
    }
  }
  if (!lastDate) return null;

  const d = new Date(lastDate + 'T00:00:00');
  if (isNaN(d.getTime())) return null;  // Invalid date check

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (todayKey(d) === todayKey(today)) return 'today';
  if (todayKey(d) === todayKey(yesterday)) return 'yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderToday() {
  const screen = document.getElementById('screen');
  const tasks = tasksForDay();
  const score = tasks.length ? Math.round(dayScore() * 100) : 0;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  screen.innerHTML = `
    <div class="eyebrow">${dateLabel}</div>
    <div class="today-header">
      <h1>Today</h1>
      <div class="ring">${ringSvg(score)}<div class="pct">${score}%</div></div>
    </div>
    <p class="streak" style="margin-bottom:16px;">🔥 <b>${currentStreak()}</b> day streak</p>
    ${dayStripHtml()}
    <ul class="task-list" id="todayList"></ul>
    <div id="reminderBanner"></div>
  `;

  const list = document.getElementById('todayList');
  if (tasks.length === 0) {
    list.innerHTML = `<li class="empty-state">No tasks yet. Head to Manage to set your first daily or weekly practice.</li>`;
  } else {
    tasks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'task-row' + (isDone(t) ? ' done' : '');
      const meta = t.type === 'weekly' ? `${weeklyProgress(t)}/${escapeHtml(String(t.targetPerWeek))} this week` : 'daily';
      const noteIndicator = t.notes ? ' 💭' : '';
      li.innerHTML = `
        <span class="task-icon">${escapeHtml(t.icon)}</span>
        <span class="task-name">${escapeHtml(t.name)}${noteIndicator}</span>
        <span class="task-meta">${meta}</span>
        <span class="task-check">${isDone(t) ? '✓' : ''}</span>
      `;

      // Click to toggle completion (notes don't interfere)
      li.addEventListener('click', (e) => {
        if (!e.target.closest('.task-note-detail')) {
          toggleCompletion(t.id);
          const milestone = checkMilestone(t.id);
          if (milestone) {
            showCelebration(t, milestone);
          }
          li.classList.add('pulse');
          renderToday();
        }
      });

      // Add note detail if task has notes (always visible, no expand/collapse)
      if (t.notes) {
        const noteDetail = document.createElement('div');
        noteDetail.className = 'task-note-detail';
        noteDetail.innerHTML = `
          <div class="note-text">${escapeHtml(t.notes)}</div>
          <div class="note-meta">Last done: ${getLastCompletionDate(t.id) || 'never'}</div>
        `;
        li.appendChild(noteDetail);
      }

      list.appendChild(li);
    });
  }
  renderReminderBanner(tasks);
}

function renderReminderBanner(tasks) {
  const el = document.getElementById('reminderBanner');
  if (!el) return;
  const hour = new Date().getHours();
  const incomplete = tasks.filter(t => !isDone(t));
  if (hour >= state.settings.reminderHour && incomplete.length > 0) {
    el.innerHTML = `<div class="banner">
      <svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/></svg>
      <span>A few things left before bed: ${incomplete.map(t => escapeHtml(t.icon + ' ' + t.name)).join(', ')}</span>
    </div>`;
  } else {
    el.innerHTML = '';
  }
}

function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const score = dayScore(dateStr);
    const tasks = tasksForDay(dateStr);
    days.push({
      date: d,
      dateStr: dateStr,
      score: score,
      taskCount: tasks.filter(t => isCompleted(t.id, dateStr)).length,
      totalTasks: tasks.length,
      isFuture: dateStr > todayKey(),
      isToday: dateStr === todayKey(),
    });
  }

  return days;
}

function heatmapColor(score) {
  if (score === 0) return 'var(--bg-card)';
  if (score < 0.33) return 'var(--accent-soft)';
  if (score < 0.67) return 'rgba(211,162,79,0.5)';
  return 'var(--accent)';
}

function renderInsights() {
  const screen = document.getElementById('screen');
  screen.innerHTML = `
    <h1>Insights</h1>
    <p style="margin-bottom:20px;">Monthly view of your practice.</p>
    <div id="monthView"></div>
  `;
  renderMonthView();
}

function renderMonthView() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const container = document.getElementById('monthView');
  const days = getMonthData(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  let html = `
    <div style="margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 style="margin:0;font-size:1.2rem;">${monthName}</h2>
        <button id="todayBtn" class="btn-ghost" style="padding:6px 12px;font-size:.8rem;">Today</button>
      </div>

      <table class="month-calendar" style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th>
          </tr>
        </thead>
        <tbody>
  `;

  let row = '<tr>';
  days.forEach((day, idx) => {
    if (day === null) {
      row += '<td></td>';
    } else {
      const bgColor = day.isFuture ? 'transparent' : heatmapColor(day.score);
      const borderClass = day.isToday ? 'today-border' : '';
      const opacityClass = day.isFuture ? 'future-day' : '';
      row += `
        <td class="${borderClass} ${opacityClass}"
            style="background:${bgColor};cursor:pointer;padding:12px 4px;text-align:center;border:1px solid var(--border);min-height:60px;position:relative;"
            data-date="${day.dateStr}" onclick="showDayDetail('${day.dateStr}')">
          <div style="font-weight:600;margin-bottom:4px;">${day.date}</div>
          <div style="font-size:.7rem;color:var(--text-faint);">${day.totalTasks > 0 ? day.taskCount + '/' + day.totalTasks : '—'}</div>
        </td>
      `;
    }

    if ((idx + 1) % 7 === 0) {
      row += '</tr>';
      html += row;
      row = '<tr>';
    }
  });

  if (days.length % 7 !== 0) {
    const remaining = 7 - (days.length % 7);
    for (let i = 0; i < remaining; i++) {
      row += '<td></td>';
    }
    html += row + '</tr>';
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;

  document.getElementById('todayBtn').addEventListener('click', () => {
    switchTab('today');
  });
}

function showDayDetail(dateStr) {
  const tasks = tasksForDay(dateStr);
  const completedCount = tasks.filter(t => isCompleted(t.id, dateStr)).length;
  const score = dayScore(dateStr);
  const dateObj = new Date(dateStr + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const modal = document.createElement('div');
  modal.className = 'day-detail-modal';
  modal.innerHTML = `
    <div class="day-detail-content">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px;">
        <div>
          <div style="color:var(--text-faint);font-size:.85rem;">${dateLabel}</div>
          <h3 style="margin:4px 0 0;">${Math.round(score * 100)}% complete</h3>
        </div>
        <button class="btn-text" onclick="this.closest('.day-detail-modal').remove()" style="padding:4px 8px;">Close</button>
      </div>

      <ul class="task-list" style="margin:0;padding:0;list-style:none;">
        ${tasks.length === 0
          ? '<li class="empty-state">No tasks scheduled for this day.</li>'
          : tasks.map(t => `
            <li style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-card);border-radius:8px;margin-bottom:6px;font-size:.9rem;">
              <span>${escapeHtml(t.icon)}</span>
              <span style="flex:1;">${escapeHtml(t.name)}</span>
              <span style="color:var(--accent);">${isCompleted(t.id, dateStr) ? '✓' : '—'}</span>
            </li>
          `).join('')
        }
      </ul>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function renderTree() {
  const screen = document.getElementById('screen');
  const score = yearScore();
  const stage = treeStage(score);
  const daysComplete = Object.keys(state.logs).filter(d => d.startsWith(currentYearKey()) && dayScore(d) >= 1).length;
  const streak = currentStreak();

  screen.innerHTML = `
    <div class="tree-wrap">
      <div class="tree-year">${currentYearKey()} · ${Math.round(score * 100)}% grown</div>
      <div class="tree-stage-name">${stage}</div>
      <div class="tree-canvas">${treeSvg(stage)}</div>
      <div class="stat-row">
        <div class="stat-tile"><div class="num">${streak}</div><div class="label">Streak</div></div>
        <div class="stat-tile"><div class="num">${daysComplete}</div><div class="label">Growth days</div></div>
        <div class="stat-tile"><div class="num">${bestStreak()}</div><div class="label">Best streak</div></div>
      </div>
      <p style="margin-top:18px;font-size:.85rem;font-style:italic;">${reflectionNote(streak)}</p>
    </div>
  `;
}

function renderGrove() {
  const screen = document.getElementById('screen');
  const sealed = Object.entries(state.years).filter(([, y]) => y.sealed).sort((a, b) => b[0] - a[0]);
  screen.innerHTML = `<h1>Grove</h1><p style="margin-top:6px;">Every completed year is kept here, exactly as it grew.</p>`;
  const wrap = document.createElement('div');
  if (sealed.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="margin-top:18px;">Your first sealed tree will appear here once this year ends.</div>`;
  } else {
    wrap.className = 'grove-grid';
    sealed.forEach(([y, data]) => {
      const card = document.createElement('div');
      card.className = 'grove-tree';
      const pct = Math.round((Number(data.finalScore) || 0) * 100);
      card.innerHTML = `${treeSvg(data.finalStage)}<div class="yr">${escapeHtml(y)}</div><div class="pct">${pct}%</div>`;
      wrap.appendChild(card);
    });
  }
  screen.appendChild(wrap);
}

function renderManage() {
  const screen = document.getElementById('screen');
  const connected = driveSync.isConnected();
  screen.innerHTML = `
    <h1>Manage</h1>
    <p style="margin-bottom:20px;">Shape the practice — add what matters, retire what doesn't.</p>

    <div class="section">
      <div class="eyebrow">New task</div>
      <form id="taskForm" class="task-form">
        <div class="form-group">
          <div class="field row-2">
            <div>
              <label for="taskIcon">Icon</label>
              <input id="taskIcon" value="●" maxlength="2" />
            </div>
            <div>
              <label for="taskName">Name</label>
              <input id="taskName" placeholder="e.g. Gym" required />
            </div>
          </div>
        </div>

        <div class="form-group">
          <div class="field">
            <label for="taskNotes">Context (optional)</label>
            <input id="taskNotes" placeholder="e.g. with Sarah, morning routine" maxlength="200" />
          </div>
        </div>

        <div class="form-group">
          <div class="field row-2">
            <div>
              <label for="taskType">Frequency</label>
              <select id="taskType">
                <option value="daily">Every day</option>
                <option value="weekly">X per week</option>
              </select>
            </div>
            <div id="targetWrap" style="display:none;">
              <label for="taskTarget">Times per week</label>
              <input id="taskTarget" type="number" min="1" max="7" value="3" />
            </div>
          </div>
        </div>

        <div class="form-group">
          <label style="display:block;margin-bottom:12px;font-size:.75rem;color:var(--text-faint);font-weight:600;letter-spacing:.02em;">Schedule on specific days (optional)</label>
          <div id="dayPicker" class="day-picker">
            <label class="day-option"><input type="checkbox" value="1" /><span>Mon</span></label>
            <label class="day-option"><input type="checkbox" value="2" /><span>Tue</span></label>
            <label class="day-option"><input type="checkbox" value="3" /><span>Wed</span></label>
            <label class="day-option"><input type="checkbox" value="4" /><span>Thu</span></label>
            <label class="day-option"><input type="checkbox" value="5" /><span>Fri</span></label>
            <label class="day-option"><input type="checkbox" value="6" /><span>Sat</span></label>
            <label class="day-option"><input type="checkbox" value="0" /><span>Sun</span></label>
          </div>
        </div>

        <button type="submit" class="btn-primary" style="margin-top:20px;">Add task</button>
      </form>
      <ul class="manage-list" id="taskList"></ul>
    </div>

    <div class="section">
      <div class="eyebrow">Reminder</div>
      <div class="field">
        <label for="reminderHour">Nudge me after this hour if tasks remain</label>
        <input id="reminderHour" type="number" min="0" max="23" value="${escapeHtml(String(state.settings.reminderHour))}" />
      </div>
    </div>

    <div class="section">
      <div class="eyebrow">Google Drive sync</div>
      <div class="sync-status">
        <span class="sync-dot ${connected ? 'on' : ''}"></span>
        <span class="line">
          ${connected ? 'Connected — auto-backs up on every change' : (driveSync.isConfigured() ? 'Not connected' : 'Not set up yet')}
          ${syncError ? `<br><span style="color:var(--danger)">${escapeHtml(syncError)}</span>` : ''}
        </span>
        <span class="time">${lastSyncedAt ? 'Synced ' + new Date(lastSyncedAt).toLocaleTimeString() : ''}</span>
      </div>
      ${connected
        ? `<button id="disconnectDrive" class="btn-ghost" style="width:100%;">Disconnect</button>`
        : `<button id="connectDrive" class="btn-primary">Connect Google Drive</button>`}
    </div>

    <div class="section">
      <div class="eyebrow">Manual backup</div>
      <p style="margin-bottom:10px;">Works with or without Drive connected — a plain JSON file you keep anywhere.</p>
      <div class="backup-row">
        <button id="exportBtn" class="btn-ghost">Export backup</button>
        <button id="importBtn" class="btn-ghost">Import backup</button>
      </div>
      <input id="importFile" type="file" accept="application/json" style="display:none" />
    </div>
  `;

  const typeSel = document.getElementById('taskType');
  const targetWrap = document.getElementById('targetWrap');
  typeSel.addEventListener('change', () => {
    targetWrap.style.display = typeSel.value === 'weekly' ? '' : 'none';
  });

  document.getElementById('taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const dayCheckboxes = document.querySelectorAll('#dayPicker input[type="checkbox"]:checked');
    const days = dayCheckboxes.length > 0 ? Array.from(dayCheckboxes).map(cb => Number(cb.value)) : undefined;
    addTask({
      name: document.getElementById('taskName').value.trim(),
      icon: document.getElementById('taskIcon').value.trim(),
      type: typeSel.value,
      targetPerWeek: document.getElementById('taskTarget').value,
      days,
      notes: document.getElementById('taskNotes').value.trim(),
    });
    document.getElementById('taskForm').reset();
    renderManage();
  });

  document.getElementById('reminderHour').addEventListener('change', e => {
    state.settings.reminderHour = Math.max(0, Math.min(23, Number(e.target.value) || 21));
    persist();
  });

  const list = document.getElementById('taskList');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  activeTasks().forEach(t => {
    const li = document.createElement('li');
    li.className = 'manage-row';
    const freq = t.type === 'weekly' ? `${escapeHtml(String(t.targetPerWeek))}x / week` : 'daily';
    const days = t.days ? t.days.map(d => dayNames[d]).join(', ') : '';
    const freqLabel = days ? `${freq} · ${days}` : freq;
    const noteIndicator = t.notes ? ' 💭' : '';
    li.innerHTML = `<span class="task-icon">${escapeHtml(t.icon)}</span><span class="name">${escapeHtml(t.name)}${noteIndicator}</span><span class="freq">${freqLabel}</span>`;
    const del = document.createElement('button');
    del.className = 'btn-text';
    del.textContent = 'Retire';
    del.addEventListener('click', () => { archiveTask(t.id); renderManage(); });
    li.appendChild(del);
    list.appendChild(li);
  });
  if (activeTasks().length === 0) {
    list.innerHTML = `<li class="empty-state">No tasks yet — add your first one above.</li>`;
  }

  const connectBtn = document.getElementById('connectDrive');
  if (connectBtn) connectBtn.addEventListener('click', () => { syncError = null; connectDrive(); });
  const disconnectBtn = document.getElementById('disconnectDrive');
  if (disconnectBtn) disconnectBtn.addEventListener('click', disconnectDrive);

  document.getElementById('exportBtn').addEventListener('click', exportBackup);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });
}

/* ===================== Backup ===================== */
function exportBackup() {
  const payload = JSON.stringify(state, null, 2);
  const filename = `bodhi-backup-${todayKey()}.json`;
  const blob = new Blob([payload], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function sanitizeImportedState(parsed) {
  const clean = { tasks: [], logs: {}, years: {}, milestones: {}, settings: { reminderHour: 21 }, updatedAt: 0 };

  if (Array.isArray(parsed.tasks)) {
    clean.tasks = parsed.tasks
      .filter(t => t && typeof t.id === 'string' && typeof t.name === 'string' && (t.type === 'daily' || t.type === 'weekly'))
      .map(t => ({
        id: t.id,
        name: String(t.name).slice(0, 80),
        icon: typeof t.icon === 'string' ? t.icon.slice(0, 4) : '●',
        type: t.type,
        targetPerWeek: t.type === 'weekly' ? Math.max(1, Math.min(7, Number(t.targetPerWeek) || 3)) : undefined,
        days: Array.isArray(t.days) ? t.days.filter(d => d >= 0 && d <= 6) : undefined,
        createdAt: typeof t.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.createdAt) ? t.createdAt : todayKey(),
        archivedAt: typeof t.archivedAt === 'string' ? t.archivedAt : undefined,
        notes: typeof t.notes === 'string' ? t.notes.slice(0, 200).trim() : undefined,
      }));
  }

  if (parsed.logs && typeof parsed.logs === 'object') {
    Object.entries(parsed.logs).forEach(([date, entries]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !entries || typeof entries !== 'object') return;
      clean.logs[date] = {};
      Object.keys(entries).forEach(taskId => {
        if (entries[taskId]) clean.logs[date][taskId] = true;
      });
    });
  }

  if (parsed.years && typeof parsed.years === 'object') {
    Object.entries(parsed.years).forEach(([year, data]) => {
      if (!/^\d{4}$/.test(year) || !data || typeof data !== 'object') return;
      clean.years[year] = {
        sealed: !!data.sealed,
        finalStage: TREE_STAGES.includes(data.finalStage) ? data.finalStage : 'seed',
        finalScore: Math.max(0, Math.min(1, Number(data.finalScore) || 0)),
      };
    });
  }

  if (parsed.milestones && typeof parsed.milestones === 'object') {
    Object.entries(parsed.milestones).forEach(([taskId, achievements]) => {
      if (typeof achievements === 'object') {
        clean.milestones[taskId] = Object.fromEntries(
          Object.entries(achievements).filter(([k, v]) => [7, 30, 100].includes(Number(k)) && v === true)
        );
      }
    });
  }

  if (parsed.settings && typeof parsed.settings === 'object') {
    clean.settings.reminderHour = Math.max(0, Math.min(23, Number(parsed.settings.reminderHour) || 21));
  }

  clean.updatedAt = Number(parsed.updatedAt) || 0;
  return clean;
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = sanitizeImportedState(parsed);
      checkYearRollover();
      persist();
      renderManage();
    } catch (e) { /* ignore malformed file */ }
  };
  reader.readAsText(file);
}

/* ===================== Utils ===================== */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===================== Boot ===================== */
const screens = { today: renderToday, tree: renderTree, insights: renderInsights, grove: renderGrove, manage: renderManage };
driveSync.onStatusChange = () => { if (currentTab === 'manage') renderManage(); };
loadLocal();
checkYearRollover();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
