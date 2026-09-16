# Bilingual IME Demo Stories

These stories translate `PRODUCT.md` into small implementation units. Each story should be completed, verified, committed, and deployed independently when it changes shipped behavior.

## US-001: Stabilize Core Chinese IME Editing

As a Notion embed visitor, I want pinyin candidates to commit into one editable Chinese draft so that I can write a sentence naturally.

Acceptance criteria:

- Pinyin input shows Chinese candidates for Latin-letter queries.
- Pressing `1`-`5` commits the corresponding visible candidate.
- `-` and `=` page through candidate pages when more than five candidates are available.
- Candidate results include a pure-English option for the typed Latin input.
- Pressing Space or Enter commits the selected visible candidate.
- Committed candidates append to one Chinese draft instead of creating one line per word.
- Backspace deletes pinyin query text first, then committed Chinese text when the query is empty.
- ASCII punctuation maps to Chinese punctuation and can be committed into the draft.
- The editor supports native select all, selected-text deletion, cursor movement, line breaks, and one-character deletion for committed Chinese text.
- Pressing Enter without active pinyin creates a new bilingual line group rather than stacking Chinese lines above one shared translation.
- The placeholder says `用英文输入法打出拼音...`.
- `npm run build` passes.
- `npm run test:sites` passes.
- Verify in browser on the local preview and the production URL after deployment.

## US-002: Make Candidate Rows Feel Like Bilingual Subtitles

As a language learner, I want every candidate to show Chinese with its English or Japanese translation directly below so that choosing words exposes me to the secondary language.

Acceptance criteria:

- Candidate row first line is Chinese candidate text.
- Candidate row second line is the selected secondary-language translation.
- Candidate highlight, hover, and numeric selection do not change row height.
- Candidate count changes do not move the note area or input field.
- Translation placeholder appears only on the secondary line and does not hide the Chinese candidate.
- Verify in browser.

## US-003: Improve Full-Sentence Translation Feedback

As a user writing Chinese, I want the committed sentence translation to update as a natural whole sentence so that I can learn how my sentence would be expressed in English or Japanese.

Acceptance criteria:

- Local phrase translations display immediately when available.
- Unknown committed sentences request `/api/translate` through the server.
- The browser never exposes provider API keys.
- API response updates the committed sentence translation below the Chinese line.
- Every committed Chinese modification shows a long square-ended horizontal shimmer before the latest secondary-language translation appears.
- The latest secondary-language translation appears with a decode-style typing reveal.
- A settled bilingual line does not replay the typing reveal when the user edits later lines.
- A sentence segment ending in Chinese sentence-final punctuation does not replay the typing reveal when the user continues typing later text on the same line.
- Failed API responses leave the Chinese draft intact and keep typing usable.
- Translation requests are debounced and do not fire for every keystroke.
- Verify with at least one unknown full sentence on production.

## US-004: Preserve Notion Embed Layout

As a page visitor, I want the embedded demo to stay visually stable while I type so that it feels like a polished tool rather than a shifting mockup.

Acceptance criteria:

- Background minimum is 1112 x 654.
- IME window minimum width is 800 px.
- IME window minimum height is 450 px.
- Header controls keep fixed edge-relative margins while resizing.
- Drag handle resizes the window and respects minimum size.
- Note area, input field, and candidate picker do not jump vertically during typing.
- Verify in browser at normal and narrow viewport widths.

## US-005: Define Failure And Loading States

As a user, I want typing to remain responsive even when translation is slow or unavailable so that the demo is still usable.

Acceptance criteria:

- Pending translation does not block candidate selection, punctuation, deletion, or further typing.
- Failed translation calls do not clear the draft or query.
- Candidate Chinese text remains visible even when candidate translation is unavailable.
- Sentence translation placeholder is quiet and does not read like an error.
- API errors are logged server-side without exposing provider details in the UI.
- Verify by simulating or observing a failed `/api/translate` response.

## US-006: Decide First-Run Draft State

As a first-time visitor, I want the initial editor state to make the demo understandable without getting in the way of typing.

Acceptance criteria:

- Decide whether the editor starts with sample text or an empty draft.
- If sample text remains, Backspace and continued typing work naturally from that state.
- If empty state is chosen, the translation line does not show a misleading placeholder before text exists.
- Product decision is reflected in `PRODUCT.md`.
- Verify in browser.
