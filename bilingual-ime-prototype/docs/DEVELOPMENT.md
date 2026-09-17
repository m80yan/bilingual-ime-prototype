# Bilingual IME Prototype Development Notes

Last updated: 2026-09-17

## 1. Product framing

This project is a Notion-embeddable bilingual Chinese IME demo.

The user writes Simplified Chinese through an in-page pinyin candidate picker. The product simultaneously shows a secondary-language output, currently English or Japanese. The intended experience is not a translation website and not a system IME replacement. It is a web IME embedded in Notion: users should open the page and use it directly without installing anything or depending on their local operating-system input method.

Important constraint:

- Do not rely on macOS IME, Rime, local plist files, system dictionaries, or user-installed resources.
- Everything must run through the web page, bundled project dictionaries, browser storage, and backend APIs.

Current live URL:

- https://bilingual-ime-prototype.vercel.app

## 2. Current technical stack

- Frontend: React + Vite
- Backend API: Vercel serverless functions under `api/`
- Deployment: Vercel production deployment
- Main editor: `src/App.jsx`
- Candidate engine: `src/pinyinEngine.js`
- Styling: `src/styles.css`
- Seed glossary: `src/data/domainGlossarySeed.js`
- CEDICT translation extract: `src/data/cedict-en.json`
- Bundled pinyin dictionary: `src/vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320.ts`
- Regression checks:
  - `npm run test:corpus`
  - `npm run build`
  - `npm run test:sites`
  - `git diff --check`

## 3. Product behavior implemented so far

### Editor behavior

