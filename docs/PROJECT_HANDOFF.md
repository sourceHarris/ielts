# Practice Room - IELTS Platform Project Handoff

**Verified:** 1 November 2026, against active source, Git, automated tests, and isolated production-browser checks. Current source/tests override historical summaries. Research observations do not establish implemented features or proprietary backend details.

## 1. Confirmed product requirements

Build an independent IELTS Academic practice platform supporting Reading, Listening, Writing Task 1/Task 2, Speaking Parts 1-3, explanations, mistakes analysis, progress, and vocabulary active recall. Do not claim affiliation with IELTS owners or official examiner grading.

**Private Cambridge practice:** Authentic Academic tests must work inside the locally run private application using legitimately supplied PDF/audio. External publisher links are supplementary. The separate planned importer follows local extraction draft -> structural/marking validation -> human review -> approved versioned package -> existing engine. Preserve publisher/book/edition/test/section identity, original instructions, accepted answers, and asset references. No unauthorized scraping, paywall bypassing, or pirated collections. Keep private originals, extracted packages, answer keys, recordings, and caches out of Git and public build artifacts. Public distribution requires a separate licensing/permissions milestone. The importer and private-content build guards are not implemented yet.

**Design:** The intentional redesign follows the installed Apple Design Skill at ~/.codex/skills/apple-design/SKILL.md. Verify availability in future environments and read applicable references before substantial UI review. Adapt principles to React web controls. Preserve light default, charcoal/black dark theme, red accent, unified library, accessible navigation, readable passages, responsive layouts, and minimal clutter. No unnecessary glass on content cards. Working components should receive focused changes.

## 2. Actual implementation and active source

| Area | Implemented | Remaining |
| --- | --- | --- |
| Reading | Separate 3-question untimed demo; reusable 8-question/15-minute, 12-question/25-minute two-passage, and 4-question/10-minute Matching Headings practice | Full authentic 3-passage/40-question/60-minute examination and other question formats |
| Marking | Deterministic matching, accepted alternatives, generic text normalization, explanations | Explicit word limits, question groups, multiple selection, other instruction-specific rules |
| Sessions | Start/Resume/Review/restart, original timer, autosave, per-test draft keys, safe invalid-storage recovery | Atomic protection against simultaneous edits of the same draft |
| Completed attempts | Immutable IndexedDB snapshots; Progress review links; content/key fingerprints; failed-write retry; corrupt-record preservation | Backup/restore, durable retry journal, database pagination |
| Progress | Score summaries plus new archived attempts; show older rows | Comparable-test trends, error/criterion analysis |
| Other modules | Listening/Writing/Speaking placeholder screens and supplementary publisher resources | Audio practice, editors, recordings, transcription, assessment |
| Importing/AI/vocabulary | Confirmed requirements and private learner notes | No implemented importer, application AI service, or vocabulary UI |

Active files:

- frontend/src/App.tsx: hash routing, theme, legacy demo/summaries, archive loading, Progress.
- frontend/src/PracticeLibrary.tsx: unified filters/search, original exercises, supplementary publisher cards.
- frontend/src/ReadingPractice.tsx: session chooser and revalidated actions.
- frontend/src/ReadingExam.tsx: runner and read-only historical review; uses saved results for archived attempts.
- frontend/src/ReadingHistoryReview.tsx: archived review route loading/unavailable states.
- frontend/src/reading/types.ts and grading.ts: shared test model and current generic deterministic marking.
- frontend/src/reading/sessionStorage.ts: draft keys, validation, retention, legacy restoration, saving/clearing.
- frontend/src/reading/attemptHistory.ts: immutable snapshots, integrity/revision checks, transactional archive.
- frontend/src/reading/miniTest.ts, twoPassageTest.ts, matchingHeadingsTest.ts, PassageNavigator.tsx: fixtures/navigation.
- frontend/scripts/grading.test.mts, sessionStorage.test.mts, attemptHistory.test.mts: 60 Node tests.
- frontend/scripts/readingHistory.browser.cjs: 34 real-IndexedDB/production-UI checks.

Root duplicate source folders and backups are not the active Vite application. Empty backend/ or ai/ folders do not establish working services.

