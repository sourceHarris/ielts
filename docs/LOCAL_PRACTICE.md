# Private in-app practice

The application now supports original local source pages and audio inside Reading, Listening, Writing, and Speaking workspaces. Publisher websites remain optional references in a collapsed supplementary section.

## Run locally

Use Node.js 24 or later. From `frontend/`, run `npm ci`, then `npm run dev`. Use the same localhost URL and port consistently: browser attempts belong to that origin.

## Import legitimate source material

From `frontend/`:

```powershell
npm run import:private -- --source "<your study-material folder>" --ocr
```

The importer reads PDF/MP3/WAV/M4A files recursively, skips symbolic links and archives, and leaves originals untouched. It caches immutable copies by SHA-256, extracts embedded text, and uses local Tesseract OCR for scans. English OCR recognition data is downloaded on first use; source pages are not uploaded. Cached text makes subsequent runs resumable.

Output lives in the project's Git-ignored `private-content/` directory: cached assets, page text, a local catalog, OCR data, and any local review overrides. Never stage these files. Retired cached source assets remain available to existing historical references; no automatic deletion is performed.

Section headings and question counts detected from OCR are suggestions. They may be wrong, incomplete, or absent. A filename is not proof of edition, test number, or authenticity. Check the actual pages. DOC/RAR/ZIP files are not converted by this importer, and absent books/audio cannot be created from missing material.

## Activate a test

1. Open Practice and select a module from a private source document.
2. Check the test number, PDF page range, timer, and original audio/order where applicable.
3. For Reading/Listening, review every answer and marking restriction. Prefilled key drafts still require confirmation.
4. Review the proposed import, confirm it against the original, and add the test. It then appears in the ready list.

The numbered key format supports accepted alternatives (`1: answer | alternative`), question-specific word limits (`; limit=3`), an additional number (`; number=1`), explicit capitalization (`; case=exact`), and distinct any-order groups (`2-3: choiceA + choiceB`). Duplicate group selections never receive duplicate credit. Preserve original counts: some historical papers have more than 40 questions. Do not activate a test whose instructions this format cannot faithfully express.

The original PDF is rendered locally, including charts, diagrams, tables, and question layouts. Enlarge a source page for reading; the text disclosure is unreviewed extraction, not a replacement for the original. This is a PDF-based practice workflow, not a claim that all passages and question types have been converted into fully structured content.

## Workspaces

- Reading: timed answer sheet, reviewed-key marking, original pages, saved responses and historical results.
- Listening: original local audio, section playback, timed answer sheet, reviewed-key marking, and review. Playback permits pause/replay in practice mode; this is not a locked official examination simulation.
- Writing: separate Task 1/2 editors, word counts, original visual prompts, timer, autosave, text export, and saved submissions. No AI assessment or band estimate is implemented.
- Speaking: Parts 1-3 controls, preparation countdown, microphone recording, playback, download, notes, and saved sessions. Part 2 recording stops after two minutes. No transcription, pronunciation assessment, or AI band estimate is implemented.

An invalid stored setup, session, or result is preserved and blocked/excluded with a visible message. Failed writes do not claim persistence. A failed recording is retained in memory for explicit retry; keep the page open until it saves. Completing a session atomically saves its working state and an immutable attempt; objective result snapshots have an explicit grading version and are reused during historical review.

Working-session edits do not yet have full multi-tab conflict coordination. Backup/restore and durable pending-write journaling are not implemented. GitHub backs up code, not private cached books, essays, recordings, approved setups, or browser attempts. Clearing site data removes browser records.

## Privacy boundary

The Vite plugin serves private assets by allowlisted IDs during local dev and preview. It rejects remote clients, cross-site requests, untrusted origins/hosts, and arbitrary paths. Source paths are excluded from the client catalog. PDF/audio streaming supports byte ranges. Private assets and source metadata are not bundled into the static build. A deployed static build therefore does not contain the learner's library and is not a public content-hosting implementation.

The generic source, importer, and workspaces can be committed. Source books/audio, OCR/key drafts, learner data, caches, recordings, research originals, and private vocabulary must stay out of Git. Public distribution is a separate licensing and deployment milestone.

## Verification

From `frontend/`, run `npm test`, `npm run build`, and `npm run lint`. Type-check the four test files as documented in the handoff.

For browser checks, use isolated Chrome debugging on port 9229 and a production preview. Set `IELTS_PREVIEW_URL` to the preview origin and run `node scripts/readingHistory.browser.cjs` and `node scripts/practiceModules.browser.cjs`. The latter requires a local imported source with reviewed key drafts. Both scripts create and dispose of browser contexts and never use the learner's personal browser storage.

The module suite tests microphone denial and real MediaRecorder encoding using a synthetic test signal. Physical microphone quality, transcription accuracy, pronunciation, and human scoring calibration still require separate verification.
