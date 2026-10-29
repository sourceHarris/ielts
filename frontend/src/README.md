# IELTS Practice Room — V6: Unified practice list

This update removes the two separate source sections from V5. The Practice page now shows **one continuous list** of practice exercises and linked publisher resources, filterable by IELTS skill.

Each entry has a small colored circle beside its title:
- **Cyan** for links to official IELTS publisher resources.
- **Dark** for the website’s own original exercises; the dark circle has a light outline in Dark Mode so it remains visible.

**No visible legend or label is added for the circles**, as requested. Accessibility labels remain available to assistive technologies. Publisher identities stay visible for transparency, and external resources link to their official sites. The linked pages are practice-resource pages, not imported Cambridge IELTS 1–21 test books.

## Install in the current V5 project

1. Back up your existing files (or commit your current working project).
2. Copy the **four files** from this archive's `src/` folder into your existing `C:\Users\haris\Projects\ielts-platform\frontend\src\` folder:
   - `App.tsx`
   - `PracticeLibrary.tsx`
   - `PracticeLibrary.css`
   - `ReadingPractice.tsx`
3. Keep the other V5 files, including `App.css`, `index.css`, and `readingPracticeData.ts`, unchanged.
4. In PowerShell:
   ```powershell
   cd "$HOME\Projects\ielts-platform\frontend"
   npm run build
   npm run dev
   ```
5. Go to **Practice**. Use the skill filter and check that both local exercises and official resource links work.

Old URLs `#/practice-ai` and `#/practice-official` automatically display the unified Practice page.

## Preserved

- Light and dark theme, red accent, desktop/mobile navigation.
- Working 8-question timed Reading test and 3-question demo.
- Local answer saving, review, and progress functionality.
- Official resource links from V5; no copyrighted test questions or audio are hosted here.

The circle colors describe the **source**, not whether an exercise is guaranteed to perfectly match the official exam. The locally authored examples are not live AI-generated tests.
