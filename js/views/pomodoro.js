/** Study timer, progress and city. The hash stays compatible with saved links. */
import { sessions as sessionsDB, settings } from '../db.js';
import { auth } from '../services/firebase.js';
import { uid, showToast, formatTimer, escHtml } from '../utils/helpers.js';
import { localStudyDay } from '../services/reviewPlanSchedule.js';
import { sessionTotals, addStudySpan, studyDuration, projectStudyTotals, creditStudyProject } from '../services/studyTime.js';
import { cityScene, landmarkProgress, CITY_FRAME, riyadhTowerClip } from './focusCity.js';
import { CITY_WORLDS } from './cityWorlds.js';

const MODES = { pomodoro: 'بومودورو', countdown: 'عد تنازلي', stopwatch: 'عداد مفتوح' };
let owner;
let timer;
let records = [];
let view;
let ticker;
let selected = 0;
let cityTurn = 0;
let worldId = 'riyadh';
let cameraBox = [...CITY_FRAME];
let cityLocations = [];
let cityPaintKey = '';
let cityLighting = 'auto';
let lightingTimer = null;
let clearCityFullscreen;
const riyadhClock = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Riyadh', hour:'2-digit', hourCycle:'h23' });
let cityPulse = -1;
let savedProjects = {};
let audio;

function newTimer() {
  return { mode: 'pomodoro', phase: 'study', study: 25, rest: 5, countdown: 30,
    elapsed: 0, started: null, id: null, days: {}, projects: {}, pending: null, saving: false };
}

export function resetStudyTimer() {
  clearInterval(ticker);
  clearTimeout(lightingTimer);
  clearCityFullscreen?.();
  owner = null;
  timer = newTimer();
  records = [];
  view = null;
  selected = 0;
  cityTurn = 0;
  worldId = 'riyadh';
  cameraBox = [...CITY_FRAME];
  cityPaintKey = '';
  savedProjects = {};
}

function activeProject() {
  return CITY_WORLDS[worldId].landmarks[selected]?.[7] || null;
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
  if (state.phase === 'study') {
    const span = total - state.elapsed;
    addStudySpan(state.days, state.started, state.started + span);
    creditStudyProject(state.projects, activeProject(), span);
  }
  state.elapsed = total;
  state.started = null;
}

function clearPhase(state, phase = 'study') {
  Object.assign(state, { phase, elapsed: 0, started: null, id: null, firstStart: null, days: {}, projects: {}, pending: null });
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
  else {
    updateControls();
    const pulse = Math.floor(Date.now() / 250);
    if (worldId === 'riyadh' && state.phase === 'study' && pulse !== cityPulse) {
      cityPulse = pulse;
      refreshCity();
    }
  }
}

