# Bodhi Enhanced Features Design
**Date:** 2026-09-11  
**Scope:** Task Notes, Month View (Insights tab), Milestone Celebrations  
**Philosophy:** Add visual depth and context without cluttering the minimal, calm aesthetic

---

## Overview

This design adds three complementary features to Bodhi that deepen the daily experience and provide reflective insight into habit patterns:

1. **Task Notes** — Optional context/reminders per task (e.g., "gym with Sarah")
2. **Month View (Insights Tab)** — Calendar heatmap showing daily completion scores for a month
3. **Milestone Celebrations** — Gentle visual celebration when hitting 7, 30, 100-day streaks per task

All features maintain Bodhi's philosophy: calm, contemplative, unhurried. No notifications, no aggressive gamification, no complexity beyond what serves genuine reflection.

---

## Data Model

### Task Schema Update

Tasks gain one new optional field:

```javascript
{
  id: string,
  name: string,
  icon: string,
  type: 'daily' | 'weekly',
  targetPerWeek?: number,
  days?: number[],      // [0-6] for day-of-week assignment
  notes?: string,       // NEW: optional context (max 200 chars)
  createdAt: string,    // YYYY-MM-DD
  archivedAt?: string,  // YYYY-MM-DD (optional)
}
```

**Notes constraints:**
- Optional (empty string or undefined is fine)
- Maximum 200 characters
- Plain text only (no markdown, no HTML)
- Editable in Manage tab
- Displayed on Today tab when task is clicked

### State Schema Update

State gains a new object to track milestone achievements:

```javascript
state = {
  tasks: [],
  logs: {},
  years: {},
  settings: { reminderHour: 21 },
  updatedAt: 0,
  milestones: {
    // Track per-task milestone achievements
    // [taskId]: { 7: true, 30: true, 100: true }
    // Only true for milestones that have been celebrated
  }
}
```