## 3. Confirmed Git checkpoints

Branch: feature/reading-engine. Remote: https://github.com/sourceHarris/ielts.git.

| Milestone | Commit | Scope |
| --- | --- | --- |
| Reading model | c6c98f7 | Reusable test data model |
| Grader integration | 0d79e93 | Deterministic Reading marking |
| Multi-passage Reading | 8369ec6 | Navigation and library integration |
| Matching Headings | f99dc83 | Unique selections and review |
| Milestone 4 | 837dc7f | Start/Resume/Review session management |
| Apple-guided redesign | 416f77b | Intentional workspace improvements and library search |
| Milestone 4.1 | 27ac6c7 | Shared safe draft storage and edge-case tests |
| Milestone 4.2 | 7094258 | Immutable version-bound Reading history and answer review |

Do not stage unrelated root files, backups, research, or vocabulary to create a checkpoint. User approval can cover a series of commits/pushes in a session; inspect its actual scope. Never infer standing permission from this document alone.

## 4. Storage, compatibility, and limitations

Drafts remain localStorage records with startedAt, answers, and submitted. Preserve the mini alias practice-room-reading-mini-draft-v1 and the existing test-ID-derived keys for other exercises. Valid numeric legacy question IDs restore through the shared module. Draft reads do not rewrite bytes. Thirty-day retention is unchanged; invalid/expired-retention drafts require explicit discard. Failures are visible and must not claim successful saving.

New completed Reading attempts use IndexedDB database practice-room-history-v1, store reading-attempts. Records include schemaVersion, stable test/start-time ID, testId, startedAt, completedAt, completionReason, contentVersion, answerKeyVersion, gradingVersion, testSnapshot, answers, resultSnapshot, and integrity checksum. Content/key revisions are SHA-256 fingerprints; they do not migrate old drafts. Checksums detect damaged data, not source authenticity or ownership.

History writes are transactional and add-only. An identical retry keeps the original submission time. Conflicting/corrupted records are never overwritten. Review uses the original stored content/key/result, disables answer controls, and never writes the current draft. History refreshes on navigation, local saves, and focus. Progress initially shows eight rows and offers Show more attempts.

Only new manual submissions and live timer expiry are archived. Reviewing an already-expired draft from the chooser does not create progress. Existing summaries/submitted drafts are not silently converted into complete attempts: original answers/completion times may be unavailable. The untimed demo remains score-summary-only. Legacy malformed summary rows are excluded from display; that older demo persistence path still has weaker failure handling than the new archive.

Known limits: no durable pending-write journal, export/import backup, history pruning, or database pagination. If an archive write fails, keep the result page open and retry; refresh loses the in-memory pending archive, though the ordinary draft may remain. Atomic history insertion does not solve simultaneous mutable-draft edits. Active drafts are not yet pinned to content/key versions; importing revised content will require explicit draft compatibility handling. Data belongs to scheme/host/port; clearing site data removes it. GitHub pushes back up source, not learner attempts.

## 5. Research: what was actually observed at Engnovate

Read **both** source documents in `docs/research/` completely; detailed evidence, variants and cautions are there. All observations are from **normal browser-visible use and publicly delivered frontend code**, not private backend access. Reports dated 29 October 2026 were **research-only** snapshots, before the present React implementation existed; do not use their initial implementation status as current.

### Reading
- WordPress AJAX form action `process_ielts_reading_test`, result `correct_answer_count`, `results[]` items (`your_answer`, `correct_answer`, `is_correct`, `section_id`, `type`, `explanation`, `detailed_explanation`, `traps`).
- Detailed explanations often arrived bundled in grading response, not embedded as plain text in initial HTML. Client could request fallback `explain_ielts_reading_answer` and `diagnose_ielts_reading_trap` if missing.
- Trap map key scheme based on normalized answer plus `::1`/`::0` correct flag, with `__general__` fallback. This is **observed client behavior**, not reliable diagnosis of a student's thoughts.
- Mark.js highlights evidence and links questions to supporting text. Engnovate client computed band estimate by mapping `(correct_count / results_length) * 40` to site-specific tables. **Do not pass these as official universal IELTS band conversions.**