async function finish(state, automatic = false) {
  if (state.saving) return;
  pause(state);
  clearInterval(ticker);
  const nextPhase = state.mode === 'pomodoro' && state.phase === 'study' ? 'break' : 'study';
  if (state.phase === 'study' && state.elapsed > 0) {
    state.pending ??= {
      id: state.id, date: localStudyDay(new Date(state.firstStart)),
      mode: state.mode, completed: true, durationMs: state.elapsed, studyByDay: state.days, cityStudyMs: state.projects,
      startedAt: new Date(state.firstStart).toISOString(), endedAt: new Date().toISOString(),
    };
    state.saving = true;
    updateControls();
    try {
      await sessionsDB.save(state.pending);
      if (timer !== state) return;
      records = [...records.filter(row => row.id !== state.id), state.pending];
      savedProjects = projectStudyTotals(records);
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
  savedProjects = projectStudyTotals(records);
  if (!state.id) {
    state.study = study || 25;
    state.rest = rest || 5;
    state.countdown = countdown || 30;
  }
  view = container;
  cityPaintKey = '';
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
          <span id="focus-project" class="text-xs"></span>
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
          <p id="city-description" class="text-muted"></p></div>
        <span id="focus-city-count" class="category-badge"></span>
      </div>
      <div class="city-viewport" id="city-viewport">
      <div class="city-pickers">
        <label>المدينة <select id="city-world" class="form-select">${Object.entries(CITY_WORLDS).map(([id, world]) =>
          `<option value="${id}">${world.name}</option>`).join('')}</select></label>
        <label>المعلم <select id="city-landmark" class="form-select"></select></label>
        <label id="city-light-control">إضاءة المدينة <select id="city-lighting" class="form-select">
          <option value="auto">تلقائي · توقيت الرياض</option><option value="day">نهار</option><option value="night">ليل</option>
        </select></label>
      </div>
      <div class="city-controls" aria-label="التحكم بالخريطة">
        <button type="button" class="btn btn-primary btn-sm" id="city-visit">اقترب من المعلم</button>
        <button type="button" class="btn btn-secondary btn-sm" id="city-in" aria-label="تقريب">＋</button>
        <button type="button" class="btn btn-secondary btn-sm" id="city-out" aria-label="إبعاد">−</button>
        <button type="button" class="btn btn-secondary btn-sm" id="city-left" aria-label="دوّر المدينة لليسار">↶ تدوير</button>
        <button type="button" class="btn btn-secondary btn-sm" id="city-right" aria-label="دوّر المدينة لليمين">تدوير ↷</button>
        <button type="button" class="btn btn-ghost btn-sm" id="city-overview">نظرة عامة</button>
        <button type="button" class="btn btn-secondary btn-sm city-fullscreen-toggle" id="city-fullscreen" aria-controls="city-viewport" aria-pressed="false">ملء الشاشة</button>
      </div>
      <div id="focus-map" class="focus-map"></div>
      </div>
      <p class="text-muted text-xs city-help">استخدم عجلة الماوس للتقريب والإبعاد، واسحب الخريطة للتنقّل. المجسّم مستوحى من المعالم الحقيقية بمواقع تقريبية. <a id="city-source" target="_blank" rel="noopener noreferrer">مصدر المعالم ↗</a></p>
      <div id="focus-place" class="focus-place"></div>
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
    refreshCity();
  });
  get('focus-finish').addEventListener('click', () => finish(state));
  get('focus-reset').addEventListener('click', () => {
    clearInterval(ticker);
    clearPhase(state);
    updateControls();
    refreshCity();
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
  bindCity(get);
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
  const project = activeProject() && state.phase === 'study' ? CITY_WORLDS.riyadh.landmarks[selected] : null;
  const projectLabel = project ? `مشروع الجلسة: ${project[2]}` : '';
  if (get('focus-project').textContent !== projectLabel) get('focus-project').textContent = projectLabel;
  const toggle = get('focus-toggle');
  toggle.textContent = state.started !== null ? 'إيقاف مؤقت' : state.id ? 'استئناف' : 'ابدأ';
  toggle.disabled = state.saving || !!state.pending;
  const finishButton = get('focus-finish');
  finishButton.textContent = state.saving && state.pending ? 'جارٍ حفظ الجلسة…'
    : state.pending ? 'إعادة محاولة الحفظ' : state.phase === 'break' ? 'إنهاء الراحة' : 'إنهاء وحفظ';
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
  paintCity(minutes);
}

function bindCity(get) {
  const map = get('focus-map');
  const redraw = refreshCity;
  const lighting = get('city-lighting');
  lighting.value = cityLighting;
  lighting.addEventListener('change', event => {
    cityLighting = event.target.value;
    paintCityLight(map);
  });
  clearTimeout(lightingTimer);
  function checkLight() {
    if (!map.isConnected) return;
    paintCityLight(map);
    lightingTimer = setTimeout(checkLight, 15000);
  }
  lightingTimer = setTimeout(checkLight, 15000);
  function switchProject(nextWorld, index) {
    const now = Date.now();
    const running = timer.started !== null && timer.phase === 'study';
    if (running) pause(timer, now);
    worldId = nextWorld;
    selected = index;
    if (running) timer.started = now;
    updateControls();
    redraw();
  }
  const changeLot = index => switchProject(worldId, index);
  get('city-world').addEventListener('change', event => {
    cityTurn = 0;
    cameraBox = [...CITY_FRAME];
    switchProject(event.target.value, 0);
  });
  get('city-landmark').addEventListener('change', event => changeLot(Number(event.target.value)));
  get('city-visit').addEventListener('click', () => zoomCity(4, cityLocations[selected]));
  get('city-in').addEventListener('click', () => zoomCity(CITY_FRAME[2] / cameraBox[2] * 1.45));
  get('city-out').addEventListener('click', () => zoomCity(CITY_FRAME[2] / cameraBox[2] / 1.45));
  get('city-overview').addEventListener('click', () => zoomCity(1));
  bindCityFullscreen(get('city-viewport'), get('city-fullscreen'));
  [['city-left', -1], ['city-right', 1]].forEach(([id, delta]) => {
    get(id).addEventListener('click', () => {
      const zoom = CITY_FRAME[2] / cameraBox[2];
      cityTurn = (cityTurn + delta + 4) % 4;
      redraw();
      zoomCity(zoom, cityLocations[selected]);
    });
  });
  let drag = null;
  let suppressClick = false;
  map.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || !event.deltaY || drag) return;
    const rect = map.querySelector('svg').getBoundingClientRect();
    const scale = Math.min(rect.width / cameraBox[2], rect.height / cameraBox[3]);
    if (!scale) return;
    const [x,y,width,height] = cameraBox;
    const screenX = event.clientX - rect.left - (rect.width - width * scale) / 2;
    const screenY = event.clientY - rect.top - (rect.height - height * scale) / 2;
    if (screenX < 0 || screenX > width * scale || screenY < 0 || screenY > height * scale) return;
    const current = CITY_FRAME[2] / width;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
    const next = Math.max(1, Math.min(7, current * Math.exp(-Math.max(-180, Math.min(180, delta)) * .0025)));
    if (next === current) return;
    event.preventDefault();
    zoomCity(next, [x + screenX / scale, y + screenY / scale], [screenX / (width * scale), screenY / (height * scale)]);
  }, { passive:false });
  map.addEventListener('pointerdown', event => {
    if (event.button !== 0 || cameraBox[2] === CITY_FRAME[2] || drag) return;
    const rect = map.querySelector('svg').getBoundingClientRect();
    const scale = Math.min(rect.width / cameraBox[2], rect.height / cameraBox[3]);
    if (!scale) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, box: [...cameraBox], scale };
    suppressClick = false;
  });
  map.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!suppressClick && Math.hypot(dx, dy) < 5) return;
    suppressClick = true;
    map.setPointerCapture(event.pointerId);
    cameraBox[0] = drag.box[0] - dx / drag.scale;
    cameraBox[1] = drag.box[1] - dy / drag.scale;
    applyCamera();
  });
  const endDrag = event => { if (drag?.id === event.pointerId) drag = null; };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave']) map.addEventListener(type, endDrag);
  map.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    const tile = event.target.closest('[data-tile]');
    if (tile) changeLot(Number(tile.dataset.tile));
  });
  map.addEventListener('keydown', event => {
    const tile = event.target.closest('[data-tile]');
    if (!tile || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    changeLot(Number(tile.dataset.tile));
    map.querySelector(`[data-tile="${selected}"]`)?.focus({ preventScroll: true });
  });
}