**Milestones:**
- Tracked per task (each task's streaks are independent)
- Record only the first time a threshold is hit (prevent duplicate celebrations)
- Calculated from existing streak logic (no new data collection needed)
- Persists through Google Drive sync and manual backups

---

## Feature 1: Task Notes

### Purpose
Allow users to attach personal context/reminders to each task — "do with Sarah", "morning routine", "after meditation".

### Data & Storage
- `notes` field on task object (max 200 chars)
- Stored locally and synced to Google Drive with task data
- Imported/exported with backup (sanitized: max 200 chars, plain text only)

### UI & UX

#### Manage Tab
- When viewing task list, each task shows:
  - Icon | Name | Frequency info
  - Below name: optional text input field (placeholder: "Add context...")
  - Field is only visible when task is expanded or focused
  - Changes save immediately (on blur or enter)

#### Today Tab
- If a task has a note, display a subtle 💭 icon next to task name (hint to click)
- Click task row → task expands inline showing:
  - Task icon, name, note text (small, muted color)
  - Last completion date
  - Frequency info (e.g., "3/3 this week")
  - Checkmark button to complete
- Click again to collapse

#### Visual Details
- Note text uses `--text-faint` color (muted, readable but quiet)
- Font size: 0.85rem
- Line-height: 1.4 (readable but compact)
- Input field in Manage: same styling as other form inputs (matches existing design)

### Behavior
- Notes are optional (don't require setup)
- No "add note" prompt — field appears naturally in Manage
- Inline editing in Manage (no modal)
- Click-to-expand on Today (no modal needed)

### Not Included
- Rich text (markdown, formatting, emojis in note text)
- Timestamps on notes (when was this last edited?)
- Note history or versions
- Sharing or viewing others' notes

---

## Feature 2: Month View (Insights Tab)

### Purpose
Provide a visual, at-a-glance view of monthly habit completion patterns. See which days were strong/weak, identify trends.

### Data & Storage
- **No new data stored.** Calculated on-demand from existing `logs` and `dayScore()` function
- Month/year is derived from current date
- Can view past months (no future months)

### Navigation Changes

**New tab:** Insert "Insights" tab into tab bar at position 3:
```
Today | Tree | Insights | Grove | Manage
```

**Tab icon:** 📊 (or 📈, whichever feels better)

### UI & Layout

#### Calendar Grid
- Standard month view (Mon-Sun, weeks as rows)
- Current date highlighted with bold border
- Header shows: "September 2026" (or current month/year)
- Navigation: "< Previous" | "Today" | "Next >" buttons

#### Each Day Cell
- **Background color (heatmap):**
  - 0% completion: `--bg-card` (muted)
  - 25% completion: lighter accent
  - 50% completion: `--accent-soft`
  - 75% completion: medium accent
  - 100% completion: `--accent` (bright)
- **Text in cell:**
  - Date number (top-left, small)
  - Daily score as "X/Y" (bottom-right, e.g., "3/3", "1/3")
- **Future dates:** Grayed out (no background, light text)
- **Hover state:** Slight border or shadow (indicates clickable)

#### Click Day → Day Detail Modal
- Shows list of tasks for that day
- For each task: icon, name, completion status (✓ or —)
- Shows date and overall day score percentage
- Close button or click outside to dismiss

#### Viewport Fit
- Calendar fits within 430px phone width (tight but readable)
- No horizontal scroll
- Date numbers and scores are small but legible (0.7-0.8rem)

### Behavior
- Load current month on tab open
- Prev/Next navigate one month at a time
- "Today" button jumps to current month if browsing history
- Click any day cell to see task details
- No data editing from Insights tab (view-only)

### Color Scheme
- Uses existing palette (no new colors)
- Heatmap gradient subtle (matches calm aesthetic, not aggressive like "flamingo charts")
- Accessibility: text/background contrast meets WCAG AA

### Performance
- `dayScore()` already exists; reuse it for heatmap
- Calculate month heatmap on tab load (not on every render)
- Memoize if performance is an issue (likely not — only 30-31 cells)

### Not Included
- Week-by-week view
- Year-long heatmap (too dense)
- Exporting calendar as image
- Annotations or notes on specific days
- Comparison to last month/year

---

## Feature 3: Milestone Celebrations

### Purpose
Mark meaningful moments — first 7 days, 30-day milestone, 100-day achievement. Gentle recognition without gamification.

### Milestones Defined
- **7-day streak** on a single task (daily or weekly)
- **30-day streak** on a single task
- **100-day streak** on a single task
- Per-task (gym's 30-day is separate from meditation's 30-day)

### How It Triggers

When a task is marked complete:
1. Calculate that task's current streak (already have `currentStreak()`)
2. Check if streak just crossed 7, 30, or 100 days
3. Check if this milestone has already been celebrated (via `state.milestones[taskId]`)
4. If new milestone: show celebration modal, record in `state.milestones`

### UI & UX

#### Celebration Modal
- **Trigger:** Immediately after marking task complete (if milestone hit)
- **Display:** Center-screen modal (not dismissing entire Today view)
- **Content:**
  - Task icon (large, 3rem)
  - Task name
  - Milestone message: "🎉 7-Day Streak!" or "🌳 30-Day Milestone!" or "⭐ 100 Days of Practice!"
  - Small visual flourish: subtle leaf/branch illustration (SVG, fits Bodhi aesthetic)
  - Appears for 3 seconds, then auto-closes
  - Tap anywhere to dismiss earlier
- **Animation:** Gentle fade-in, slide-up entry (matches existing fadeIn animation)
- **No sound,** no vibration, no push notification

#### Visual Style
- Modal background: semi-transparent overlay (dark, matches existing UI)
- Modal box: rounded corners, `--bg-elevated` background, subtle border
- Text: heading in `--accent` or `--accent-glow`, body in `--text`
- Flourish: uses accent colors, animated gently (e.g., leaf floats or glows)

### Data & Storage

**New structure:**
```javascript
state.milestones = {
  taskId_1: { 7: true, 30: true, 100: false },
  taskId_2: { 7: false, 30: false, 100: false },
}
```

- Only `true` values are stored (omit false entries to keep JSON lean)
- Persists through Google Drive sync and backups
- Sanitized on import (valid taskId + valid threshold numbers 7, 30, 100)

### Behavior
- Celebrations only happen in the moment (when marking task complete)
- No "view past celebrations" feature
- Milestones reset if task is archived and recreated (fresh task, fresh milestones)
- If a task has been inactive and user comes back to it, streaks recalculate from existing logs (celebrations don't retroactively trigger)

### Not Included
- Global leaderboard ("you and others hitting 30-day streaks today")
- Achievement badges or trophy collection
- Notifications at reminder hour
- Milestone countdown ("5 days until 30-day!")
- Re-celebration of same milestone on subsequent years

---

## Navigation & Tab Bar

### Current State
```
Today | Tree | Grove | Manage
```

### Updated State
```
Today | Tree | Insights | Grove | Manage
```

**Icon for Insights:** 📊 (stats chart)

### Rationale
- Insights (monthly data) complements Tree (yearly progress)
- Grove remains as "past years" archive
- Manage stays at end for settings
- Flow: daily → yearly visual → monthly analysis → history → settings

---

## Implementation Priorities

### Phase 1 (MVP — this release)
1. Add `notes` field to task model
2. Notes UI in Manage (edit) and Today (inline expand)
3. Add `milestones` tracking to state
4. Celebration modal on streak thresholds
5. Month View calendar in new Insights tab

### Phase 2 (if time/interest)
- Week view in Insights
- Habit strength indicator (% completion over last 30 days)
- Export calendar as image
- Theme variations for Insights tab

---

## Testing & QA

### Unit Tests (if applicable)
- Milestone detection logic (correct thresholds, no duplicates)
- Month view calculations (heatmap colors, day detail data)
- Notes sanitization (max length, no XSS)

### Manual Testing
- Create task with note, verify persistence & display on Today
- Click Month View, navigate months, click days
- Hit 7, 30, 100-day streaks, verify celebration appears once per milestone
- Export/import backup with notes and milestones
- Test on mobile (430px viewport)
- Test on past years (no milestones retroactively trigger)

### Edge Cases
- Task with very long note (200+ chars) — truncate/warn
- Clicking same task 100 times in a day — only one streak, one celebration
- Switching between past/current months quickly — no lag
- Import backup from old version without `notes` or `milestones` — fill with defaults

---

## Accessibility & Performance

### Accessibility
- Calendar grid: semantic HTML `<table>` or `<grid>` with ARIA labels
- Clickable days have focus indicators
- Celebration modal: focus trap, announce milestone text
- Color heatmap: contrast ratio ≥4.5:1 (WCAG AA)
- Text sizes match existing design (no new sizing that breaks mobile)

### Performance
- Month view: calculate heatmap once on tab load, cache if browsing
- Celebrations: single modal (not dozens), dismiss cleanly
- Notes: stored inline on task, no separate API calls
- No external dependencies (everything uses existing Bodhi code)

---

## Data Persistence & Sync

### localStorage
- Tasks with `notes` field saved to localStorage as-is
- Milestones object saved to localStorage
- No breaking changes (old data loads without notes/milestones, defaults to `undefined`)

### Google Drive Sync
- Backup includes `notes` and `milestones`
- No new file structure (same `bodhi-state.json`)
- Restore from backup: old backups load fine (undefined fields default to optional)

### Manual Backup/Import
- `exportBackup()` includes full state with notes and milestones
- `importBackup()` sanitizes notes (max 200 chars) and milestones (valid thresholds)
- Import can override existing milestones if backup is from another device/date

---

## Non-Goals & Future Considerations

**Explicitly NOT included:**
- Task reminders/notifications
- Time tracking per task
- Difficulty/priority levels for tasks
- Category/tag system for habits
- Social features (leaderboards, sharing)
- Advanced analytics (trend lines, predictions)
- Dark mode toggle (already dark by default)
- Undo history for task completions

**Future enhancements (Phase 2+):**
- Weekly summary email/view
- Habit strength indicator (consistency %)
- Custom milestone thresholds per task
- Export calendar as PDF/image
- Multi-year comparison
- Task archival reasons ("I finished this" vs. "lost interest")

---

## Success Criteria

✓ Task notes editable in Manage, displayed on Today  
✓ Month view loads with accurate heatmap colors  
✓ Clicking day shows task details for that day  
✓ Milestones celebrate 7, 30, 100-day streaks once per task  
✓ Celebration modal appears and auto-closes cleanly  
✓ All data persists to localStorage and Google Drive  
✓ Import/export includes notes and milestones  
✓ No performance degradation on older devices  
✓ Responsive on 430px phone viewport  
✓ Existing functionality unchanged (not broken by new features)
