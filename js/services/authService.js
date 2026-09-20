/**
 * authService.js — كل عمليات تسجيل الدخول/الخروج (إيميل، جوجل، جوال).
 */

import { auth } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  sendPasswordResetEmail,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';

/* ─── Arabic error messages for the common Firebase Auth error codes ── */
const ERROR_MESSAGES = {
  'auth/email-already-in-use':      'هذا الإيميل مسجّل مسبقاً — جرّب تسجيل الدخول بدل إنشاء حساب.',
  'auth/invalid-email':             'صيغة الإيميل غير صحيحة.',
  'auth/weak-password':             'كلمة المرور ضعيفة — لازم تكون 6 أحرف على الأقل.',
  'auth/user-not-found':            'ما فيه حساب بهذا الإيميل.',
  'auth/wrong-password':            'كلمة المرور غير صحيحة.',
  'auth/invalid-credential':        'بيانات الدخول غير صحيحة.',
  'auth/too-many-requests':         'محاولات كثيرة متتالية — انتظر شوي وحاول مرة ثانية.',
  'auth/popup-closed-by-user':      'تم إغلاق نافذة تسجيل الدخول بجوجل قبل إكمال العملية.',
  'auth/invalid-phone-number':      'رقم الجوال غير صحيح — تأكد من كتابته مع رمز الدولة (مثال: +9665xxxxxxxx).',
  'auth/invalid-verification-code': 'رمز التحقق غير صحيح.',
  'auth/code-expired':              'انتهت صلاحية رمز التحقق — أرسل رمزاً جديداً.',
  'auth/network-request-failed':    'تعذّر الاتصال بالخادم — تحقق من اتصالك بالإنترنت.',
};

function friendlyError(err) {
  return ERROR_MESSAGES[err.code] || err.message || 'حدث خطأ غير متوقع.';
}

/* ─── Email / password ────────────────────────────────────── */
export async function signUpWithEmail(email, password, displayName) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function signInWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/* ─── Google ──────────────────────────────────────────────── */
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/* ─── Phone (reCAPTCHA + رمز SMS) ─────────────────────────── */
let _recaptchaVerifier = null;

// containerId: عنصر DOM فاضي (مثلاً <div id="recaptcha-container">) يُركّب عليه الـreCAPTCHA
export function ensureRecaptcha(containerId) {
  if (_recaptchaVerifier) return _recaptchaVerifier;
  _recaptchaVerifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  return _recaptchaVerifier;
}

// يرجع confirmationResult — خزّنه واستخدمه مع confirmPhoneCode(code)
export async function sendPhoneCode(phoneNumber, containerId) {
  try {
    const verifier = ensureRecaptcha(containerId);
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  } catch (err) {
    // إعادة تعيين الـrecaptcha عند الفشل حتى تنجح المحاولة القادمة
    _recaptchaVerifier?.clear?.();
    _recaptchaVerifier = null;
    throw new Error(friendlyError(err));
  }
}

export async function confirmPhoneCode(confirmationResult, code) {
  try {
    const cred = await confirmationResult.confirm(code);
    return cred.user;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/* ─── Sign out / state ───────────────────────────────────── */
export function signOutUser() {
  return signOut(auth);
}

export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}