function bindCityFullscreen(viewport, button) {
  clearCityFullscreen?.();
  const doc = viewport.ownerDocument;
  const expanded = () => doc.fullscreenElement === viewport || viewport.classList.contains('is-expanded');
  function sync() {
    const active = expanded();
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'خروج من ملء الشاشة' : 'ملء الشاشة';
  }
  function escape(event) {
    if (event.key === 'Escape' && viewport.isConnected && viewport.classList.contains('is-expanded')) {
      viewport.classList.remove('is-expanded');
      sync();
      button.focus();
    }
  }
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('keydown', escape);
  clearCityFullscreen = () => {
    doc.removeEventListener('fullscreenchange', sync);
    doc.removeEventListener('keydown', escape);
    viewport.classList.remove('is-expanded');
    if (doc.fullscreenElement === viewport) doc.exitFullscreen().catch(() => {});
    clearCityFullscreen = null;
  };
  button.addEventListener('click', async () => {
    if (doc.fullscreenElement === viewport) {
      await doc.exitFullscreen();
    } else if (viewport.classList.contains('is-expanded')) {
      viewport.classList.remove('is-expanded');
    } else {
      try {
        if (viewport.requestFullscreen) await viewport.requestFullscreen();
        else viewport.classList.add('is-expanded');
      } catch {
        if (viewport.isConnected) viewport.classList.add('is-expanded');
      }
    }
    sync();
  });
}

