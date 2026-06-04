/**
 * pomodoro.js — Pomodoro timer with session tracking
 */

import { sessions as sessionsDB, settings } from '../db.js';
import { uid, todayStr, showToast, formatTimer } from '../utils/helpers.js';

// Pomodoro state (module-level so it survives view re-renders)
let timerState = {
  running:       false,
  mode:          'study',   // 'study' | 'break'
  remaining:     25 * 60,
  studyDuration: 25 * 60,
  breakDuration: 5  * 60,
  sessionsDone:  0,
  intervalId:    null,
  sessionStart:  null,
  currentSession: null,
};

export async function renderPomodoro(container) {
  // Load saved durations
  const studyMins = (await settings.get('pomodoroStudy')) || 25;
  const breakMins = (await settings.get('pomodoroBreak')) || 5;

  timerState.studyDuration = studyMins * 60;
  timerState.breakDuration = breakMins * 60;

  // Only reset if not currently running
  if (!timerState.running) {
    timerState.remaining = timerState.studyDuration;
    timerState.mode = 'study';
  }

  const stats = await sessionsDB.getStats();

  container.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text">
        <h2>مؤقت بومودورو</h2>
        <p>تقنية الفواصل المنتظمة لتحسين التركيز</p>
      </div>
    </div>

    <div class="pomodoro-wrap">

      <!-- Session dots -->
      <div class="pomodoro-sessions" id="session-dots">
        ${renderSessionDots(timerState.sessionsDone)}
      </div>

      <!-- SVG Ring timer -->
      <div class="pomodoro-ring" id="pomo-ring">
        <svg class="pomodoro-svg" width="260" height="260" viewBox="0 0 260 260">
          <circle class="pomodoro-track" cx="130" cy="130" r="115"/>
          <circle class="pomodoro-progress" id="pomo-circle"
            cx="130" cy="130" r="115"
            stroke="${timerState.mode === 'study' ? 'var(--primary)' : 'var(--success)'}"/>
        </svg>
        <div class="pomodoro-center">
          <div class="pomodoro-time" id="pomo-time">${formatTimer(timerState.remaining)}</div>
          <div class="pomodoro-mode" id="pomo-mode">${modeLabel(timerState.mode)}</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="pomodoro-controls">
        <button class="pomodoro-btn skip" id="pomo-skip" title="تخطي">⏭</button>
        <button class="pomodoro-btn play" id="pomo-play-pause"
          aria-label="${timerState.running ? 'إيقاف' : 'ابدأ'}">
          ${timerState.running ? '⏸' : '▶'}
        </button>
        <button class="pomodoro-btn reset" id="pomo-reset" title="إعادة تعيين">↺</button>
      </div>

      <!-- Statistics -->
      <div class="pomo-stats">
        <div class="pomo-stat-item">
          <div class="pomo-stat-val" id="stat-today">${stats.todayCount}</div>
          <div class="pomo-stat-lbl">جلسات اليوم</div>
        </div>
        <div class="pomo-stat-item">
          <div class="pomo-stat-val" id="stat-total">${stats.total}</div>
          <div class="pomo-stat-lbl">إجمالي الجلسات</div>
        </div>
        <div class="pomo-stat-item">
          <div class="pomo-stat-val" id="stat-hours">${stats.totalHours}</div>
          <div class="pomo-stat-lbl">ساعة دراسة</div>
        </div>
        <div class="pomo-stat-item">
          <div class="pomo-stat-val" id="stat-streak">${timerState.sessionsDone}</div>
          <div class="pomo-stat-lbl">الجلسة الحالية</div>
        </div>
      </div>

      <!-- Settings -->
      <div class="settings-section mt-6">
        <div class="settings-section-title">
          <span class="settings-section-icon">⚙️</span> إعدادات المؤقت
        </div>
        <div class="pomo-settings">
          <div class="form-group">
            <label class="form-label" for="study-duration">دقائق الدراسة</label>
            <input type="number" class="form-input" id="study-duration"
              min="1" max="120" value="${studyMins}">
          </div>
          <div class="form-group">
            <label class="form-label" for="break-duration">دقائق الراحة</label>
            <input type="number" class="form-input" id="break-duration"
              min="1" max="60" value="${breakMins}">
          </div>
          <button class="btn btn-secondary" id="save-pomo-settings">💾 حفظ</button>
        </div>
      </div>
    </div>
  `;

  updateRingProgress(container);
  bindPomoEvents(container);
}

function bindPomoEvents(container) {
  const playBtn  = container.querySelector('#pomo-play-pause');
  const resetBtn = container.querySelector('#pomo-reset');
  const skipBtn  = container.querySelector('#pomo-skip');
  const saveBtn  = container.querySelector('#save-pomo-settings');

  playBtn.addEventListener('click', () => toggleTimer(container));
  resetBtn.addEventListener('click', () => resetTimer(container));
  skipBtn.addEventListener('click',  () => skipMode(container));
  saveBtn.addEventListener('click',  () => saveDurations(container));

  // If already running (navigated away and back), hook into existing interval
  if (timerState.running) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = setInterval(() => tick(container), 1000);
  }
}

function toggleTimer(container) {
  if (timerState.running) {
    pauseTimer(container);
  } else {
    startTimer(container);
  }
}

function startTimer(container) {
  timerState.running     = true;
  timerState.sessionStart = Date.now();

  timerState.currentSession = {
    id:          uid(),
    date:        todayStr(),
    mode:        timerState.mode,
    startedAt:   new Date().toISOString(),
    durationMs:  0,
    completed:   false,
  };

  updatePlayBtn(container, true);

  clearInterval(timerState.intervalId);
  timerState.intervalId = setInterval(() => tick(container), 1000);
}

function pauseTimer(container) {
  timerState.running = false;
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  updatePlayBtn(container, false);
}

function resetTimer(container) {
  pauseTimer(container);
  timerState.remaining = timerState.mode === 'study'
    ? timerState.studyDuration
    : timerState.breakDuration;
  timerState.currentSession = null;
  updateDisplay(container);
  updateRingProgress(container);
}

async function tick(container) {
  if (!timerState.running) return;

  timerState.remaining = Math.max(0, timerState.remaining - 1);
  updateDisplay(container);
  updateRingProgress(container);

  if (timerState.remaining <= 0) {
    await onTimerComplete(container);
  }
}

async function onTimerComplete(container) {
  pauseTimer(container);

  // Save completed session
  if (timerState.currentSession && timerState.mode === 'study') {
    const elapsed = Date.now() - (timerState.sessionStart || Date.now());
    const session = {
      ...timerState.currentSession,
      completed:  true,
      durationMs: elapsed,
      endedAt:    new Date().toISOString(),
    };
    await sessionsDB.save(session);
    timerState.sessionsDone++;
    timerState.currentSession = null;

    // Update stats display
    const stats = await sessionsDB.getStats();
    const todayEl = container.querySelector('#stat-today');
    const totalEl = container.querySelector('#stat-total');
    const hoursEl = container.querySelector('#stat-hours');
    const streakEl = container.querySelector('#stat-streak');
    if (todayEl)  todayEl.textContent  = stats.todayCount;
    if (totalEl)  totalEl.textContent  = stats.total;
    if (hoursEl)  hoursEl.textContent  = stats.totalHours;
    if (streakEl) streakEl.textContent = timerState.sessionsDone;

    // Update dots
    const dotsEl = container.querySelector('#session-dots');
    if (dotsEl) dotsEl.innerHTML = renderSessionDots(timerState.sessionsDone);
  }

  // Play notification sound
  playBeep();

  // Switch mode
  const wasStudy = timerState.mode === 'study';
  timerState.mode      = wasStudy ? 'break' : 'study';
  timerState.remaining = wasStudy ? timerState.breakDuration : timerState.studyDuration;

  updateDisplay(container);
  updateRingColor(container);
  updateRingProgress(container);

  const msg = wasStudy
    ? `⏰ وقت الراحة! (${Math.round(timerState.breakDuration / 60)} دقائق)`
    : '📚 انتهت الراحة، حان وقت الدراسة!';
  showToast(msg, 'info', 6000);

  // Browser notification if permitted
  if (Notification.permission === 'granted') {
    new Notification('مذاكر', { body: msg, icon: '' });
  }

  // Auto-start next session
  startTimer(container);
}

function skipMode(container) {
  pauseTimer(container);
  timerState.mode      = timerState.mode === 'study' ? 'break' : 'study';
  timerState.remaining = timerState.mode === 'study'
    ? timerState.studyDuration
    : timerState.breakDuration;
  timerState.currentSession = null;
  updateDisplay(container);
  updateRingColor(container);
  updateRingProgress(container);
}

async function saveDurations(container) {
  const studyInput = container.querySelector('#study-duration');
  const breakInput = container.querySelector('#break-duration');
  const studyMins = Math.max(1, Math.min(120, parseInt(studyInput.value, 10) || 25));
  const breakMins = Math.max(1, Math.min(60,  parseInt(breakInput.value, 10) || 5));

  timerState.studyDuration = studyMins * 60;
  timerState.breakDuration = breakMins * 60;

  if (!timerState.running) {
    timerState.remaining = timerState.mode === 'study'
      ? timerState.studyDuration
      : timerState.breakDuration;
    updateDisplay(container);
    updateRingProgress(container);
  }

  await Promise.all([
    settings.set('pomodoroStudy', studyMins),
    settings.set('pomodoroBreak', breakMins),
  ]);
  showToast('تم حفظ الإعدادات', 'success');
}

/* ─── Display helpers ────────────────────────────────────── */
function updateDisplay(container) {
  const timeEl  = container.querySelector('#pomo-time');
  const modeEl  = container.querySelector('#pomo-mode');
  if (timeEl) timeEl.textContent = formatTimer(timerState.remaining);
  if (modeEl) modeEl.textContent = modeLabel(timerState.mode);
}

function updatePlayBtn(container, isRunning) {
  const btn = container.querySelector('#pomo-play-pause');
  if (btn) {
    btn.innerHTML    = isRunning ? '⏸' : '▶';
    btn.setAttribute('aria-label', isRunning ? 'إيقاف' : 'ابدأ');
  }
}

function updateRingProgress(container) {
  const circle = container.querySelector('#pomo-circle');
  if (!circle) return;
  const total    = timerState.mode === 'study' ? timerState.studyDuration : timerState.breakDuration;
  const r        = 115;
  const circ     = 2 * Math.PI * r;
  const fraction = total > 0 ? timerState.remaining / total : 1;
  const offset   = circ * (1 - fraction);
  circle.style.strokeDasharray  = `${circ}`;
  circle.style.strokeDashoffset = `${offset}`;
}

function updateRingColor(container) {
  const circle = container.querySelector('#pomo-circle');
  if (circle) {
    circle.style.stroke = timerState.mode === 'study'
      ? 'var(--primary)'
      : 'var(--success)';
  }
}

function modeLabel(mode) {
  return mode === 'study' ? '🎓 وقت الدراسة' : '☕ وقت الراحة';
}

function renderSessionDots(count) {
  return Array.from({ length: Math.max(4, count + 1) }).map((_, i) =>
    `<div class="session-dot ${i < count ? 'complete' : ''}"></div>`
  ).join('');
}

/* ─── Simple audio beep using Web Audio API ─────────────── */
function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
  } catch {
    // Audio not available — silent fallback
  }

  // Request notification permission on first beep
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}
