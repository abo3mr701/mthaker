/** Study timer, progress and city. The hash stays compatible with saved links. */
import { sessions as sessionsDB, settings } from '../db.js';
import { auth } from '../services/firebase.js';
import { uid, showToast, formatTimer } from '../utils/helpers.js';
import { localStudyDay } from '../services/reviewPlanSchedule.js';
import { sessionTotals, addStudySpan, studyDuration } from '../services/studyTime.js';

const MODES = { pomodoro: 'بومودورو', countdown: 'عد تنازلي', stopwatch: 'عداد مفتوح' };
const CITY = [
  [5, '🌱', 'مشتل الحي', 'هنا تبدأ حديقة المدينة.'],
  [15, '🌻', 'ميدان دوّار الشمس', 'أزهار صفراء على مدخل الحي.'],
  [25, '🏡', 'بيت البدايات', 'أول بيت يفتح أبوابه في المدينة.'],
  [40, '🌵', 'حديقة الصبّار', 'نباتات تتحمل أيام الصيف الطويلة.'],
  [60, '📚', 'مكتبة المدينة', 'مكان هادئ لقراءة فصل جديد.'],
  [85, '🌴', 'ممر النخيل', 'طريق مظلل يصل الساحة بالحديقة.'],
  [120, '⛲', 'ساحة النافورة', 'ملتقى سكان المدينة.'],
  [160, '🌸', 'بستان الكرز', 'أزهار وردية تحيط بالممر.'],
  [210, '🏫', 'مدرسة الحي', 'صفوف تفتح في الصباح.'],
  [270, '🌿', 'حديقة الأعشاب', 'ريحان ونعناع على أطراف الساحة.'],
  [340, '🌉', 'جسر الوادي', 'معبر يصل ضفتي المدينة.'],
  [420, '🎋', 'غابة الخيزران', 'ركن أخضر على الضفة الهادئة.'],
  [510, '🏛️', 'متحف المعرفة', 'قاعة تحفظ اكتشافات المدينة.'],
  [610, '🍋', 'بستان الليمون', 'أشجار مثمرة قرب السوق.'],
  [730, '🏪', 'السوق الصغير', 'دكاكين على جانبي الشارع.'],
  [870, '🌲', 'منتزه الصنوبر', 'أشجار عالية حول مسار المشي.'],
  [1030, '🚉', 'محطة القطار', 'الطريق إلى أحياء أبعد.'],
  [1210, '🪷', 'بركة اللوتس', 'أزهار تطفو فوق الماء.'],
  [1410, '🗼', 'برج المدينة', 'من هنا تشوف الأحياء كلها.'],
  [1650, '🌳', 'شجرة الساحة الكبرى', 'ظل واسع يجمع أهل المدينة.'],
  [1950, '🏟️', 'ملعب المدينة', 'مكان للحركة بعد المذاكرة.'],
  [2300, '🪻', 'حديقة الخزامى', 'ممرات بنفسجية قرب المنتزه.'],
  [2700, '🏰', 'قلعة المعرفة', 'معلم يطل على المدينة.'],
  [3200, '🌆', 'حي الأفق', 'حي جديد تضيئه إنجازاتك.'],
];

let owner;
let timer;
let records = [];
let view;
let ticker;
let selected = 0;
let audio;

function newTimer() {
  return { mode: 'pomodoro', phase: 'study', study: 25, rest: 5, countdown: 30,
    elapsed: 0, started: null, id: null, days: {}, pending: null, saving: false };
}

export function resetStudyTimer() {
  clearInterval(ticker);
  owner = null;
  timer = newTimer();
  records = [];
  view = null;
  selected = 0;
}

function limit(state) {
  if (state.phase === 'break') return state.rest * 60000;
  if (state.mode === 'stopwatch') return Infinity;
  return (state.mode === 'countdown' ? state.countdown : state.study) * 60000;
}

function elapsed(state, now = Date.now()) {
  return Math.min(limit(state), state.elapsed + (state.started === null ? 0 : Math.max(0, now - state.started)));
}

function pause(state, now = Date.now()) {
  if (state.started === null) return;
  const total = elapsed(state, now);
  if (state.phase === 'study') addStudySpan(state.days, state.started, state.started + total - state.elapsed);
  state.elapsed = total;
  state.started = null;
}

function clearPhase(state, phase = 'study') {
  Object.assign(state, { phase, elapsed: 0, started: null, id: null, firstStart: null, days: {}, pending: null });
}

function start(state) {
  state.started = Date.now();
  state.id ??= uid();
  state.firstStart ??= state.started;
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
}

async function tick() {
  const state = timer;
  if (!state || state.started === null) return;
  if (elapsed(state) >= limit(state)) await finish(state, true);
  else updateControls();
}