function paintCityLight(map) {
  const hour = Number(riyadhClock.format(new Date()));
  map.dataset.cityLight = worldId === 'riyadh' && (cityLighting === 'night'
    || cityLighting === 'auto' && (hour < 6 || hour >= 18)) ? 'night' : 'day';
}

function zoomCity(zoom, anchor = [cameraBox[0] + cameraBox[2] / 2, cameraBox[1] + cameraBox[3] / 2], position = [.5,.5]) {
  zoom = Math.max(1, Math.min(7, zoom));
  const width = CITY_FRAME[2] / zoom, height = CITY_FRAME[3] / zoom;
  cameraBox = [anchor[0] - width * position[0], anchor[1] - height * position[1], width, height];
  applyCamera();
}

function applyCamera() {
  const map = view.querySelector('#focus-map');
  view.querySelector('#city-light-control').hidden = worldId !== 'riyadh';
  paintCityLight(map);
  const [,,width,height] = cameraBox;
  cameraBox[0] = Math.max(0, Math.min(CITY_FRAME[2] - width, cameraBox[0]));
  cameraBox[1] = Math.max(0, Math.min(CITY_FRAME[3] - height, cameraBox[1]));
  map.querySelector('svg').setAttribute('viewBox', cameraBox.join(' '));
  map.classList.toggle('is-zoomed', width < CITY_FRAME[2]);
}

function refreshCity() {
  if (view?.querySelector('#focus-map')) paintCity(sessionTotals(records).all / 60000);
}

