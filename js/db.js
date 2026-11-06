/**
 * db.js — طبقة البيانات (الآن Firestore بدل IndexedDB المحلية).
 *
 * كل بيانات المستخدم محفوظة تحت users/{uid}/{اسم المجموعة}/{id} في Firestore،
 * فتفتح نفس بياناتك من أي جهاز تسجّل دخول منه بنفس الحساب.
 *
 * ⚠️ الواجهة العامة (كل الدوال المُصدَّرة بالأسفل: subjects, flashcards,
 * files, sessions, history, reviewPlans, englishCards, englishWords,
 * settings, chatMessages, getDashboardStats) بقيت **بنفس الأسماء والشكل
 * تمامًا** كما كانت في نسخة IndexedDB القديمة — عشان باقي ملفات التطبيق
 * (dashboard.js, subjects.js, study.js, reviews.js, english.js...) تشتغل
 * بدون أي تعديل عليها.
 */

import { auth, firestore } from './services/firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, writeBatch, runTransaction,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';
import { sessionTotals } from './services/studyTime.js';
import { localStudyDay } from './services/reviewPlanSchedule.js';

// أسماء المجموعات (نفس أسماء المخازن القديمة بالضبط)
const COLLECTIONS = {
  SUBJECTS:  'subjects',
  CARDS:     'flashcards',
  FILES:     'files',
  SESSIONS:  'pomodoro_sessions',
  HISTORY:   'review_history',
  SETTINGS:  'settings',
  CHAT:      'chat_messages',
  PLANS:     'review_plans',
  ENG_CARDS: 'english_srs_cards',
  ENG_WORDS: 'english_custom_words',
};

/* ─── Category / Deck constants ───────────────────────────── */
export const CATEGORIES = {
  GENERAL: 'عام',
  ENGLISH: 'إنجليزي',
};

/* ─── Generic Firestore helpers (كلها تحت users/{uid}/...) ──── */
function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('لازم تسجّل الدخول أولاً قبل استخدام هذي الميزة.');
  return uid;
}

function col(name) {
  return collection(firestore, 'users', requireUid(), name);
}

async function getAllDocs(name) {
  const snap = await getDocs(col(name));
  return snap.docs.map(d => d.data());
}

async function getByIdDoc(name, id) {
  const snap = await getDoc(doc(col(name), String(id)));
  return snap.exists() ? snap.data() : undefined;
}

async function putDoc(name, record) {
  await setDoc(doc(col(name), String(record.id)), record);
  return record;
}

async function delDoc(name, id) {
  await deleteDoc(doc(col(name), String(id)));
}

async function getByIndexDocs(name, field, value) {
  const snap = await getDocs(query(col(name), where(field, '==', value)));
  return snap.docs.map(d => d.data());
}

async function bulkPutDocs(name, records) {
  const c = col(name);
  for (let i = 0; i < records.length; i += 400) {
    const chunk = records.slice(i, i + 400);
    const batch = writeBatch(firestore);
    chunk.forEach(r => batch.set(doc(c, String(r.id)), r));
    await batch.commit();
  }
  return records;
}

async function bulkDeleteDocs(name, ids) {
  const c = col(name);
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const batch = writeBatch(firestore);
    chunk.forEach(id => batch.delete(doc(c, String(id))));
    await batch.commit();
  }
}

/* ─── Subjects ────────────────────────────────────────────── */
export const subjects = {
  getAll:    ()         => getAllDocs(COLLECTIONS.SUBJECTS),
  getById:   (id)       => getByIdDoc(COLLECTIONS.SUBJECTS, id),
  save:      (subject)  => putDoc(COLLECTIONS.SUBJECTS, subject),
  delete:    async (id) => {
    // Cascade: delete all flashcards + files + review plans belonging to this subject
    const [cards, files, plans] = await Promise.all([
      getByIndexDocs(COLLECTIONS.CARDS, 'subjectId', id),
      getByIndexDocs(COLLECTIONS.FILES, 'subjectId', id),
      getByIndexDocs(COLLECTIONS.PLANS, 'subjectId', id),
    ]);
    await Promise.all([
      bulkDeleteDocs(COLLECTIONS.CARDS, cards.map(c => c.id)),
      bulkDeleteDocs(COLLECTIONS.FILES, files.map(f => f.id)),
      bulkDeleteDocs(COLLECTIONS.PLANS, plans.map(p => p.id)),
    ]);
    await delDoc(COLLECTIONS.SUBJECTS, id);
  },
};