async function finish(state, automatic = false) {
  if (state.saving) return;
  pause(state);
  clearInterval(ticker);
  const nextPhase = state.mode === 'pomodoro' && state.phase === 'study' ? 'break' : 'study';
  if (state.phase === 'study' && state.elapsed > 0) {
    state.pending ??= {
      id: state.id, date: localStudyDay(new Date(state.firstStart)),
      mode: state.mode, completed: true, durationMs: state.elapsed, studyByDay: state.days,
      startedAt: new Date(state.firstStart).toISOString(), endedAt: new Date().toISOString(),
    };
    state.saving = true;
    updateControls();
    try {
      await sessionsDB.save(state.pending);
      if (timer !== state) return;
      records = [...records.filter(row => row.id !== state.id), state.pending];
      showToast('تم تسجيل وقت المذاكرة.', 'success');
    } catch {
      if (timer === state) showToast('تعذّر الحفظ. اضغط «إعادة محاولة الحفظ».', 'error');
      return;
    } finally {
      state.saving = false;
      if (timer === state) updateControls();
    }
  }
  clearPhase(state, nextPhase);
  if (automatic && state.mode === 'pomodoro') start(state);
  if (automatic) {
    chime();
    showToast(nextPhase === 'break' ? 'حان وقت الراحة ☕' : 'انتهى الوقت ⏰', 'info');
  }
  updateControls();
  paintProgress();
}

function chime() {
  if (audio?.state !== 'running') return;
  const tone = audio.createOscillator();
  const volume = audio.createGain();
  tone.frequency.value = 660;
  volume.gain.setValueAtTime(0.12, audio.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7);
  tone.connect(volume);
  volume.connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + 0.7);
}

export async function renderPomodoro(container) {
  const account = auth.currentUser?.uid;
  if (owner !== account) {
    resetStudyTimer();
    owner = account;
  }
  const state = timer;
  const [sessions, study, rest, countdown] = await Promise.all([
    sessionsDB.getAll(), settings.get('pomodoroStudy'), settings.get('pomodoroBreak'), settings.get('studyCountdown'),
  ]);
  if (timer !== state) return;
  records = [...new Map([...sessions, ...records].map(row => [row.id, row])).values()];
  if (!state.id) {
    state.study = study || 25;
    state.rest = rest || 5;
    state.countdown = countdown || 30;
  }
  view = container;
  container.innerHTML = `
    <div class="page-hd"><div class="page-hd-text"><h2>مؤقت المذاكرة</h2>
    <p>اختر طريقة التركيز وشاهد مدينتك تكبر مع كل جلسة.</p></div></div>
    <div class="focus-layout">
      <section class="card focus-timer" aria-label="مؤقت المذاكرة">
        <label for="focus-mode" class="form-label">نوع المؤقت</label>
        <select class="form-select" id="focus-mode">
          ${Object.entries(MODES).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
        </select>
        <div class="focus-clock">
          <strong id="focus-time" dir="ltr"></strong>
          <span id="focus-phase"></span>
        </div>
        <div class="flex gap-2 wrap focus-actions">
          <button class="btn btn-primary" id="focus-toggle"></button>
          <button class="btn btn-secondary" id="focus-finish"></button>
          <button class="btn btn-ghost" id="focus-reset">إعادة تعيين</button>
        </div>
        <form id="focus-options" class="focus-options">
          <label id="focus-study-label">دقائق المذاكرة
            <input class="form-input" id="focus-study" type="number" min="1" max="240" required value="${state.mode === 'countdown' ? state.countdown : state.study}">
          </label>
          <label id="focus-rest-label">دقائق الراحة
            <input class="form-input" id="focus-rest" type="number" min="1" max="60" required value="${state.rest}">
          </label>
          <button class="btn btn-secondary" type="submit">حفظ المدة</button>
        </form>
      </section>
      <section class="card focus-summary" aria-labelledby="focus-stats-heading">
        <h3 id="focus-stats-heading">وقت المذاكرة</h3>
        <div id="focus-stats" class="focus-stats"></div>
        <p class="text-muted">الأسبوع يبدأ السبت. تظهر الجلسة في الإحصائيات بعد حفظها.</p>
      </section>
    </div>
    <section class="card focus-city" aria-labelledby="focus-city-heading">
      <div class="focus-city-header">
        <div><h3 id="focus-city-heading">مدينة مذاكر</h3>
          <p class="text-muted">كل دقيقة محفوظة تقرّبك من معلم جديد. اضغط أي قطعة لاكتشافها.</p></div>
        <span id="focus-city-count" class="category-badge"></span>
      </div>
      <div id="focus-map" class="focus-map"></div>
      <div id="focus-place" class="focus-place" aria-live="polite"></div>
    </section>`;

  const get = id => container.querySelector('#' + id);
  get('focus-mode').addEventListener('change', event => {
    if (state.id) return;
    state.mode = event.target.value;
    clearPhase(state);
    get('focus-study').value = state.mode === 'countdown' ? state.countdown : state.study;
    updateControls();
  });
  get('focus-toggle').addEventListener('click', () => {
    if (state.started !== null) {
      pause(state);
      clearInterval(ticker);
    } else {
      try {
        audio ??= new (window.AudioContext || window.webkitAudioContext)();
        audio.resume().catch(() => {});
      } catch { /* Sound is optional. */ }
      start(state);
    }
    updateControls();
  });
  get('focus-finish').addEventListener('click', () => finish(state));
  get('focus-reset').addEventListener('click', () => {
    clearInterval(ticker);
    clearPhase(state);
    updateControls();
  });
  get('focus-options').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.id || state.mode === 'stopwatch') return;
    const minutes = get('focus-study').valueAsNumber;
    const rest = get('focus-rest').valueAsNumber;
    state.saving = true;
    updateControls();
    try {
      if (state.mode === 'countdown') {
        await settings.set('studyCountdown', minutes);
        state.countdown = minutes;
      } else {
        await Promise.all([settings.set('pomodoroStudy', minutes), settings.set('pomodoroBreak', rest)]);
        Object.assign(state, { study: minutes, rest });
      }
      showToast('تم حفظ المدة.', 'success');
    } catch {
      showToast('تعذّر حفظ المدة.', 'error');
    } finally {
      state.saving = false;
      updateControls();
    }
  });
  get('focus-map').addEventListener('click', event => {
    const tile = event.target.closest('[data-tile]');
    if (!tile) return;
    selected = Number(tile.dataset.tile);
    get('focus-map').querySelectorAll('[data-tile]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.tile) === selected));
    });
    paintPlace(sessionTotals(records).all / 60000);
  });
  updateControls();
  paintProgress();
}