function paintCity(minutes) {
  const world = CITY_WORLDS[worldId];
  const landmarks = world.landmarks;
  const projects = { ...savedProjects };
  for (const [id, duration] of Object.entries(timer.projects)) creditStudyProject(projects, id, duration);
  if (timer.started !== null && timer.phase === 'study') {
    creditStudyProject(projects, activeProject(), elapsed(timer) - timer.elapsed);
  }
  const progressByLot = landmarks.map((_, index) => landmarkProgress(landmarks, index, minutes, projects));
  const unlocked = progressByLot.filter(progress => progress.complete).length;
  view.querySelector('#city-world').value = worldId;
  view.querySelector('#city-description').textContent = world.description;
  view.querySelector('#city-source').href = world.source;
  view.querySelector('#focus-city-count').textContent = `المكتمل: ${unlocked} من ${landmarks.length}`;
  const picker = view.querySelector('#city-landmark');
  if (picker.dataset.world !== worldId) {
    picker.innerHTML = landmarks.map(([, , label], index) => `<option value="${index}">${escHtml(label)}</option>`).join('');
    picker.dataset.world = worldId;
  }
  picker.value = String(selected);
  const signature = [worldId, selected, cityTurn, ...progressByLot.map(p => `${p.unlocked}:${p.stage}`)].join('|');
  const map = view.querySelector('#focus-map');
  if (signature !== cityPaintKey) {
    const { svg, locations } = cityScene(world, minutes, selected, cityTurn, escHtml, projects, activeProject());
    cityLocations = locations;
    map.innerHTML = svg;
    cityPaintKey = signature;
    applyCamera();
  }
  map.classList.toggle('is-building', worldId !== 'riyadh' || (timer.phase === 'study' && timer.started !== null));
  const [goal, icon, label, detail, , , , project] = landmarks[selected];
  const progress = progressByLot[selected];
  const task = progress.fraction < .12 ? 'تجهيز الموقع' : progress.fraction < .35 ? 'الأساسات'
    : progress.fraction < .7 ? 'البناء الرئيسي' : 'التشطيب';
  const description = project
    ? `${progress.complete ? 'اكتمل المشروع' : `${task} · المرحلة ${progress.stage + 1} من ${progress.stages}`} · ${studyDuration(progress.remaining * 60000)} متبقية من ${studyDuration(goal * 60000)} · ${detail}`
    : progress.unlocked ? `المرحلة ${progress.stage} من 3 · ${detail}` : `باقي ${progress.remaining} دقيقة مذاكرة لفتحه.`;
  const place = view.querySelector('#focus-place');
  const markup = `<strong>${icon} ${escHtml(label)}</strong><span>${escHtml(description)}</span>
    <progress max="1" aria-label="تقدّم المعلم"></progress>
    ${project ? `<div class="city-work-readout"><span data-work-status></span><bdi data-work-time></bdi></div>
      <div class="city-work-cycle"><span data-work-step></span><progress max="1" aria-label="دورة العمل الحالية"></progress></div>
      <small>المجسّم الشفاف يوضح شكل البرج النهائي. احفظ الجلسة لتثبيت وقت العمل.</small>` : ''}`;
  if (place.dataset.markup !== markup) {
    place.innerHTML = markup;
    place.dataset.markup = markup;
  }
  place.querySelector('progress').value = progress.fraction;
  if (project) updateRiyadhWork(map, place, world, progress);
}

const WORK_STEPS = ['تحديد موقع العمل','وصول المواد','رفع الحمولة','تجهيز القطعة','تثبيت القطعة','ضبط المحاذاة','فحص الجودة','تجهيز الدفعة التالية'];
const GARDEN_STEPS = ['تحديد مساحة الزراعة','تجهيز التربة','توزيع الشتلات','حفر الأحواض','غرس الشتلات','ردم الأحواض','ري النباتات','فحص خطوط الري'];

function updateRiyadhWork(map, place, world, progress) {
  const running = timer.phase === 'study' && timer.started !== null && !progress.complete;
  const seconds = progress.spent * 60;
  const step = Math.floor(seconds / 3) % WORK_STEPS.length;
  const kind = world.landmarks[selected][6];
  const steps = ['palm','pine','garden'].includes(kind) ? GARDEN_STEPS : WORK_STEPS;
  const time = place.querySelector('[data-work-time]');
  const status = place.querySelector('[data-work-status]');
  const caption = place.querySelector('[data-work-step]');
  const hours = Math.floor(seconds / 3600);
  time.textContent = (hours ? `${hours}:` : '') + formatTimer(Math.floor(seconds) % 3600);
  status.textContent = progress.complete ? 'مكتمل' : running ? 'العمل جارٍ الآن' : seconds ? 'العمل متوقف' : 'ابدأ المؤقت لتشغيل الموقع';
  caption.textContent = progress.complete ? 'انتهى العمل في الموقع' : `دورة العمل · ${steps[step]}`;
  caption.nextElementSibling.value = progress.complete ? 1 : (seconds % 24) / 24;
  const clip = riyadhTowerClip(world, cityTurn, selected, progress.fraction);
  if (clip) map.querySelector(`#${clip.id} rect`)?.setAttribute('y', clip.y.toFixed(4));
  map.querySelectorAll('[data-build-step]').forEach(marker => {
    marker.setAttribute('opacity', seconds && Number(marker.dataset.buildStep) <= step ? '1' : '.23');
  });
}
