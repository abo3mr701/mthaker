/**
 * firebase.js — تهيئة Firebase (بدون npm — عبر روابط CDN مباشرة كوحدات ES).
 * هذا هو المكان الوحيد اللي فيه إعدادات المشروع (firebaseConfig).
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyBXAhh19a6x3uCNuKpWOoNaq3sDHPMLqZE',
  authDomain:        'mthaker-64a85.firebaseapp.com',
  projectId:         'mthaker-64a85',
  storageBucket:     'mthaker-64a85.firebasestorage.app',
  messagingSenderId: '656768448157',
  appId:             '1:656768448157:web:04b4b6ea3409f26dd68674',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Some networks interrupt the streaming WebChannel used for writes.
  experimentalAutoDetectLongPolling: false,
  experimentalForceLongPolling: true,
});
