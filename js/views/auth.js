/**
 * auth.js — شاشة تسجيل الدخول/إنشاء حساب (إيميل، جوجل، جوال).
 * لا تستخدم نظام الراوتر العادي — تُعرض مباشرة داخل #auth-screen قبل دخول التطبيق.
 */

import {
  signUpWithEmail, signInWithEmail, signInWithGoogle,
  sendPhoneCode, confirmPhoneCode, resetPassword,
} from '../services/authService.js';
import { showToast } from '../utils/helpers.js';

let _mode = 'login'; // 'login' | 'signup'
let _confirmationResult = null;

export function renderAuthScreen(container) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <span class="brand-glyph">م</span>
        <span class="auth-brand-name">مذاكر</span>
      </div>
      <p class="auth-tagline">سجّل دخولك عشان بياناتك تتزامن على كل أجهزتك</p>

      <div class="auth-tabs">
        <button class="auth-tab ${_mode === 'login' ? 'active' : ''}" data-mode="login">تسجيل الدخول</button>
        <button class="auth-tab ${_mode === 'signup' ? 'active' : ''}" data-mode="signup">إنشاء حساب</button>
      </div>

      <div id="auth-error" class="auth-error hidden"></div>

      <form id="auth-email-form" class="auth-form">
        ${_mode === 'signup' ? `
        <div class="form-group">
          <label class="form-label">الاسم</label>
          <input type="text" class="form-input" id="auth-name" dir="auto" autocomplete="name">
        </div>` : ''}
        <div class="form-group">
          <label class="form-label">الإيميل</label>
          <input type="email" class="form-input" id="auth-email" dir="ltr" autocomplete="email" required>
        </div>
        <div class="form-group">
          <label class="form-label">كلمة المرور</label>
          <input type="password" class="form-input" id="auth-password" dir="ltr" autocomplete="${_mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="6">
        </div>
        ${_mode === 'login' ? `<button type="button" class="auth-link-btn" id="auth-forgot">نسيت كلمة المرور؟</button>` : ''}
        <button type="submit" class="btn btn-primary w-full" id="auth-email-submit">
          ${_mode === 'signup' ? '✅ إنشاء حساب' : '🔑 تسجيل الدخول'}
        </button>
      </form>

      <div class="auth-divider"><span>أو</span></div>

      <button class="btn btn-secondary w-full" id="auth-google-btn">
        <svg width="18" height="18" viewBox="0 0 18 18" style="margin-inline-end:8px;vertical-align:-3px;">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
        </svg>
        الدخول بحساب جوجل
      </button>

      <div class="auth-divider"><span>أو بالجوال</span></div>

      <div id="auth-phone-step-number" class="auth-form">
        <div class="form-group">
          <label class="form-label">رقم الجوال (مع رمز الدولة)</label>
          <input type="tel" class="form-input" id="auth-phone" dir="ltr" placeholder="+9665xxxxxxxx">
        </div>
        <button class="btn btn-secondary w-full" id="auth-send-code-btn">📱 إرسال رمز التحقق</button>
      </div>

      <div id="auth-phone-step-code" class="auth-form hidden">
        <div class="form-group">
          <label class="form-label">رمز التحقق (SMS)</label>
          <input type="text" class="form-input" id="auth-code" dir="ltr" inputmode="numeric" placeholder="123456">
        </div>
        <button class="btn btn-primary w-full" id="auth-confirm-code-btn">✅ تأكيد الرمز</button>
        <button type="button" class="auth-link-btn" id="auth-change-number">تغيير الرقم</button>
      </div>

      <div id="recaptcha-container"></div>
    </div>
  `;

  bindEvents(container);
}

function showError(container, message) {
  const el = container.querySelector('#auth-error');
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearError(container) {
  container.querySelector('#auth-error')?.classList.add('hidden');
}

function bindEvents(container) {
  container.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _mode = btn.dataset.mode;
      renderAuthScreen(container);
    });
  });

  container.querySelector('#auth-email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(container);
    const email    = container.querySelector('#auth-email').value.trim();
    const password = container.querySelector('#auth-password').value;
    const submitBtn = container.querySelector('#auth-email-submit');
    submitBtn.disabled = true;
    try {
      if (_mode === 'signup') {
        const name = container.querySelector('#auth-name')?.value.trim();
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      // النجاح يُكمَل تلقائياً عبر مراقب حالة الدخول بـ app.js
    } catch (err) {
      showError(container, err.message);
      submitBtn.disabled = false;
    }
  });

  container.querySelector('#auth-forgot')?.addEventListener('click', async () => {
    const email = container.querySelector('#auth-email').value.trim();
    if (!email) { showError(container, 'اكتب إيميلك أولاً في الحقل فوق.'); return; }
    try {
      await resetPassword(email);
      showToast('تم إرسال رابط إعادة تعيين كلمة المرور إلى إيميلك', 'success', 6000);
    } catch (err) {
      showError(container, err.message);
    }
  });

  container.querySelector('#auth-google-btn').addEventListener('click', async (e) => {
    clearError(container);
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      showError(container, err.message);
      btn.disabled = false;
    }
  });

  container.querySelector('#auth-send-code-btn').addEventListener('click', async () => {
    clearError(container);
    const phone = container.querySelector('#auth-phone').value.trim();
    if (!phone) { showError(container, 'اكتب رقم جوالك أولاً.'); return; }
    const btn = container.querySelector('#auth-send-code-btn');
    btn.disabled = true; const original = btn.textContent; btn.textContent = '⏳ جاري الإرسال…';
    try {
      _confirmationResult = await sendPhoneCode(phone, 'recaptcha-container');
      container.querySelector('#auth-phone-step-number').classList.add('hidden');
      container.querySelector('#auth-phone-step-code').classList.remove('hidden');
      showToast('تم إرسال رمز التحقق برسالة SMS', 'success');
    } catch (err) {
      showError(container, err.message);
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  container.querySelector('#auth-confirm-code-btn').addEventListener('click', async () => {
    clearError(container);
    const code = container.querySelector('#auth-code').value.trim();
    if (!code) { showError(container, 'اكتب رمز التحقق.'); return; }
    const btn = container.querySelector('#auth-confirm-code-btn');
    btn.disabled = true;
    try {
      await confirmPhoneCode(_confirmationResult, code);
      // النجاح يُكمَل تلقائياً عبر مراقب حالة الدخول
    } catch (err) {
      showError(container, err.message);
      btn.disabled = false;
    }
  });

  container.querySelector('#auth-change-number').addEventListener('click', () => {
    _confirmationResult = null;
    container.querySelector('#auth-phone-step-code').classList.add('hidden');
    container.querySelector('#auth-phone-step-number').classList.remove('hidden');
  });
}