### Listening
- `process_ielts_listening_test`, similar objective grading/explanation/trap schema, transcript evidence and player/part navigation. Client includes transcript highlighting, notes and part navigation. Band mapping is site-specific; server answer matching is unknown.

### Writing
- Frontend submits Task 1 and Task 2 essays through WordPress `process_ielts_writing_test`. Observed server response included `expires_in`, `flow`, worker gateway URL, and token keys `t0_content`, `t0_task`, `t1_content`, `t1_task`. Browser made four **parallel worker POSTs in one leg**, received opaque `sealed` outputs, and sent sealed fields to WordPress finalization. Client supported up to three possible legs, but only one observed worker leg. `ai_worker_rounds=1` is capability flag, **not four rounds**.
- Final Writing `task_one`/`task_two` each expose `content_result`: Task Response, Coherence & Cohesion, Lexical Resource, Grammar Range & Accuracy, each score and suggestions; `overall_band_score`. Additional `grammar_result` diffs, `text_stats`, Task 1 `image_description` and `image_hash` fields observed.
- Combined Writing frontend score Task 2 weight 2x Task 1, nearest half-band. One observed Task 1 had factual chart/table omissions identified correctly, but other AI feedback was inconsistent (grammar counts, contradictory praise/critique). Treat scores as estimates, calibrated against human-scored exemplars, never official.
- The underlying models/providers, prompts, sealed contents, task orchestration backend and how Task 1 image descriptions were obtained remain unknown; **never infer them from client code**.

### Speaking
- Per-question audio submission `process_ielts_speaking_test`; frontend preprocesses audio to 16 kHz mono and encodes MP3 ~48 kbps if possible (WAV fallback). Worker coordination appears similar but hidden server model/ASR are unknown.
- Response includes criterion feedback (`fluency_and_coherence`, `lexical_resource`, `grammatical_range_and_accuracy`, `pronunciation`, plus auxiliary `task_response`) and overall band; `pronunciation_result` provides raw/refined transcript, overall accuracy and per-word time/accuracy array. Frontend displays, rather than computes, phonetic scores; low quality/short audio can produce misleading CEFR labels. Its whole-test part weight behavior observed is **not an official IELTS rule**.
- Do not claim accurate word-level pronunciation assessment without an independently validated audio-dependent provider/model and human comparisons.

### HAR and provenance
Chrome HAR approximately 50.9 MB with about 1,429 entries per one analysis; running Chrome counts differed. Preliminary Gemini generated reports (`reports/01-traffic-inventory.md` through `07-evidence-gaps.md`) had classification and speculation errors. Treat reports and hypothesized architectures skeptically. Browser-inspected AJAX response schemas and source snippets are stronger evidence. **Do not upload original HAR or auth-containing responses to public repos or external tools without sanitizing.**


Additional evidence caution: different Writing score breakdowns and capture counts across the source reports are unresolved observations. Do not combine them into a fabricated matched submission. Private source research may be absent in a fresh checkout; state gaps rather than inventing findings. Never upload raw HAR/auth-bearing artifacts to make documentation links resolve.

## 6. Planned architecture and AI boundaries

Keep React/Vite/TypeScript. The proposed AI layer is one local Node/TypeScript service with five independently testable capabilities: Reading explanations, Listening explanations, Writing assessment, Speaking assessment, and learning coaching. Share provider adapters, queueing, schema validation, versioned prompts, bounded retries, private caching, and evaluation metadata. Ollama is a local candidate to benchmark; no runtime is integrated or calibrated. Provider secrets stay server-side. Cloud transmission, paid services, and major stack changes need explicit approval.

Reading/Listening correctness stays deterministic against reviewed keys. Add question-specific marking, groups, evidence spans, and verified transcript/timestamp references before AI explanations. The model cannot override the key. Mini-test accuracy is not a guaranteed IELTS band; conversion thresholds can vary between tests.

Writing needs separate Task 1/Task 2 workspaces, real visuals plus reviewed facts, immutable submissions, and rubric-versioned reports. Use Task Achievement for Task 1, Task Response for Task 2, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Task 2 has double weighting; document estimate rounding. Distinguish grammar errors from optional style advice. Evaluate contradictions, chart facts, and agreement with suitable human-rated references.

