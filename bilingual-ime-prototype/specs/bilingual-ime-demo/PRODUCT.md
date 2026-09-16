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

8. The user types pinyin into the editor with an English keyboard/input method. The placeholder must explicitly say `用英文输入法打出拼音...` because non-English system IMEs can cover or interfere with the web candidate picker.

9. The Chinese editor behaves like a general text field for committed text. The user can select all, delete selections, move the cursor with arrow keys, insert line breaks, and delete one character at a time using normal browser text-editing behavior.

10. While the user is composing pinyin, the pinyin composition text appears after the current Chinese text rather than in a separate permanent field.

10a. The candidate engine should support common pinyin shortcuts where practical, including first-letter abbreviation candidates and selected long mixed full-pinyin/initial patterns. For example, `szm` may surface `首字母`, and `jin t wo xiang shuo yi jian shi` may surface `今天我想说一件事`.

11. While the editor contains Latin-letter pinyin composition, the candidate picker shows up to seven Chinese candidate options.

12. Each candidate option is displayed as a bilingual subtitle pair:
   - First line: Chinese candidate text.
   - Second line: translation in the selected secondary language.

13. Candidate numbering uses 1-5. Pressing a number commits the matching candidate when it exists.

14. Arrow Down moves selection to the next visible candidate. Arrow Up moves selection to the previous visible candidate. Selection wraps around when candidates are visible. When more than five candidates exist, `-` moves to the previous candidate page and `=` moves to the next candidate page.

14a. The candidate list includes a pure-English option for the active Latin input so the user can intentionally commit English text without switching out of the web IME. A standalone English candidate is title-cased, for example `pisa` may offer `Pizza`; in ordinary English prose, `pizza` is lowercase unless it begins a sentence or is part of a proper name.

15. Arrow keys do not modify selection state when no candidates are visible and instead preserve ordinary text-field cursor movement.

16. Pressing Space or Enter with visible candidates commits the selected candidate and clears the pinyin query. When no pinyin query is active, Enter creates a new bilingual line group: a new Chinese editing line with its own secondary-language line below it.

17. Clicking a candidate commits that candidate and returns focus to the editor.

18. Committed candidates insert at the current cursor or replace the current selection in the active Chinese line. They do not create a new visual line or a separate note item for each word unless the user explicitly creates a new bilingual line group.

19. Each written Chinese sentence or line is displayed as one bilingual pair: Chinese on the first line, translation directly below. Multiple Chinese lines must not stack above a single shared translation line. Chinese and secondary-language text inside the same bilingual group stay close together with no added group gap. Separate bilingual groups, including groups created by Enter, use a fixed 28 px visual gap and must not be stretched by unused editor height.

20. Backspace behaves like a text editor:
   - If the pinyin query contains characters, Backspace edits the query normally.
   - If the pinyin query is empty, Backspace follows native text-field behavior: delete selected text or delete the character before the cursor.

21. ASCII punctuation typed while the pinyin query is empty commits Chinese punctuation directly:
   - `.` becomes `。`
   - `,` becomes `，`
   - `?` becomes `？`
   - `!` becomes `！`
   - `;` becomes `；`
   - `:` becomes `：`
   - `(` becomes `（`
   - `)` becomes `）`

22. ASCII punctuation typed while the pinyin query has a selected candidate first commits the selected candidate, then appends the mapped Chinese punctuation, then clears the query.

23. Translation has a fast local path and a slower AI fallback:
   - Known local phrases and dictionary-backed words display immediately.
   - Unknown full sentences can request the translation API.
   - The browser never receives the OpenAI API key.

24. Translation requests are debounced so typing does not call the API for every keystroke. The user should be able to keep typing while translation is pending.

25. Every committed Chinese modification first shows a long horizontal shimmer in the secondary-language line, then replaces the shimmer with the latest translation once it is available. The shimmer is rectangular with square ends, not a pill.

25a. When the latest translation appears, the secondary-language text uses a typing reveal. The newest currently-typing character uses the same blue as the editor caret, `#5193FB`, then fades into normal black text as later characters appear.

25b. Once a Chinese sentence segment ends with sentence-final punctuation such as `。`, `！`, or `？`, the matching secondary-language segment is considered settled even if the user continues typing on the same line. Later text after that punctuation must shimmer/reveal independently without replaying the settled segment, unless the settled Chinese segment itself is edited.

25c. Reflowing existing bilingual groups, including inserting a new group before them with Enter, must not replay loading or typing for unchanged later groups. Loading/reveal is triggered by Chinese content changes, not by a line index change.

26. When a committed Chinese sentence has a full-sentence translation, the line below the Chinese draft displays that full-sentence translation, not only per-word dictionary glosses.

27. While a sentence translation is unavailable, the UI may show a quiet placeholder such as `...`, but it should not block typing, candidate selection, deletion, punctuation input, selection, cursor movement, or line breaks.

28. If the translation API fails, the editor remains usable. The Chinese draft stays intact, the editor remains focused or focusable, and the user can keep writing.

29. Candidate translation failures should not hide Chinese candidates. At worst, candidates show a placeholder on the translation line.

30. The page must be usable in a Notion embed. It should not depend on pop-ups, browser extension permissions, local native translation APIs, or cross-origin storage assumptions.

31. The UI should stay visually quiet. Do not add breadcrumbs, line metadata, note status, overflow menus, input eyebrows, or explanatory in-app text unless the user explicitly asks for them.

32. The implementation should keep the demo's existing build and deployment paths intact:
   - `npm run build` must succeed.
   - `npm run test:sites` must succeed.
   - Vercel production deployment should continue to serve the same public URL.

## Open Questions

1. Should the demo start with sample text, or should it open as an empty editor for first-time visitors?
2. Should there be a visible clear/reset control, or should deletion be the only way to remove text?
3. Should full-sentence translation wait until punctuation is committed, or continue updating on every committed word?
4. How much latency is acceptable for AI fallback before the UI should prefer a local-only approximation?
