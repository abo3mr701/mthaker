/**
 * db.js — IndexedDB wrapper (v4 — updated with streak, new card types)
 */

const DB_NAME    = 'mudhakir_db';
const DB_VERSION = 4;

const STORES = {
  SUBJECTS:  'subjects',
  CARDS:     'flashcards',
  FILES:     'files',
  SESSIONS:  'pomodoro_sessions',
  HISTORY:   'review_history',
  SETTINGS:  'settings',
  CHAT:      'chat_messages',
  STREAK:    'streak',
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(STORES.SUBJECTS)) {
        const s = db.createObjectStore(STORES.SUBJECTS, { keyPath: 'id' });
        s.createIndex('name', 'name', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CARDS)) {
        const s = db.createObjectStore(STORES.CARDS, { keyPath: 'id' });
        s.createIndex('subjectId',  'subjectId',  { unique: false });
        s.createIndex('nextReview', 'nextReview', { unique: false });
        s.createIndex('stage',      'stage',      { unique: false });
        s.createIndex('type',       'type',       { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const s = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
        s.createIndex('subjectId', 'subjectId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const s = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        s.createIndex('date',      'date',      { unique: false });
        s.createIndex('completed', 'completed', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.HISTORY)) {
        const s = db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        s.createIndex('cardId',     'cardId',     { unique: false });
        s.createIndex('reviewedAt', 'reviewedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(STORES.CHAT)) {
        const s = db.createObjectStore(STORES.CHAT, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.STREAK)) {
        db.createObjectStore(STORES.STREAK, { keyPath: 'date' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(new Error(`IndexedDB open failed: ${e.target.error}`));
  });
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function req2p(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

function getAll(storeName) {
  return openDB().then(() => req2p(tx(storeName).getAll()));
}

function getById(storeName, id) {
  return openDB().then(() => req2p(tx(storeName).get(id)));
}

function put(storeName, record) {
  return openDB().then(() => req2p(tx(storeName, 'readwrite').put(record)));
}

function del(storeName, id) {
  return openDB().then(() => req2p(tx(storeName, 'readwrite').delete(id)));
}

function getByIndex(storeName, indexName, value) {
  return openDB().then(() =>
    req2p(tx(storeName).index(indexName).getAll(value))
  );
}

/* ── Subjects ─────────────────────────────────────────── */
export const subjects = {
  getAll:   ()        => getAll(STORES.SUBJECTS),
  getById:  (id)      => getById(STORES.SUBJECTS, id),
  save:     (subject) => put(STORES.SUBJECTS, subject),
  delete:   async (id) => {
    const [cards, files] = await Promise.all([
      getByIndex(STORES.CARDS, 'subjectId', id),
      getByIndex(STORES.FILES, 'subjectId', id),
    ]);
    await Promise.all([
      ...cards.map(c => del(STORES.CARDS, c.id)),
      ...files.map(f => del(STORES.FILES, f.id)),
      del(STORES.SUBJECTS, id),
    ]);
  },
};

/* ── Flashcards ───────────────────────────────────────── */
export const flashcards = {
  getAll:       ()          => getAll(STORES.CARDS),
  getById:      (id)        => getById(STORES.CARDS, id),
  getBySubject: (subjectId) => getByIndex(STORES.CARDS, 'subjectId', subjectId),
  save:         (card)      => put(STORES.CARDS, card),
  delete:       (id)        => del(STORES.CARDS, id),

  getDueCards: async (subjectId = null) => {
    await openDB();
    const today    = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0, 10);
    const all = subjectId
      ? await getByIndex(STORES.CARDS, 'subjectId', subjectId)
      : await getAll(STORES.CARDS);
    return all.filter(c => !c.nextReview || c.nextReview <= todayStr);
  },

  bulkSave: async (cards) => {
    await openDB();
    const store = tx(STORES.CARDS, 'readwrite');
    return Promise.all(cards.map(c => req2p(store.put(c))));
  },
};

/* ── Files ────────────────────────────────────────────── */
export const files = {
  getAll:       ()          => getAll(STORES.FILES),
  getBySubject: (subjectId) => getByIndex(STORES.FILES, 'subjectId', subjectId),
  save:         (file)      => put(STORES.FILES, file),
  delete:       (id)        => del(STORES.FILES, id),
};

/* ── Pomodoro sessions ────────────────────────────────── */
export const sessions = {
  getAll: () => getAll(STORES.SESSIONS),
  save:   (s) => put(STORES.SESSIONS, s),

  getStats: async () => {
    const all       = await getAll(STORES.SESSIONS);
    const completed = all.filter(s => s.completed);
    const totalMs   = completed.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    const today     = new Date().toISOString().slice(0, 10);
    return {
      total:      completed.length,
      todayCount: completed.filter(s => s.date === today).length,
      totalHours: +(totalMs / 3_600_000).toFixed(1),
    };
  },
};

/* ── Review history ───────────────────────────────────── */
export const history = {
  getAll:    ()       => getAll(STORES.HISTORY),
  getByCard: (cardId) => getByIndex(STORES.HISTORY, 'cardId', cardId),
  save:      (h)      => put(STORES.HISTORY, h),

  getRecent: async (limit = 20) => {
    const all = await getAll(STORES.HISTORY);
    return all
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
      .slice(0, limit);
  },
};

/* ── Settings ─────────────────────────────────────────── */
export const settings = {
  get:    async (key) => {
    const rec = await getById(STORES.SETTINGS, key);
    return rec ? rec.value : undefined;
  },
  set:    (key, value) => put(STORES.SETTINGS, { key, value }),
  getAll: async () => {
    const rows = await getAll(STORES.SETTINGS);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
};

/* ── Chat ─────────────────────────────────────────────── */
export const chatMessages = {
  getAll:   ()  => getAll(STORES.CHAT),
  save:     (m) => put(STORES.CHAT, m),
  clearAll: async () => {
    await openDB();
    return req2p(tx(STORES.CHAT, 'readwrite').clear());
  },
};

/* ── Streak ───────────────────────────────────────────── */
export const streak = {
  // Record today as a study day
  recordToday: async () => {
    const today = new Date().toISOString().slice(0, 10);
    await put(STORES.STREAK, { date: today, studiedAt: new Date().toISOString() });
  },

  // Calculate current consecutive streak
  getCurrent: async () => {
    const all = await getAll(STORES.STREAK);
    if (!all.length) return 0;
    const dates = all.map(r => r.date).sort().reverse();
    let count = 0;
    let check = new Date(); check.setHours(0,0,0,0);
    for (const d of dates) {
      const checkStr = check.toISOString().slice(0,10);
      if (d === checkStr) { count++; check.setDate(check.getDate()-1); }
      else if (count === 0) {
        // Allow yesterday (hasn't studied today yet)
        check.setDate(check.getDate()-1);
        if (d === check.toISOString().slice(0,10)) { count++; check.setDate(check.getDate()-1); }
        else break;
      } else break;
    }
    return count;
  },
};

/* ── Dashboard stats ──────────────────────────────────── */
export async function getDashboardStats() {
  const [allSubjects, allCards, allSessions, due, currentStreak] = await Promise.all([
    subjects.getAll(),
    flashcards.getAll(),
    sessions.getStats(),
    flashcards.getDueCards(),
    streak.getCurrent(),
  ]);
  return {
    subjectCount:  allSubjects.length,
    cardCount:     allCards.length,
    dueCount:      due.length,
    pomodoroStats: allSessions,
    streak:        currentStreak,
  };
}

export const dbReady = openDB().catch(async (e) => { await new Promise(r => setTimeout(r, 800)); return openDB(); });
