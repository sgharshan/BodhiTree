# Bodhi Enhanced Features Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute this plan task-by-task.

**Goal:** Add Task Notes, Month View (Insights tab), and Milestone Celebrations to Bodhi habit tracker.

**Architecture:** 
- Extend task data model with optional `notes` field
- Add `milestones` object to track 7/30/100-day streak achievements per task
- Add new "Insights" tab to tab bar with calendar heatmap
- Integrate milestone detection into task completion flow
- All features reuse existing Bodhi functions (dayScore, currentStreak) for consistency

**Tech Stack:** Plain JavaScript (no framework), HTML5, CSS3, localStorage, Google Drive API

---

## File Structure

**Files to modify:**
- `js/app.js` — Core logic (data model, task functions, rendering)
- `css/styles.css` — Styling for notes field, month view, celebration modal
- `index.html` — Add Insights tab button to tab bar

**No new files needed** — all features integrate into existing app structure.

---

## Tasks

### Task 1: Update State & Task Data Model

**Files:**
- Modify: `js/app.js:1-10` (state initialization)
- Modify: `js/app.js:91-102` (addTask function)
- Modify: `js/app.js:486-500` (sanitizeImportedState function)

**Overview:** Add `notes` field to task schema and `milestones` object to state. Ensure backward compatibility with existing data.

- [ ] **Step 1: Update state initialization to include milestones object**

Open `js/app.js` and find the state initialization (lines 1-8):

```javascript
let state = {
  tasks: [],
  logs: {},
  years: {},
  settings: { reminderHour: 21 },
  updatedAt: 0,
  milestones: {},  // NEW: track milestone achievements per task
};
```

Replace the entire state object (lines 1-8).

- [ ] **Step 2: Run the app and verify state loads without errors**

Open `index.html` in browser. Open DevTools console. Verify no errors appear. Type `state.milestones` in console — should return `{}`.

- [ ] **Step 3: Update addTask function to include notes parameter**

Find `addTask` function (around line 91). Replace the entire function:

```javascript
function addTask({ name, icon, type, targetPerWeek, days, notes }) {
  const task = {
    id: 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name, icon: icon || '●', type,
    targetPerWeek: type === 'weekly' ? Math.max(1, Math.min(7, Number(targetPerWeek) || 3)) : undefined,
    days: Array.isArray(days) && days.length > 0 ? days : undefined,
    notes: typeof notes === 'string' ? notes.slice(0, 200).trim() : undefined,
    createdAt: todayKey(),
  };
  state.tasks.push(task);
  persist();
  return task;
}
```

- [ ] **Step 4: Update sanitizeImportedState to preserve notes and milestones**

Find `sanitizeImportedState` function (around line 486). Update the task mapping section:

```javascript
function sanitizeImportedState(parsed) {
  const clean = { tasks: [], logs: {}, years: {}, settings: { reminderHour: 21 }, updatedAt: 0, milestones: {} };

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
        notes: typeof t.notes === 'string' ? t.notes.slice(0, 200).trim() : undefined,
        createdAt: typeof t.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.createdAt) ? t.createdAt : todayKey(),
        archivedAt: typeof t.archivedAt === 'string' ? t.archivedAt : undefined,
      }));
  }

  if (parsed.logs && typeof parsed.logs === 'object') {
    Object.entries(parsed.logs).forEach(([date, entries]) => {
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof entries === 'object') {
        clean.logs[date] = entries;
      }
    });
  }

  if (parsed.years && typeof parsed.years === 'object') {
    Object.entries(parsed.years).forEach(([year, data]) => {
      if (/^\d{4}$/.test(year)) clean.years[year] = data;
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

  if (parsed.settings && typeof parsed.settings === 'object' && Number.isInteger(parsed.settings.reminderHour)) {
    clean.settings.reminderHour = Math.max(0, Math.min(23, parsed.settings.reminderHour));
  }

  if (Number.isInteger(parsed.updatedAt)) clean.updatedAt = parsed.updatedAt;

  return clean;
}
```

- [ ] **Step 5: Test data model with browser console**

Reload app. In console, run:
```javascript
addTask({ name: 'Test Task', icon: '✓', type: 'daily', notes: 'This is a test note' })
console.log(state.tasks[0].notes)
```

Expected output: `"This is a test note"`

- [ ] **Step 6: Test that notes are truncated to 200 chars**

In console:
```javascript
addTask({ name: 'Long Note', type: 'daily', notes: 'x'.repeat(300) })
console.log(state.tasks[state.tasks.length - 1].notes.length)
```

Expected output: `200`

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: add notes field to tasks and milestones object to state

- Add optional notes field to task schema (max 200 chars)
- Add milestones object to state to track 7/30/100-day achievements
- Update addTask() to accept and sanitize notes parameter
- Update sanitizeImportedState() to preserve notes and milestones on import
- Maintain backward compatibility with existing data

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Add Notes UI in Manage Tab

**Files:**
- Modify: `js/app.js:351-472` (renderManage function)

See implementation details in full plan documentation.

---

### Task 3: Display Notes on Today Tab

**Files:**
- Modify: `js/app.js:258-299` (renderToday function)
- Modify: `css/styles.css` (add styles for note display)

See implementation details in full plan documentation.

---

### Task 4: Add Insights Tab Infrastructure

**Files:**
- Modify: `index.html` (add Insights tab button)
- Modify: `js/app.js` (add renderInsights function, register tab)

See implementation details in full plan documentation.

---

### Task 5: Implement Month View Calendar

**Files:**
- Modify: `js/app.js` (renderMonthView function)
- Modify: `css/styles.css` (calendar styling)

See implementation details in full plan documentation.

---

### Task 6: Implement Milestone Detection & Celebrations

**Files:**
- Modify: `js/app.js` (toggleCompletion, milestone detection, celebration modal)
- Modify: `css/styles.css` (celebration modal styling)

See implementation details in full plan documentation.

---

### Task 7: Polish & Testing

**Files:**
- Modify: `js/app.js` (ensure sanitization on imports)
- Test: Manual testing across all features

See implementation details in full plan documentation.
