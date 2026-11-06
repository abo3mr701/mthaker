import { auth } from './firebase.js';

const SDK_URL = 'https://js.puter.com/v2/';
const MODEL = 'gpt-5.4-nano';
const LINK_PREFIX = 'mthaker.puter.';
let sdkLoad;
let pendingConnection;

const linkKey = uid => LINK_PREFIX + uid;
const owner = () => auth.currentUser?.uid;

export function loadPuter() {
  if (globalThis.puter?.auth && globalThis.puter?.ai) return Promise.resolve(globalThis.puter);
  if (sdkLoad) return sdkLoad;

  sdkLoad = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      reject(new Error('تعذّر تحميل المساعد الذكي. تحقق من اتصالك وحاول مرة أخرى.'));
    }
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      if (!globalThis.puter?.auth || !globalThis.puter?.ai) return fail();
      clearTimeout(timer);
      resolve(globalThis.puter);
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => {
    sdkLoad = undefined;
    throw error;
  });
  return sdkLoad;
}

export async function hasPuterConnection() {
  const uid = owner();
  const linkedId = uid && localStorage.getItem(linkKey(uid));
  if (!linkedId || pendingConnection) return false;

  const sdk = await loadPuter();
  if (!sdk.auth.isSignedIn()) return false;
  const user = await sdk.auth.getUser();
  return owner() === uid && user?.uuid === linkedId &&
    localStorage.getItem(linkKey(uid)) === linkedId && !pendingConnection;
}

// Call directly from the button click so the browser allows the sign-in popup.
export function connectPuter() {
  if (pendingConnection) return pendingConnection;
  const sdk = globalThis.puter;
  const uid = owner();
  if (!uid || !sdk?.auth) return Promise.reject(new Error('أعد فتح صفحة المساعد الذكي وحاول مرة أخرى.'));

  pendingConnection = (async () => {
    try {
      await sdk.auth.signIn({ request_auth: true, attempt_temp_user_creation: false });
      const user = await sdk.auth.getUser();
      if (owner() !== uid || !user?.uuid) throw new Error();
      localStorage.setItem(linkKey(uid), user.uuid);
    } catch (error) {
      const code = error?.error ?? error?.code;
      if (code === 'popup_blocked') throw new Error('اسمح بالنوافذ المنبثقة لمذاكر ثم اضغط ربط الحساب مرة أخرى.');
      if (code === 'auth_window_closed') throw new Error('أُغلقت نافذة الربط. تقدر تحاول مرة أخرى.');
      throw new Error('تعذّر ربط حساب Puter. حاول مرة أخرى.');
    }
  })().finally(() => { pendingConnection = undefined; });
  return pendingConnection;
}

export async function disconnectPuter() {
  const uid = owner();
  if (!uid) return;
  const connected = await hasPuterConnection().catch(() => false);
  if (owner() !== uid) return;
  localStorage.removeItem(linkKey(uid));
  if (connected) globalThis.puter.auth.signOut();
}

export async function requirePuterConnection() {
  if (await hasPuterConnection().catch(() => false)) return;
  throw new Error('افتح صفحة «المساعد الذكي» واربط حساب Puter لاستخدام هذه الميزة.');
}

export async function generatePuterContent(messages, { maxTokens = 4096 } = {}) {
  const uid = owner();
  await requirePuterConnection();

  try {
    const result = await globalThis.puter.ai.chat(messages, {
      model: MODEL,
      max_tokens: maxTokens,
      normalize: true,
      signal: AbortSignal.timeout(60000),
    });
    if (owner() !== uid) throw new Error();
    const content = result?.message?.content;
    const text = Array.isArray(content) ? content.map(part => part.text || '').join('') : content;
    if (typeof text === 'string' && text.trim()) return text;
  } catch (error) {
    const code = error?.error?.code ?? error?.error ?? error?.code;
    if (code === 'insufficient_funds' || code === 'subscription_required' || error?.status === 402) {
      throw new Error('حسابك في Puter ما عنده رصيد كافٍ. راجع رصيدك في Puter ثم حاول مرة أخرى.');
    }
    if (code === 'too_many_requests' || error?.status === 429) {
      throw new Error('وصل حسابك إلى حد الطلبات في Puter. انتظر قليلًا وحاول مرة أخرى.');
    }
    if (error?.name === 'TimeoutError') throw new Error('انتهت مهلة المساعد. حاول مرة أخرى.');
    throw new Error('تعذّر إكمال الطلب عبر Puter. تحقق من الاتصال أو أعد ربط حسابك من صفحة المساعد.');
  }

  throw new Error('ما وصل رد من المساعد الذكي. جرّب إعادة صياغة طلبك.');
}