- The primary input is always Simplified Chinese.
- Users type Latin pinyin into the web editor.
- The candidate picker appears near the active caret.
- Committed Chinese text stays in editable text fields.
- English/Japanese secondary output appears below each Chinese line.
- Chinese and secondary line spacing are intentionally tight within one bilingual group.
- Separate bilingual groups have larger spacing.
- Enter without active pinyin creates a new bilingual group.
- Backspace/Delete behavior has been adjusted toward normal text-field behavior.
- Chinese punctuation is supported, including `、` through `/` or `\`.

### Candidate picker

- The picker follows the Figma-like layout.
- Pinyin composition is shown inside the candidate picker.
- The real text area keeps the browser/system caret behavior.
- Candidate pages use fixed previous/next controls.
- The controls remain visible even when disabled.
- Individual candidate widths are responsive enough to avoid unnecessary ellipsis.
- The selected candidate is translated first; full sentence translation is adjusted after commit.

### Bilingual output

- Secondary language can be English or Japanese.
- Header copy currently communicates the core idea as `Write in Chinese + [language]`.
- Full-sentence translation is separated from draft candidate translation.
- Completed sentences can request final translation mode.
- Punctuation-only edits should not unnecessarily reload unchanged translation lines.

## 4. Current dictionary and candidate strategy

The current implementation has four practical dictionary layers:

1. Bundled pinyin dictionary
   - Source file: `src/vendor/web-pinyin-ime/google_pinyin_dict_utf8_55320.ts`
   - Purpose: general Chinese candidate generation.

2. Seed domain glossary
   - Source file: `src/data/domainGlossarySeed.js`
   - Purpose: high-value product demo terms, including design/UIUX, internet slang, history, auto, movie, device, place names.

3. CEDICT extract
   - Source file: `src/data/cedict-en.json`
   - Purpose: English definitions for committed Chinese candidates and proper-name extraction.

4. Browser-side user learning
   - Storage key: `ime:user-dictionary`
   - Purpose: make the web IME smarter in the current browser by recording chosen candidates.

This is not local system capability. It is browser-side product state controlled by the web app.

## 5. P0/P1 work completed

P0/P1 focused on the candidate engine foundation.

Implemented:

- Clearer candidate layers:
  - pinyin index candidates
  - stable prefix candidates
  - dynamic segmentation paths
  - long pinyin composition
- Long lowercase pinyin no longer wastes the 2nd slot with English transliteration when Chinese candidates exist.
- Incomplete pinyin prefixes are filtered out of system dictionary lookup to reduce irrelevant candidates.
- When a domain glossary exact match exists, low-confidence composed noise is suppressed.
- Candidate regression cases were added to `scripts/evaluate-ime-corpus.mjs`.

Verified examples:

- `shengbidebaohaijunbowuguan`
  - `圣彼得堡海军博物馆`
  - `圣彼得堡`
- `chuguoliuxuexuanwenkeshangke`
  - `出国留学`
  - `出国`
- `xingqiudazhanjihua`
  - `星球大战计划`
- `xili`
  - `西历`
  - `西`

Relevant commit:

- `38eaa2b Improve pinyin candidate engine ranking`

## 6. P3 work completed

P3 focused on browser-side user learning.

Implemented:

- Candidate choices are recorded in browser storage by pinyin key.
- Ranking now considers:
  - original candidate order
  - user selection count
  - recent usage
  - current context repetition
  - domain glossary weight
- A `Reset learning` button was added beside the `Glossary` button so test history can be cleared.

Relevant storage:

- `ime:user-dictionary`
- `ime:domain-glossary`

Relevant commit:

- `b4479ad Improve browser learning ranking`

## 7. Translation strategy

Backend translation lives in:

- `api/translate.js`

The translation layer distinguishes:

- draft translation for active candidate/unfinished fragments
- final translation for completed sentence segments

The intent:

- During candidate selection, translate only the selected candidate or relevant fragment.
- After the user commits a full sentence, translate or polish the sentence with context.
- Do not repeatedly reload unchanged lines when earlier lines are edited.

The backend prompt has been tuned toward:

- natural English/Japanese output
- domain terminology
- concise headline-style output where suitable
- better treatment of rhetorical/social-media Chinese
- preserving emotional force where appropriate

Relevant commit:

- `7700173 Improve final translation style rules`

## 8. Glossary and terminology strategy

The project currently supports an editable in-browser glossary panel.

Current seed domains include:

- `design-uiux`
- `internet-slang`
- `history`
- `history-politics`
- `place`
- `auto`
- `ui`
- `movie`
- `device`
- `general`

Example entries:

- `对齐` → `align / sync up`
- `体验走查` → `UX walkthrough`
- `蒙古枷锁` → `the Mongol yoke`
- `星球大战计划` → `the Strategic Defense Initiative`
- `车机系统` → `in-car system`
- `OTA升级` → `OTA update`
- `华为Mate70Pro` → `Huawei Mate 70 Pro`

## 9. Cloud glossary direction

The user has clarified that this is a Notion embed web product. Therefore, “cloud glossary” should not mean importing into a local IME.

The recommended minimal cloud glossary path is:

1. Add a project-hosted glossary endpoint or JSON file.
2. Load it from the web app at startup.
3. Merge it with:
   - browser user learning
   - cloud glossary
   - seed domain glossary
   - bundled pinyin dictionary
4. Give cloud glossary entries high weight, but keep repeated user choices above global defaults.
5. Later replace the static JSON with a backend store if needed.

Fastest MVP option:

- `public/cloud-glossary.json`
- later optional endpoint: `/api/cloud-glossary`

Possible entry format:

```json
{
  "zh": "圣彼得堡海军博物馆",
  "pinyin": "shengbidebaohaijunbowuguan",
  "en": "Naval Museum of Saint Petersburg",
  "ja": "サンクトペテルブルク海軍博物館",
  "domain": "geo-museum",
  "weight": 120,
  "source": "cloud"
}
```

## 10. Automated glossary expansion direction

Fully automatic glossary expansion is risky because bad entries can pollute candidate ranking and translation quality.

The preferred workflow is semi-automatic:

1. Detect gaps:
   - long pinyin with poor candidate quality
   - repeated user selections
   - terms found in test sentences
   - translation terms not present in the glossary
2. Generate candidate glossary entries with AI:
   - Chinese term
   - pinyin
   - English
   - Japanese
   - domain
   - suggested weight
   - reason/source
3. Save to a pending list, not directly to production.
4. Let the user approve, edit, or reject.
5. Publish approved entries into the cloud glossary.

MVP version:

- Export browser learning and missed queries.
- Generate a JSON suggestion list.
- Manually review and commit approved entries.

Implemented first step:

- `POST /api/glossary-suggest`

Request body:

```json
{
  "texts": [
    "这个车机系统太卡了，赶紧 OTA 升级一下吧！",
    "出国留学选文科商科，十年后发现是一场骗局？"
  ],
  "hints": ["车机系统", "OTA升级", "出国留学", "文科商科"],
  "limit": 12
}
```

Response shape:

```json
{
  "suggestions": [
    {
      "zh": "车机系统",
      "pinyin": "chejixitong",
      "en": "in-car system",
      "ja": "車載システム",
      "domain": "auto",
      "weight": 90,
      "reason": "Reusable automotive product term.",
      "source": "auto-suggested",
      "status": "pending",
      "rank": 1
    }
  ]
}
```

This endpoint only generates pending suggestions. It does not write to production glossary data and does not change candidate ranking until a human reviews and publishes the entries.

Later version:

- Connect `/api/glossary-suggest` to a pending glossary review UI.
- Store approved terms in a backend database.

## 11. Recommended next steps

### Immediate next step: lightweight cloud glossary

Do this before a full P4 backend system.

Tasks:

- Add `public/cloud-glossary.json`.
- Load cloud entries in `src/App.jsx`.
- Merge cloud entries with seed/user glossary.
- Ensure cloud entries can provide:
  - Chinese candidates
  - English/Japanese translations
  - ranking weight
- Add regression tests for cloud glossary entries.

### After that: glossary automation MVP

Tasks:

- Add a way to export user learning records.
- Generate pending glossary suggestions from learning records and test sentences.
- Keep approval manual.

### Later: full P4 backend

Only do this when needed.

Possible pieces:

- database-backed cloud glossary
- admin review UI
- multi-user feedback aggregation
- cloud ranking model
- privacy and retention rules

## 12. Deployment workflow

Typical release workflow:

```bash
npm run test:corpus
npm run build
npm run test:sites
git diff --check
git add <changed files>
git commit -m "<message>"
git push origin HEAD:main
vercel deploy . --prod -y
```

Do not curl the deployed URL as a deployment verification step; Vercel deployment output is used for the production link.

## 13. Current production link

- https://bilingual-ime-prototype.vercel.app