/* ─── Flashcards ──────────────────────────────────────────── */
export const flashcards = {
  getAll:          ()            => getAllDocs(COLLECTIONS.CARDS),
  getById:         (id)          => getByIdDoc(COLLECTIONS.CARDS, id),
  getBySubject:    (subjectId)   => getByIndexDocs(COLLECTIONS.CARDS, 'subjectId', subjectId),
  getByPlan:       (planId)      => getByIndexDocs(COLLECTIONS.CARDS, 'planId', planId),
  save:            (card)        => putDoc(COLLECTIONS.CARDS, card),
  delete:          (id)          => delDoc(COLLECTIONS.CARDS, id),

  // subjectId: null/'', or '_' (any subject) | category: null = all categories
  getDueCards: async (subjectId = null, category = null) => {
    const today = localStudyDay();

    const all = (subjectId && subjectId !== '_')
      ? await getByIndexDocs(COLLECTIONS.CARDS, 'subjectId', subjectId)
      : await getAllDocs(COLLECTIONS.CARDS);

    return all.filter(c =>
      (!c.nextReview || c.nextReview <= today) &&
      (!category || (c.category || 'عام') === category)
    );
  },

  getByCategory: (category) => getByIndexDocs(COLLECTIONS.CARDS, 'category', category),

  getCategories: async () => {
    const all = await getAllDocs(COLLECTIONS.CARDS);
    const set = new Set(['عام', 'إنجليزي']);
    all.forEach(c => set.add(c.category || 'عام'));
    return Array.from(set);
  },

  bulkSave: (cards) => bulkPutDocs(COLLECTIONS.CARDS, cards),
  saveReview: async (cardId, changes, entry) => {
    const batch = writeBatch(firestore);
    batch.update(doc(col(COLLECTIONS.CARDS), cardId), changes);
    batch.set(doc(col(COLLECTIONS.HISTORY), entry.id), entry);
    await batch.commit();
  },
};

/* ─── Files ───────────────────────────────────────────────── */
export const files = {
  getAll:       ()           => getAllDocs(COLLECTIONS.FILES),
  getBySubject: (subjectId)  => getByIndexDocs(COLLECTIONS.FILES, 'subjectId', subjectId),
  save:         (file)       => putDoc(COLLECTIONS.FILES, file),
  delete:       (id)         => delDoc(COLLECTIONS.FILES, id),
};

/* ─── Pomodoro sessions ───────────────────────────────────── */
export const sessions = {
  getAll:     ()       => getAllDocs(COLLECTIONS.SESSIONS),
  save:       (s)      => putDoc(COLLECTIONS.SESSIONS, s),

  getStats: async () => {
    const all = await getAllDocs(COLLECTIONS.SESSIONS);
    const totals = sessionTotals(all);
    return {
      total:      totals.count,
      todayCount: totals.todayCount,
      totalHours: +(totals.all / 3_600_000).toFixed(1),
    };
  },
};

/* ─── Review history ──────────────────────────────────────── */
export const history = {
  getAll:       ()       => getAllDocs(COLLECTIONS.HISTORY),
  getByCard:    (cardId) => getByIndexDocs(COLLECTIONS.HISTORY, 'cardId', cardId),
  save:         (h)      => putDoc(COLLECTIONS.HISTORY, h),

  getRecent: async (limit = 20) => {
    const all = await getAllDocs(COLLECTIONS.HISTORY);
    return all
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
      .slice(0, limit);
  },
};

/* ─── Lesson Review Plans ────────────────────────────────────
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
  getAll:       ()          => getAllDocs(COLLECTIONS.PLANS),
  getById:      (id)        => getByIdDoc(COLLECTIONS.PLANS, id),
  getBySubject: (subjectId) => getByIndexDocs(COLLECTIONS.PLANS, 'subjectId', subjectId),
  save:         (plan)      => putDoc(COLLECTIONS.PLANS, plan),
  move: async (plan, linkedCards) => {
    const batch = writeBatch(firestore);
    batch.set(doc(col(COLLECTIONS.PLANS), plan.id), plan);
    const cards = col(COLLECTIONS.CARDS);
    linkedCards.forEach(card => batch.update(doc(cards, card.id), { subjectId: plan.subjectId }));
    await batch.commit();
  },
  delete:       (id)        => delDoc(COLLECTIONS.PLANS, id),
};

/* ─── English section (Lexora-style) — fully independent store ──
 * englishCards: per-word SRS state, keyed by word id.
 * englishWords: user's own custom-added English words (same shape as the
 * built-in Oxford dataset in js/data/oxfordWords.js).
 * ────────────────────────────────────────────────────────────── */