Speaking needs preparation/recording/playback for Parts 1-3, original audio, and separately preserved raw/refined transcripts. Assess four rubric criteria with suitable evidence; relevance is extra coaching, not a fifth official criterion. Text or transcription confidence cannot establish pronunciation accuracy. Unsupported acoustic assessment remains unavailable. Validate audio-dependent claims against reference samples and human judgements.

The vocabulary bank is private learner material, not a shipped glossary. Preserve entries and context, mark them collected rather than mastered, and base scheduling/progress on actual recall events. The learning coach must cite real attempts and mistakes rather than invent weaknesses.

## 7. Remaining milestones (plans, not implemented)

1. Local backup/export and validation-first restore, preserving immutable records and reporting conflicts/corruption.
2. Objective question rules in tested batches: Y/N/NG, completion/word limits, multiple responses, matching information/features/endings, and visual labels. Model answer alternatives separately from selecting several answers; define group reuse/cardinality explicitly.
3. Private importer pilot for one legitimately supplied Reading passage using supported types. Establish private paths and build exclusions before actual content import. Validate extracted text, instructions, IDs, keys, and assets; human review gates activation. Add PDF/OCR dependencies only when actual files justify them.
4. Full Reading examination, review flags, highlighting, and verified source evidence. Real practice uses an approved authentic package; synthetic fixtures are QA material only.
5. Listening with local audio, four parts/40 questions, explicit practice/examination playback policies, sessions, marking, and reviewed transcript evidence.
6. Local AI service and one real evidence-grounded Reading explanation; then Listening explanations. Test schemas, quotations, unavailable providers, timeout/cancellation, retry limits, cache invalidation, latency, and model/prompt versions. No simulated feedback labelled live AI.
7. Writing editors/history, followed by rubric/visual-grounded feedback and calibrated score estimates.
8. Speaking recording/history, then transcription and supported language/fluency feedback; validated acoustic pronunciation assessment is a separate gate.
9. Evidence-based progress analytics, private vocabulary active recall, and history-grounded learning coaching.
10. Integrated browser/accessibility/responsive-theme, recovery, privacy, and runtime-performance verification. Public distribution remains separate.

Dependencies: immutable attempts precede analytics; supported marking precedes imported-question activation; verified evidence precedes AI explanations; recording precedes transcription; acoustic evaluation precedes pronunciation claims. Keep increments independently reviewable.

## 8. Verification

From frontend/, run:

- node --test scripts/grading.test.mts scripts/sessionStorage.test.mts scripts/attemptHistory.test.mts
- npm run build
- npm run lint
- Type-check the three test files with the local compiler using --ignoreConfig --noEmit --target es2023 --module esnext --moduleResolution bundler --allowImportingTsExtensions --types node --skipLibCheck. The build separately checks the application.

Browser: run a production preview at 127.0.0.1:5178 and an isolated test Chrome debugging on 9229, then node scripts/readingHistory.browser.cjs. Overrides are documented in the script. It creates/disposes its own browser contexts; never clear learner browser data. Checks cover real IndexedDB operations/concurrency, corrupt/unsupported records, failures/retry, sessions/expiry, Matching Headings, historical snapshots, legacy summaries, older rows, responsive layout, and dark appearance.

Current verification: 60 Node tests and 34 browser checks pass; production build and application/test TypeScript checks pass. Lint exits successfully with one known set-state-in-effect warning in ReadingExam.tsx concerning persistence-result reporting. CSS and grading rules are unchanged; no new dependencies were added for history.

Inspect exact Git diffs and staged paths before checkpointing. Include only scoped source, tests, and canonical documentation. Exclude research originals, vocabulary, backups, credentials, private study material, and build output.

## 9. Provenance and maintenance

This handoff replaces outdated implementation claims with verified source/Git/test behavior as of 1 November 2026. The two original research documents in docs/research/ and the private vocabulary bank were not rewritten or published. Their observations remain historical evidence, not current backend facts. Update milestone status from actual commits and test results; never treat this roadmap as implemented functionality.
