import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addStudySpan, sessionTotals } from '../js/services/studyTime.js';
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