export const englishCards = {
  getAll:  ()     => getAllDocs(COLLECTIONS.ENG_CARDS),
  getById: (id)   => getByIdDoc(COLLECTIONS.ENG_CARDS, id),
  save:    (card) => putDoc(COLLECTIONS.ENG_CARDS, card),
  bulkSave: (cards) => bulkPutDocs(COLLECTIONS.ENG_CARDS, cards),
};

export const englishWords = {
  getAll:  ()      => getAllDocs(COLLECTIONS.ENG_WORDS),
  save:    (word)  => putDoc(COLLECTIONS.ENG_WORDS, word),
  delete:  (id)    => delDoc(COLLECTIONS.ENG_WORDS, id),
};

/* ─── Settings ────────────────────────────────────────────── */
export const settings = {
  get: async (key) => {
    const snap = await getDoc(doc(col(COLLECTIONS.SETTINGS), String(key)));
    return snap.exists() ? snap.data().value : undefined;
  },
  set: (key, value) => setDoc(doc(col(COLLECTIONS.SETTINGS), String(key)), { key, value }),

  getAll: async () => {
    const rows = await getAllDocs(COLLECTIONS.SETTINGS);
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  },
};

/* ─── Chat messages ───────────────────────────────────────── */
export const chatMessages = {
  getAll:   ()    => getAllDocs(COLLECTIONS.CHAT),
  save:     (m)   => putDoc(COLLECTIONS.CHAT, m),
  clearAll: async () => {
    const all = await getAllDocs(COLLECTIONS.CHAT);
    await bulkDeleteDocs(COLLECTIONS.CHAT, all.map(m => m.id));
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
  const today = localStudyDay();
  const plansDueToday = plans.filter(p => (p.reviews || []).some(r => !r.done && r.dueDate <= today)).length;
  return {
    subjectCount:  allSubjects.length,
    cardCount:     allCards.length,
    dueCount:      due.length,
    planCount:     plans.length,
    plansDueToday,
    pomodoroStats: allSessions,
  };
}

// Firebase App يتهيّأ بشكل متزامن عند الاستيراد — ما يحتاج انتظار فعلي هنا،
// أُبقي هذا التصدير فقط عشان app.js القديم اللي ينتظره ما ينكسر.
export const dbReady = Promise.resolve();

const BACKUP_COLLECTIONS = {
  subjects: COLLECTIONS.SUBJECTS, flashcards: COLLECTIONS.CARDS, files: COLLECTIONS.FILES,
  sessions: COLLECTIONS.SESSIONS, history: COLLECTIONS.HISTORY, reviewPlans: COLLECTIONS.PLANS,
  englishCards: COLLECTIONS.ENG_CARDS, englishWords: COLLECTIONS.ENG_WORDS,
};

export async function readStudyBackup() {
  return Object.fromEntries(await Promise.all(Object.entries(BACKUP_COLLECTIONS)
    .map(async ([key, name]) => [key, await getAllDocs(name)])));
}

export async function restoreStudyBackup(data) {
  const account = requireUid();
  let added = 0;
  for (const [key, name] of Object.entries(BACKUP_COLLECTIONS)) {
    const rows = data[key] || [];
    const target = collection(firestore, 'users', account, name);
    for (let i = 0; i < rows.length; i += 100) {
      if (requireUid() !== account) throw new Error('تغيّر الحساب أثناء الاستعادة.');
      const chunk = rows.slice(i, i + 100);
      added += await runTransaction(firestore, async transaction => {
        if (requireUid() !== account) throw new Error('تغيّر الحساب أثناء الاستعادة.');
        const refs = chunk.map(row => doc(target, String(row.id)));
        const existing = await Promise.all(refs.map(ref => transaction.get(ref)));
        let count = 0;
        existing.forEach((snapshot, index) => {
          if (snapshot.exists()) return;
          transaction.set(refs[index], chunk[index]);
          count++;
        });
        return count;
      });
    }
  }
  return added;
}

/* ─── Wipe everything for the current account ─────────────── */
export async function clearAllUserData() {
  const names = Object.values(COLLECTIONS);
  for (const name of names) {
    const all = await getAllDocs(name);
    await bulkDeleteDocs(name, all.map(r => r.id ?? r.key));
  }
}
