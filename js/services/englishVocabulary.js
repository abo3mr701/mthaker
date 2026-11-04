export function normalizeWord(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
}

export function activeWordKeys(words, cards) {
  return new Set(words.filter(word => cards[word.id]).map(word => normalizeWord(word.word)));
}

/** Preserve custom IDs and all saved SRS cards; fill only missing word content. */
export function mergeVocabulary(builtins, customWords, cards = {}) {
  const byName = new Map(builtins.map(word => [normalizeWord(word.word), word]));
  const customNames = new Set(customWords.map(word => normalizeWord(word.word)));
  const merged = builtins.filter(word => !customNames.has(normalizeWord(word.word)) || cards[word.id]);
  for (const custom of customWords) {
    const builtin = byName.get(normalizeWord(custom.word));
    if (!builtin) { merged.push(custom); continue; }
    const filled = { ...builtin, ...custom };
    for (const key of ['ar', 'definition', 'pos']) {
      if (!String(custom[key] || '').trim()) filled[key] = builtin[key];
    }
    filled.examples = { ...builtin.examples };
    filled.exampleCredits = [...(builtin.exampleCredits || [])];
    ['daily', 'academic', 'idiom'].forEach((key, i) => {
      if (custom.examples?.[key]?.trim()) {
        filled.examples[key] = custom.examples[key];
        filled.exampleCredits[i] = null;
      }
    });
    merged.push(filled);
  }
  return merged;
}

export function filterVocabulary(words, { query = '', level = 'all', newOnly = false, cards = {} } = {}) {
  const term = normalizeWord(query);
  const active = activeWordKeys(words, cards);
  return words.filter(word =>
    (level === 'all' || word.level === level) &&
    (!term || normalizeWord(word.word).includes(term) || normalizeWord(word.ar).includes(term)) &&
    (!newOnly || (!cards[word.id] && !active.has(normalizeWord(word.word)))));
}

/** Round-robin shuffled CEFR buckets: mixed levels when available, no active or duplicate headwords. */
export function selectNewVocabulary(words, cards, count, random = Math.random) {
  const shuffle = values => {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const active = activeWordKeys(words, cards), seen = new Set(), buckets = new Map();
  for (const word of words) {
    const key = normalizeWord(word.word);
    if (cards[word.id] || active.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (!buckets.has(word.level)) buckets.set(word.level, []);
    buckets.get(word.level).push(word);
  }
  const groups = shuffle([...buckets.values()].map(shuffle));
  const selected = [];
  while (selected.length < count && groups.some(group => group.length)) {
    for (const group of groups) {
      if (group.length) selected.push(group.pop());
      if (selected.length >= count) break;
    }
  }
  return selected;
}
