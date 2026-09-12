/**
 * db.js — IndexedDB wrapper for مذاكر
 * All persistent storage lives here. Every method returns a Promise.
 */

const DB_NAME    = 'mudhakir_db';
const DB_VERSION = 4;

// Store names
const STORES = {
  SUBJECTS:  'subjects',
  CARDS:     'flashcards',
  FILES:     'files',
  SESSIONS:  'pomodoro_sessions',
  HISTORY:   'review_history',
  SETTINGS:  'settings',
  CHAT:      'chat_messages',
  PLANS:     'review_plans', // Lesson-based review checklists (Deck-independent)
};

/* ─── Category / Deck constants ───────────────────────────── */
export const CATEGORIES = {
  GENERAL: 'عام',
  ENGLISH: 'إنجليزي',
};

let _db = null;

/* ─── Open / Upgrade ──────────────────────────────────────── */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Subjects
      if (!db.objectStoreNames.contains(STORES.SUBJECTS)) {
        const s = db.createObjectStore(STORES.SUBJECTS, { keyPath: 'id' });
        s.createIndex('name',      'name',      { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Flashcards
      let cardStore;
      if (!db.objectStoreNames.contains(STORES.CARDS)) {
        cardStore = db.createObjectStore(STORES.CARDS, { keyPath: 'id' });
        cardStore.createIndex('subjectId',  'subjectId',  { unique: false });
        cardStore.createIndex('nextReview', 'nextReview', { unique: false });
        cardStore.createIndex('stage',      'stage',      { unique: false });
      } else {
        cardStore = e.target.transaction.objectStore(STORES.CARDS);
      }
      // v4: category/deck index (added for English deck + filtering)
      if (cardStore && !cardStore.indexNames.contains('category')) {
        cardStore.createIndex('category', 'category', { unique: false });
      }

      // Lesson review plans (independent of flashcards — see reviews.js)
      if (!db.objectStoreNames.contains(STORES.PLANS)) {
        const s = db.createObjectStore(STORES.PLANS, { keyPath: 'id' });
        s.createIndex('subjectId', 'subjectId', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Files (metadata + extracted text; we don't store binary blobs)
      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const s = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
        s.createIndex('subjectId', 'subjectId', { unique: false });
      }

      // Pomodoro sessions
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const s = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        s.createIndex('date',      'date',      { unique: false });
        s.createIndex('completed', 'completed', { unique: false });
      }

      // Review history
      if (!db.objectStoreNames.contains(STORES.HISTORY)) {
        const s = db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        s.createIndex('cardId',     'cardId',     { unique: false });
        s.createIndex('reviewedAt', 'reviewedAt', { unique: false });
      }

      // Settings — simple key/value store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Chat messages
      if (!db.objectStoreNames.contains(STORES.CHAT)) {
        const s = db.createObjectStore(STORES.CHAT, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(new Error(`IndexedDB open failed: ${e.target.error}`));
  });
}

/* ─── Generic helpers ─────────────────────────────────────── */
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

/* ─── Subjects ────────────────────────────────────────────── */
export const subjects = {
  getAll:    ()         => getAll(STORES.SUBJECTS),
  getById:   (id)       => getById(STORES.SUBJECTS, id),
  save:      (subject)  => put(STORES.SUBJECTS, subject),
  delete:    async (id) => {
    // Cascade: delete all flashcards + files + review plans belonging to this subject
    const [cards, files, plans] = await Promise.all([
      getByIndex(STORES.CARDS, 'subjectId', id),
      getByIndex(STORES.FILES, 'subjectId', id),
      getByIndex(STORES.PLANS, 'subjectId', id),
    ]);
    const ops = [
      ...cards.map(c => del(STORES.CARDS, c.id)),
      ...files.map(f => del(STORES.FILES, f.id)),
      ...plans.map(p => del(STORES.PLANS, p.id)),
      del(STORES.SUBJECTS, id),
    ];
    await Promise.all(ops);
  },
};

/* ─── Flashcards ──────────────────────────────────────────── */
export const flashcards = {
  getAll:          ()            => getAll(STORES.CARDS),
  getById:         (id)          => getById(STORES.CARDS, id),
  getBySubject:    (subjectId)   => getByIndex(STORES.CARDS, 'subjectId', subjectId),
  save:            (card)        => put(STORES.CARDS, card),
  delete:          (id)          => del(STORES.CARDS, id),

  // subjectId: null/'', or '_' (any subject) | category: null = all categories
  getDueCards: async (subjectId = null, category = null) => {
    await openDB();
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0, 10);

    const all = (subjectId && subjectId !== '_')
      ? await getByIndex(STORES.CARDS, 'subjectId', subjectId)
      : await getAll(STORES.CARDS);

    return all.filter(c =>
      (!c.nextReview || c.nextReview <= todayStr) &&
      (!category || (c.category || 'عام') === category)
    );
  },

  getByCategory: (category) => getByIndex(STORES.CARDS, 'category', category),

  // Distinct list of categories currently in use (always includes عام/إنجليزي)
  getCategories: async () => {
    const all = await getAll(STORES.CARDS);
    const set = new Set(['عام', 'إنجليزي']);
    all.forEach(c => set.add(c.category || 'عام'));
    return Array.from(set);
  },

  bulkSave: async (cards) => {
    await openDB();
    const store = tx(STORES.CARDS, 'readwrite');
    return Promise.all(cards.map(c => req2p(store.put(c))));
  },
};

/* ─── Files ───────────────────────────────────────────────── */
export const files = {
  getAll:       ()           => getAll(STORES.FILES),
  getBySubject: (subjectId)  => getByIndex(STORES.FILES, 'subjectId', subjectId),
  save:         (file)       => put(STORES.FILES, file),
  delete:       (id)         => del(STORES.FILES, id),
};

/* ─── Pomodoro sessions ───────────────────────────────────── */
export const sessions = {
  getAll:     ()       => getAll(STORES.SESSIONS),
  save:       (s)      => put(STORES.SESSIONS, s),

  getStats: async () => {
    const all = await getAll(STORES.SESSIONS);
    const completed = all.filter(s => s.completed);
    const totalMs   = completed.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    const today     = new Date().toISOString().slice(0, 10);
    const todayCount = completed.filter(s => s.date === today).length;
    return {
      total:      completed.length,
      todayCount,
      totalHours: +(totalMs / 3_600_000).toFixed(1),
    };
  },
};

/* ─── Review history ──────────────────────────────────────── */
export const history = {
  getAll:       ()       => getAll(STORES.HISTORY),
  getByCard:    (cardId) => getByIndex(STORES.HISTORY, 'cardId', cardId),
  save:         (h)      => put(STORES.HISTORY, h),

  getRecent: async (limit = 20) => {
    const all = await getAll(STORES.HISTORY);
    return all
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
      .slice(0, limit);
  },
};

/* ─── Lesson Review Plans (independent of flashcards) ────────
 * A "plan" represents one lesson/topic that needs to be revisited
 * on a spaced schedule (e.g. 1, 3, 7, 21, 40 days later).
 * Structure:
 * {
 *   id, title, category, subjectId (optional link), pages (free text),
 *   createdAt (YYYY-MM-DD), color,
 *   reviews: [ { id, offsetDays, dueDate, done, completedAt } ]
 * }
 * ────────────────────────────────────────────────────────── */
export const reviewPlans = {
  getAll:       ()          => getAll(STORES.PLANS),
  getById:      (id)        => getById(STORES.PLANS, id),
  getBySubject: (subjectId) => getByIndex(STORES.PLANS, 'subjectId', subjectId),
  save:         (plan)      => put(STORES.PLANS, plan),
  delete:       (id)        => del(STORES.PLANS, id),
};

/* ─── Settings ────────────────────────────────────────────── */
export const settings = {
  get: async (key) => {
    const rec = await getById(STORES.SETTINGS, key);
    return rec ? rec.value : undefined;
  },
  set: (key, value) => put(STORES.SETTINGS, { key, value }),

  getAll: async () => {
    const rows = await getAll(STORES.SETTINGS);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
};

/* ─── Chat messages ───────────────────────────────────────── */
export const chatMessages = {
  getAll:   ()    => getAll(STORES.CHAT),
  save:     (m)   => put(STORES.CHAT, m),
  clearAll: async () => {
    await openDB();
    return req2p(tx(STORES.CHAT, 'readwrite').clear());
  },
};

/* ─── Aggregate stats (dashboard) ────────────────────────── */
export async function getDashboardStats() {
  const [allSubjects, allCards, allSessions, due, plans] = await Promise.all([
    subjects.getAll(),
    flashcards.getAll(),
    sessions.getStats(),
    flashcards.getDueCards(),
    reviewPlans.getAll(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const englishCount   = allCards.filter(c => (c.category || 'عام') === 'إنجليزي').length;
  const plansDueToday  = plans.filter(p => (p.reviews || []).some(r => !r.done && r.dueDate <= today)).length;
  return {
    subjectCount:  allSubjects.length,
    cardCount:     allCards.length,
    dueCount:      due.length,
    englishCount,
    planCount:     plans.length,
    plansDueToday,
    pomodoroStats: allSessions,
  };
}

// Initialise on first import
export const dbReady = openDB();
