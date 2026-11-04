import { filterVocabulary, selectNewVocabulary, activeWordKeys, normalizeWord } from '../services/englishVocabulary.js';
import { escHtml, showToast } from '../utils/helpers.js';

const PAGE_SIZE = 40;
const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

export function renderEnglishCatalog(el, { words, cards, onAdd }) {
  let query = '', level = 'all', newOnly = false, page = 0, busy = false;
  const selected = new Set();
  el.innerHTML = `
    <div class="page-hd">
      <div class="page-hd-text"><h2>معجم Oxford 5000</h2>
        <p>اختر كلماتك أو أضف دفعة منوعة. الإضافة تبدأ تعلّم الكلمات؛ تصفّح المعجم لا يغيّر مراجعاتك.</p>
      </div>
    </div>
    <div class="eng-catalog-controls">
      <label>بحث بالكلمة أو الترجمة
        <input class="form-input" id="catalog-search" type="search" placeholder="مثال: travel أو سفر" dir="auto">
      </label>
      <label>المستوى
        <select class="form-input" id="catalog-level">
          <option value="all">كل المستويات — دفعة منوعة</option>
          ${LEVELS.map(item => `<option value="${item}">${item}</option>`).join('')}
        </select>
      </label>
      <label class="eng-catalog-new"><input id="catalog-new" type="checkbox"> الجديدة فقط</label>
    </div>
    <div class="eng-catalog-actions">
      <button class="btn btn-secondary" id="catalog-add-10">➕ 10 كلمات منوعة</button>
      <button class="btn btn-secondary" id="catalog-add-20">➕ 20 كلمة منوعة</button>
      <button class="btn btn-primary" id="catalog-add-selected" disabled>إضافة المحدد (0)</button>
      <button class="btn btn-ghost btn-sm" id="catalog-select-page">تحديد كلمات الصفحة الجديدة</button>
    </div>
    <p id="catalog-summary" class="text-muted text-sm" role="status"></p>
    <div id="catalog-grid" class="grid-2 eng-catalog-grid"></div>
    <div class="eng-catalog-pages">
      <button class="btn btn-secondary btn-sm" id="catalog-prev">السابق</button>
      <span id="catalog-page" aria-live="polite"></span>
      <button class="btn btn-secondary btn-sm" id="catalog-next">التالي</button>
    </div>
    <p class="text-muted text-xs eng-catalog-sources">
      ترجمة وتعريف: <a href="https://github.com/tema4p/english-vocabulary" target="_blank" rel="noopener">GitHub Vocabulary</a>
      — <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener">CC BY-NC 4.0</a>.
      الأمثلة من Tatoeba وKotoba ومحتوى مذاكر؛ أُعيد التنسيق والدمج.
      <a href="https://github.com/abo3mr701/mthaker/blob/main/VOCABULARY-SOURCES.md" target="_blank" rel="noopener">المصادر والتراخيص</a>.
    </p>`;

  const node = id => el.querySelector('#catalog-' + id);
  const results = () => filterVocabulary(words, { query, level, newOnly, cards });
  const currentPage = () => results().slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function updateSelection() {
    node('add-selected').textContent = `إضافة المحدد (${selected.size})`;
    node('add-selected').disabled = busy || !selected.size;
  }

  function paintResults() {
    const filtered = results(), pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const active = activeWordKeys(words, cards);
    node('grid').innerHTML = filtered.length ? currentPage().map(word => {
      const started = !!cards[word.id] || active.has(normalizeWord(word.word));
      return `<article class="card eng-catalog-item">
        <div class="eng-catalog-word">
          <h3 dir="ltr">${escHtml(word.word)}</h3>
          <span class="stage-badge level-badge level-${word.level.toLowerCase()}">${escHtml(word.level)}</span>
        </div>
        <p class="text-muted text-xs" dir="ltr">${escHtml(word.pos)}</p>
        <p>${escHtml(word.ar)}</p>
        <details><summary>التعريف والأمثلة</summary>
          <p dir="ltr">${escHtml(word.definition)}</p>
          ${['daily', 'academic', 'idiom'].map((key, i) => `<p dir="ltr">${escHtml(word.examples?.[key] || '')}${creditHtml(word.exampleCredits?.[i])}</p>`).join('')}
        </details>
        ${started ? '<span class="category-badge">ضمن مفرداتي</span>' : `<label class="eng-catalog-pick"><input type="checkbox" data-pick="${escHtml(word.id)}" ${selected.has(word.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}> اختر هذه الكلمة</label>`}
      </article>`;
    }).join('') : '<p class="text-muted">لا توجد كلمات مطابقة.</p>';
    node('summary').textContent = `${filtered.length} كلمة مطابقة من ${words.length} — الدفعات تُختار من نتائج البحث والمستوى الحالي، ومن الكلمات الجديدة فقط.`;
    node('page').textContent = `صفحة ${page + 1} من ${pages}`;
    node('prev').disabled = busy || page === 0;
    node('next').disabled = busy || page >= pages - 1;
    ['add-10', 'add-20', 'select-page', 'search', 'level', 'new'].forEach(id => { node(id).disabled = busy; });
    updateSelection();
    node('grid').querySelectorAll('[data-pick]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) selected.add(checkbox.dataset.pick);
        else selected.delete(checkbox.dataset.pick);
        updateSelection();
      });
    });
  }

  async function add(chosen) {
    if (busy) return;
    if (!chosen.length) { showToast('لا توجد كلمات جديدة مطابقة لإضافتها', 'info'); return; }
    busy = true;
    paintResults();
    try {
      const added = await onAdd(chosen);
      chosen.forEach(word => selected.delete(word.id));
      showToast(`تمت إضافة ${added} كلمة إلى مفرداتك وكلمات اليوم`, 'success');
    } catch {
      showToast('تعذّر إكمال الإضافة. الكلمات التي حُفظت ستبقى في مفرداتك؛ أعد المحاولة للباقي.', 'error');
    } finally {
      busy = false;
      paintResults();
    }
  }

  node('search').addEventListener('input', event => { query = event.target.value.trim(); page = 0; paintResults(); });
  node('level').addEventListener('change', event => { level = event.target.value; page = 0; paintResults(); });
  node('new').addEventListener('change', event => { newOnly = event.target.checked; page = 0; paintResults(); });
  node('prev').addEventListener('click', () => { if (page > 0) { page--; paintResults(); } });
  node('next').addEventListener('click', () => { page++; paintResults(); });
  node('select-page').addEventListener('click', () => {
    filterVocabulary(currentPage(), { newOnly: true, cards }).forEach(word => selected.add(word.id));
    paintResults();
  });
  node('add-selected').addEventListener('click', () => add(filterVocabulary(words.filter(word => selected.has(word.id)), { newOnly: true, cards })));
  node('add-10').addEventListener('click', () => add(selectNewVocabulary(results(), cards, 10)));
  node('add-20').addEventListener('click', () => add(selectNewVocabulary(results(), cards, 20)));
  paintResults();
}

export function creditHtml(credit) {
  if (!credit) return '';
  return ` <a class="eng-example-credit" href="https://tatoeba.org/en/sentences/show/${encodeURIComponent(credit[0])}" target="_blank" rel="noopener">Tatoeba · ${escHtml(credit[1])} · ${credit[2] ? 'CC0' : 'CC BY 2.0 FR'}</a>`;
}