function updateControls() {
  if (!view?.querySelector('#focus-time')) return;
  const get = id => view.querySelector('#' + id);
  const state = timer;
  const open = state.mode === 'stopwatch';
  const current = elapsed(state);
  const seconds = open ? Math.floor(current / 1000) : Math.ceil((limit(state) - current) / 1000);
  const hours = Math.floor(seconds / 3600);
  const display = hours ? hours + ':' + formatTimer(seconds % 3600) : formatTimer(seconds);
  if (get('focus-time').textContent !== display) get('focus-time').textContent = display;
  get('focus-phase').textContent = state.phase === 'break' ? '☕ وقت الراحة' : '🎓 وقت المذاكرة';
  const toggle = get('focus-toggle');
  toggle.textContent = state.started !== null ? 'إيقاف مؤقت' : state.id ? 'استئناف' : 'ابدأ';
  toggle.disabled = state.saving || !!state.pending;
  const finishButton = get('focus-finish');
  finishButton.textContent = state.pending ? 'إعادة محاولة الحفظ' : state.phase === 'break' ? 'إنهاء الراحة' : 'إنهاء وحفظ';
  finishButton.disabled = state.saving || (!state.id && state.phase === 'study');
  get('focus-reset').disabled = !state.id || state.saving || !!state.pending;
  get('focus-mode').value = state.mode;
  get('focus-mode').disabled = !!state.id || state.saving;
  get('focus-options').hidden = open;
  get('focus-rest-label').hidden = state.mode !== 'pomodoro';
  get('focus-options').querySelectorAll('input, button').forEach(input => { input.disabled = !!state.id || state.saving; });
}

function paintProgress() {
  if (!view?.querySelector('#focus-stats')) return;
  const totals = sessionTotals(records);
  const minutes = totals.all / 60000;
  view.querySelector('#focus-stats').innerHTML = [
    ['اليوم', totals.today], ['هذا الأسبوع', totals.week], ['هذا الشهر', totals.month], ['كل الوقت', totals.all],
  ].map(([label, total]) => `<div><strong>${studyDuration(total)}</strong><span>${label}</span></div>`).join('');
  const unlocked = CITY.filter(([goal]) => minutes >= goal).length;
  view.querySelector('#focus-city-count').textContent = `${unlocked} / ${CITY.length} معلم`;
  view.querySelector('#focus-map').innerHTML = CITY.map(([goal, icon, label], i) => {
    const open = minutes >= goal;
    return `<button type="button" class="focus-tile ${open ? 'is-open' : ''}" data-tile="${i}"
      aria-pressed="${i === selected}" aria-label="${label}${open ? '' : '، مقفل'}">
      <span aria-hidden="true">${open ? icon : '◇'}</span><small>${label}</small></button>`;
  }).join('');
  paintPlace(minutes);
}

function paintPlace(minutes) {
  const [goal, icon, label, detail] = CITY[selected];
  const remaining = Math.max(0, Math.ceil(goal - minutes));
  view.querySelector('#focus-place').textContent = remaining
    ? `🔒 ${label} · باقي ${remaining} دقيقة مذاكرة لفتحه.`
    : `${icon} ${label} · ${detail}`;
}
