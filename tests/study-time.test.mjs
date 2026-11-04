import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStudySpan, sessionTotals, creditStudyProject, projectStudyTotals } from '../js/services/studyTime.js';
import { CITY_WORLDS } from '../js/views/cityWorlds.js';
import { cityScene, landmarkProgress } from '../js/views/focusCity.js';
import { parseStudyBackup } from '../js/services/studyBackup.js';

test('study time is split at local midnight and excludes breaks and paused time', () => {
  const days = {};
  addStudySpan(days, +new Date(2026, 10, 6, 23, 55), +new Date(2026, 10, 7, 0, 5));
  addStudySpan(days, +new Date(2026, 10, 7, 0, 15), +new Date(2026, 10, 7, 0, 20));
  const now = new Date(2026, 10, 7, 9);
  const totals = sessionTotals([
    { completed: true, mode: 'stopwatch', studyByDay: days },
    { completed: true, mode: 'study', date: '2026-10-31', durationMs: 1_200_000 },
    { completed: true, mode: 'break', date: '2026-11-07', durationMs: 300_000 },
  ], now);
  assert.deepEqual(totals, { today: 600_000, week: 600_000, month: 900_000, all: 2_100_000, todayCount: 1, count: 2 });
});

test('backup validates current and legacy files, and rejects duplicate or unsafe IDs', () => {
  const old = { version: '1.0', exportedAt: '2026-11-05T00:00:00Z',
    subjects: [{ id: 'math', name: 'رياضيات' }], flashcards: [], files: [], sessions: [], history: [] };
  assert.deepEqual(parseStudyBackup(JSON.stringify(old)).subjects, old.subjects);
  const modern = { ...old, version: '2.0', app: 'mthaker', reviewPlans: [], englishCards: [], englishWords: [] };
  assert.deepEqual(parseStudyBackup(JSON.stringify(modern)).englishCards, []);
  for (const subjects of [[old.subjects[0], old.subjects[0]], [{ id: '../bad', name: 'Invalid' }]]) {
    assert.throws(() => parseStudyBackup(JSON.stringify({ ...modern, subjects })));
  }
});

test('saved work stays with each Riyadh project and does not credit unrelated study or breaks', () => {
  const spans = {};
  creditStudyProject(spans, 'faisaliah', 90 * 60000);
  creditStudyProject(spans, 'ksu-campus', 20 * 60000);
  creditStudyProject(spans, null, 30000);
  const projects = projectStudyTotals([
    { completed: true, cityStudyMs: JSON.parse(JSON.stringify(spans)) },
    { completed: true, mode: 'break', cityStudyMs: { faisaliah: 60000 } },
    { completed: true, durationMs: 60 * 60000 },
  ]);
  const world = CITY_WORLDS.riyadh;
  const index = world.landmarks.findIndex(row => row[7] === 'faisaliah');
  const progress = landmarkProgress(world.landmarks, index, 600, projects);
  assert.equal(progress.stage, 1);
  assert.equal(progress.remaining, 1350);
  assert.equal(projects['ksu-campus'], 20 * 60000);
  assert.equal(landmarkProgress(world.landmarks, 0, 600, projects).fraction, 0);
  const { svg } = cityScene(world, 600, index, 0, s => s, projects, 'faisaliah');
  assert.equal((svg.match(/data-tile=/g) || []).length, world.landmarks.length);
  assert.equal((svg.match(/class="city-worker /g) || []).length, 2);
  assert.ok(!/NaN|undefined/.test(svg));
});
