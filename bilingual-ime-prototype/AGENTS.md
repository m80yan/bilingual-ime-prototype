# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

For the bilingual IME prototype, candidate options are bilingual subtitle pairs: Chinese on the first line, its English equivalent directly below. Keep the experience as a note editor with an in-page candidate panel, suitable for embedding in Notion.

Keep the note and input regions in stable vertical positions while the user types; changing the candidate count must not reflow the page.

Primary input is always Simplified Chinese and is displayed as a non-interactive, read-only field rather than a disabled combobox. Only the secondary translation language is selectable: English or Japanese.

Keep the note surface visually quiet: omit the breadcrumb, note status/line metadata, overflow menu, paper date/section labels, and input eyebrow. Use Chinese input with Chinese candidate text above its English translation; do not offer an English-to-Chinese mode switch.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
