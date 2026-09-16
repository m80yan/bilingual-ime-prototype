# Bilingual IME Demo Product Spec

## Summary

This demo is a Notion-embeddable web page that lets a visitor type Simplified Chinese with an in-page pinyin candidate picker and immediately see a secondary-language translation under the Chinese text. The desired experience is closer to trying Google Input Tools inside a small note editor than using a general translation app.

The product goal is repeated language exposure during ordinary Chinese writing: the user should be able to write a Chinese sentence naturally, then see how that sentence would be expressed in English or Japanese without leaving the page.

## Problem

The current prototype proves the direction, but IME-like behavior has many small edge cases. If those edge cases are not written down, each new fix can accidentally break another part of the typing flow: deletion, punctuation, candidate commit, translation timing, or Notion embed layout stability.

## Goals

- Let a first-time visitor embedded in Notion try Chinese pinyin input without installing anything.
- Keep Chinese writing as the primary action and bilingual exposure as the secondary layer.
- Make candidate choices feel like bilingual subtitles: Chinese first, translation directly below.
- Keep the demo small, fast enough to feel interactive, and visually stable inside an embedded frame.
- Define behavior clearly enough that future agent work can implement and verify one story at a time.

## Non-Goals

- Do not build account login, personal word history, cross-device sync, or cloud dictionaries.
- Do not support English-to-Chinese input mode in this demo.
- Do not replace the operating-system IME outside this web page.
- Do not attempt full native IME parity, such as system-wide hotkeys or app-wide text insertion.
- Do not expose the OpenAI API key or any provider key to the browser.

## Figma

Figma references were provided during earlier implementation for the window structure, controls, drag handle, and visual direction. This spec treats the existing shipped UI as the current visual baseline unless a newer mock is supplied.

## Behavior

1. The page opens directly into the usable note editor. There is no landing page, onboarding panel, or marketing explanation before the typing surface.

2. The prototype renders as one bounded IME window inside a minimum background area of 1112 x 654. The IME window has a minimum width of 800 px and a minimum height of 450 px.

3. The primary language is always Simplified Chinese. It is shown as a non-interactive read-only field, not as a disabled combobox and not as a selectable language menu.

4. The secondary language selector offers only English and Japanese. Changing the secondary language updates candidate translations and the committed text translation to the selected secondary language.

5. Header controls keep fixed margins relative to the closest IME window edge. Resizing the window must not cause the header controls to drift away from their intended edge alignment.

6. The resize handle is the Figma-provided drag-handle affordance. Dragging it resizes the IME window while respecting the minimum size constraints.

7. The note area and input region keep stable vertical positions while the user types. Candidate count, loading translation text, or candidate highlight changes must not push the input field or written text up and down.

8. The user types pinyin into the single text field. While the field contains Latin letters, the candidate picker shows up to five Chinese candidate options.

9. Each candidate option is displayed as a bilingual subtitle pair:
   - First line: Chinese candidate text.
   - Second line: translation in the selected secondary language.

10. Candidate numbering uses 1-5. Pressing a number commits the matching candidate when it exists.

11. Arrow Down moves selection to the next visible candidate. Arrow Up moves selection to the previous visible candidate. Selection wraps around when candidates are visible.

12. Arrow keys do not modify selection state when no candidates are visible.

13. Pressing Space or Enter with visible candidates commits the selected candidate and clears the pinyin query.

14. Clicking a candidate commits that candidate and returns focus to the pinyin field.

15. Committed candidates append to the current Chinese draft sentence. They do not create a new visual line or a separate note item for each word.

16. The written Chinese text and its secondary-language translation are displayed as one bilingual pair: Chinese on the first line, translation directly below.

17. Backspace behaves like a text editor:
   - If the pinyin query contains characters, Backspace edits the query normally.
   - If the pinyin query is empty and the Chinese draft contains text, Backspace deletes the last committed Chinese character or punctuation mark.

18. ASCII punctuation typed while the pinyin query is empty commits Chinese punctuation directly:
   - `.` becomes `。`
   - `,` becomes `，`
   - `?` becomes `？`
   - `!` becomes `！`
   - `;` becomes `；`
   - `:` becomes `：`
   - `(` becomes `（`
   - `)` becomes `）`

19. ASCII punctuation typed while the pinyin query has a selected candidate first commits the selected candidate, then appends the mapped Chinese punctuation, then clears the query.

20. Translation has a fast local path and a slower AI fallback:
   - Known local phrases and dictionary-backed words display immediately.
   - Unknown full sentences can request the translation API.
   - The browser never receives the OpenAI API key.

21. Translation requests are debounced so typing does not call the API for every keystroke. The user should be able to keep typing while translation is pending.

22. When a committed Chinese sentence has a full-sentence translation, the line below the Chinese draft displays that full-sentence translation, not only per-word dictionary glosses.

23. While a sentence translation is unavailable, the UI may show a quiet placeholder such as `...`, but it should not block typing, candidate selection, deletion, or punctuation input.

24. If the translation API fails, the editor remains usable. The Chinese draft stays intact, the pinyin field remains focused or focusable, and the user can keep writing.

25. Candidate translation failures should not hide Chinese candidates. At worst, candidates show a placeholder on the translation line.

26. The page must be usable in a Notion embed. It should not depend on pop-ups, browser extension permissions, local native translation APIs, or cross-origin storage assumptions.

27. The UI should stay visually quiet. Do not add breadcrumbs, line metadata, note status, overflow menus, input eyebrows, or explanatory in-app text unless the user explicitly asks for them.

28. The implementation should keep the demo's existing build and deployment paths intact:
   - `npm run build` must succeed.
   - `npm run test:sites` must succeed.
   - Vercel production deployment should continue to serve the same public URL.

## Open Questions

1. Should the demo start with sample text, or should it open as an empty editor for first-time visitors?
2. Should there be a visible clear/reset control, or should deletion be the only way to remove text?
3. Should full-sentence translation wait until punctuation is committed, or continue updating on every committed word?
4. How much latency is acceptable for AI fallback before the UI should prefer a local-only approximation?
