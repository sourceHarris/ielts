# Practice Room — Repository Agent Instructions

## Goal and context
Build an original, independent IELTS Academic preparation platform. Before editing, inspect `docs/PROJECT_HANDOFF.md` and the actual repository. Consult `docs/research/IELTS_platform_research_master_notes.md` and `docs/research/engnovate_ielts_research_report.md` when work involves test scoring, evidence, AI feedback, or observed competitor behavior. `docs/learning/IELTS_Vocabulary_Bank.md` contains **private learner study notes**, not a public site glossary or shipping feature.

## Working style
- Act as a critical senior engineer and teaching mentor. Explain changes in plain English, including why. Favor small, testable changes and maintainability over rewrites.
- Inspect files and Git state before proposing edits; **current code and tests override historical summaries** when they differ.
- Maintain current React + Vite + TypeScript application, layout, accessible controls, light-first and charcoal dark themes, red accent, and unified Practice Library. Do not change design unless requested.
- The intentional frontend redesign follows the installed Apple Design Skill (`~/.codex/skills/apple-design/SKILL.md`). Read its applicable references for substantial frontend reviews; adapt accessibility, layout, typography, color, and feedback principles to the web rather than copying native Apple conventions. Preserve the redesign and avoid unnecessary glass on content cards.
- Test affected flows. From `frontend/`, run `npm run build` and `node --test .\\scripts\\grading.test.mts` (or shell-equivalent). A successful grading test does not verify the UI: identify browser acceptance checks explicitly.
- Never stage, commit, push, delete untracked files, or overwrite backups without explicit approval. Show `git diff`, note unknown changes. Avoid `git add .` for broad staging. Untracked local backups and unrelated files are deliberately left alone.
- Save drafts by **stable test IDs**; avoid cross-test answer leakage. Keep timer, resume, review, expiration, and history behavior deliberate. Preserve compatibility with prior saved attempts where appropriate.
- Mutable Reading drafts use `frontend/src/reading/sessionStorage.ts`; preserve existing localStorage keys, numeric-answer compatibility, and 30-day retention. Completed Reading attempts use a separate IndexedDB archive in `reading/attemptHistory.ts`, including immutable content/key/result snapshots. Never regrade historical review against current fixtures or silently overwrite a conflicting/corrupted record. Old score summaries and the untimed demo do not have complete archived answers.

## Research, product, and safety constraints
- Authentic Cambridge Academic tests are intended for **private, local, in-app practice** using legitimate PDF/audio material supplied by the learner. External publisher links are supplementary, not the final product. A local PDF/text/OCR importer and reviewed PDF-based workspaces now exist; follow `docs/LOCAL_PRACTICE.md`. Extracted text and section candidates are unreviewed. Do not activate keys automatically or claim every book/test is fully structured and verified.
- Do not scrape unauthorized collections, bypass paywalls, or fetch pirated materials. Keep source PDFs, extracted private content, answer keys, audio, learner recordings, and model caches out of Git and public build artifacts. A public release requires a separate licensing/permissions review; private local use does not establish public distribution rights.
- Separate **verified in browser**, **verified in source/client code**, and **hypothesis/unknown**. Third-party code/traffic is for learning about externally observable behavior, not copying proprietary implementation.
- No fabricated server architecture, prompts, providers, private model internals, pronunciation accuracy, or guaranteed IELTS band equivalents.
- Reading/Listening answer marking should be deterministic and question-type-aware; AI explanations must be tied to actual evidence. Writing/Speaking AI estimates require rubric grounding, uncertainty notices, and calibration; no claims of official examiner grading.
- Never commit or publish HAR captures, cookies, session IDs, WordPress nonces, opaque worker tokens, sealed payloads, passwords, personal essays, private recordings, or sensitive user information. Keep raw investigation artifacts private and sanitized.

## Key directories
- `frontend/src/App.tsx`, `PracticeLibrary.tsx`, `ReadingPractice.tsx`, `ReadingExam.tsx`
- `frontend/src/reading/types.ts`, `grading.ts`, `miniTest.ts`, `twoPassageTest.ts`, `matchingHeadingsTest.ts`, `PassageNavigator.tsx`
- `frontend/src/reading/sessionStorage.ts`, `attemptHistory.ts`, and `frontend/src/ReadingHistoryReview.tsx`
- `frontend/scripts/grading.test.mts`, `sessionStorage.test.mts`, `attemptHistory.test.mts`, and `readingHistory.browser.cjs`
- `docs/PROJECT_HANDOFF.md` and `docs/research/` for detailed product and research history.

## Protocol for new tasks
1. Read this file and project docs relevant to the task.
2. Inspect real source and current Git state.
3. Explain smallest safe plan and ask only for genuinely missing inputs.
4. Implement, test, inspect diff, and report results and limitations.
5. Do not commit or push without permission.

## Verification and remaining scope
- From `frontend/`, run `node --test scripts/grading.test.mts scripts/sessionStorage.test.mts scripts/attemptHistory.test.mts`, `npm run build`, and `npm run lint`. Type-check the test files as well as the application when changing storage contracts.
- Browser history regressions: run `node scripts/readingHistory.browser.cjs` against a production preview on port 5178 and test Chrome debugging on port 9229 (environment overrides are documented in the script). It creates disposable contexts and must never use a learner's personal browser data.
- PDF-based Reading/Listening answer sheets, original local audio playback, Writing Task 1/2 editors, Speaking recording/playback, and per-module saved history are implemented under `frontend/src/practice/`. AI assessment, transcription, pronunciation scoring, vocabulary UI, and complete structured imports for all question types remain planned. Never present an unconfigured service as live AI or invent band scores.
- `frontend/scripts/import-private.mjs` and `index-private.mjs` produce only Git-ignored `private-content/` output. Keep originals untouched. `frontend/server/privateLibrary.ts` serves allowlisted immutable cached assets only on localhost during Vite dev/preview; it is not a publicly deployed content backend. Never move these assets into public/ or import them into the client bundle. Build guards reject private-content imports and PDF/audio assets.
- Private practice sessions are separate from the existing Reading draft keys/archive. Source PDF hashes, reviewed keys, exact responses, and saved objective results are retained. Do not regrade historical snapshots against a changed key. Storage failures require visible errors/retry, including retention of a failed recording in memory. Mutable draft multi-tab coordination and backup/restore remain incomplete.
- Additional verification: `npm test` runs all four Node test files; `practiceModules.browser.cjs` checks all four workspaces using the owner's local private library in disposable contexts. The recording test uses real browser encoding of a synthetic audio signal; it does not validate physical microphones or pronunciation accuracy. Private material is never copied into committed fixtures.
- Private research/vocabulary documents may exist only in the local checkout. Do not automatically stage them to make documentation links resolve. Keep verified source/browser behavior separate from historical observations, plans, and unknown proprietary details.
