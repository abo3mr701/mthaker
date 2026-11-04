# Vocabulary sources and licenses

This is a locally bundled, community-compiled learning dictionary for the Oxford 5000 word list. It is not an official Oxford dictionary product or an endorsement by Oxford University Press. Definitions, Arabic translations and examples are from the separate sources below, not presented as Oxford-authored definitions or examples.

## Headwords, parts of speech and levels

- Oxford's explanation and original lists: https://www.oxfordlearnersdictionaries.com/about/wordlists/oxford3000-5000
- Machine-readable factual word/part-of-speech/CEFR snapshot: https://gist.github.com/naiyerasif/95f65ac734b55ecfb4b1f4e2a7c42c25
- The snapshot has 5,948 word/type rows, merged into **4,958 unique headwords**, rather than padding the named "5000" list with unrelated words. Multiple parts of speech are retained in each entry.
- For a headword with multiple classified senses, the displayed level is the earliest level. Four supplemental headwords (`accounting`, `angrily`, `cleaning`, `feeding`) have no CEFR value in that snapshot; their B1 grouping is taken from Kotoba's Oxford lesson data, not asserted to be an independently verified official Oxford level.
- Stable existing word IDs from the project's earlier 405-word dataset are retained where the headwords match. User-added words and all SRS records remain separate.

## Arabic translations and English definitions

**GitHub Vocabulary**, tema4p:

- Repository: https://github.com/tema4p/english-vocabulary
- Source revision: `ec22fb574cedddc9d8908c1f55a33da40c288670`
- Files: `content/vocabulary/Oxford_5000_English_Vocabulary_AR.txt` and `Oxford_5000_English_Vocabulary_EN.txt`.
- License: **Creative Commons Attribution-NonCommercial 4.0 International**: https://creativecommons.org/licenses/by-nc/4.0/
- License text and attribution requirements: https://github.com/tema4p/english-vocabulary/blob/main/LICENSE-CONTENT.md
- Modified: yes. Matched to the headword list, reformatted into structured records, deduplicated, and supplemented for missing entries. Some definitions and translations instead come from the user's existing project data.
- The content covered by this license is for noncommercial use. It does not change the license of independently authored application code. A future commercial distribution needs a compatible replacement or permission for the affected content.

## Example sentences

### Tatoeba contributors

- Download information: https://tatoeba.org/en/downloads
- Snapshot: English sentence and detailed-sentence exports dated 2026-10-31.
- Standard sentence license: **CC BY 2.0 France**: https://creativecommons.org/licenses/by/2.0/fr/
- A subset is **CC0 1.0**: https://creativecommons.org/publicdomain/zero/1.0/
- Each reused sentence retains its ID, contributor name and CC0 status in `exampleCredits`. The application displays an attribution link next to the example, linking to `https://tatoeba.org/en/sentences/show/<id>` with its contributor and license.
- Sentences were selected, not generated from generic templates. Sentence text is unchanged; surrounding presentation and grouping have been adapted. These are general usage examples, not guaranteed to be academic examples, idioms, or a single disambiguated dictionary sense.

### Kotoba / Nexo

- Repository: https://github.com/codegeasse1/kotoba-learn
- Files: `app/src/main/java/com/nexo/kotoba/Examples.kt` (explicit curated examples only; template fallback logic is not used) and `Oxford.kt` (the four supplemental B1 classifications above).
- Copyright (c) 2026 Nexo. **MIT License**, retained in `licenses/kotoba-MIT.txt`.
- Modified: selected and reformatted. Not all entries from this source are used.

### Existing project and new supplementary examples

- Earlier project data: `js/data/oxfordWords.js` at project revision `8dd9c412b63852376e95125d02bbaccedb2a5d5e`. Existing matching IDs, content and example sentences are reused.
- Missing short definitions, translations and 35 additional example sentences were authored for this integration. The source completeness checks ensure that every bundled word has an Arabic translation, an English definition and three example sentences. This is a structural and sampled quality review, not an independent expert review of every sense or example.

## Runtime behavior

- Vocabulary is bundled in `js/data/oxford/`; browsing, choosing words and ordinary review do not call Gemini.
- The English section loads the dictionary on demand. Catalog results are paginated.
- Choosing 10 or 20 words adds only those SRS records; it does not upload the whole dictionary into each account.
- Existing custom entries, dates, ease factors and review histories are not reset by the import.
