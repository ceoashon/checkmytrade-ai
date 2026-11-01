# Open Questions and Assumptions

Everything here needs your decision. Most important first. Each item says what I assumed so the app could keep moving.

## Blockers: your source files

### 1. The Strat Trader Pine Script is missing
- **What happened:** The repo had no commits and no files. I also searched your Google Drive (for "Strat Trader", Pine Script keywords like `@version`, `plotshape`, `request.security`, and Strat terms) and found nothing, and no computer folder was connected to this session.
- **Effect:** `knowledge/derived/indicator-spec.md` and `chart-legend.md` are placeholders. Following "do not guess," they make no claims about the indicator. The grader is told not to interpret Strat Trader colors, lines, labels, or tables until they are filled in, and the app shows a banner saying so.
- **What I need:** Upload the `.pine` file to `knowledge/indicator/` (GitHub: **Add file > Upload files**), then ask Claude to complete Step 2 and Step 3 of the build. If it lives on your computer, you can also turn on Remote Control for that folder in the Claude desktop app so a session can read it.

### 2. The Strat study notes are missing
- **Effect:** `glossary.md` is a provisional draft from general, publicly taught TheStrat theory (marked PROVISIONAL and NEEDS COACH REVIEW). `conflicts.md` cannot be run yet.
- **What I need:** Upload the notes to `knowledge/study-notes/` and run `npm run convert:notes` (keeps the originals, writes `.md` copies). Then each glossary entry gets a source or a conflict row.
- **Possible extra sources:** your Drive has class recordings such as "ChartingClass w/ Trap and Rob," "Trade Audit 1 and 2," and the Options Masterclass videos. If transcripts of those exist, they could become study notes too. I did not use them.

### 3. No example chart screenshots
- **Effect:** `tests/cases.json` has only one synthetic chart I generated to test the pipeline. It is labeled `source: fixture`, lives in `tests/fixtures/`, and is not a coaching example.
- **What I need:** Add screenshots to `knowledge/examples/`, run `npm run cases:sync`, and fill in each case's trade details and `expected_grade_range`.

## Grading decisions (all NEEDS COACH REVIEW)

4. **Rubric weights:** Timeframe continuity 15, setup validity 20, trigger 15, entry location 10, stop placement 10, risk to reward 10, risk sizing 10, discipline 10 (total 100). Change them in `knowledge/derived/rubric.md` and `netlify/lib/rubric-config.js`.
5. **Letter scale:** standard US scale (A+ 97 to 100, A 93 to 96, A- 90 to 92, down to F under 60).
6. **Process over outcome:** a winning trade taken against the rules can score low, and a well executed loss can score high. Confirm this is how you teach it.
7. **Missing information gets half credit** for that criterion, with a note telling the student what to add next time.
8. **Thresholds I made up:** full marks for entry if within 25% of the stop distance from the trigger; full marks for R:R at 2 to 1 or better; full marks for risk sizing at 1% of the account or less.
9. **Which timeframes count for FTFC** in a futures day trading context (for example monthly, weekly, daily, 60 minute)?
10. **"The coach's voice":** I wrote a warm, direct mentor voice in plain language with no em dashes. Whose voice should it be (yours, Rob's, a coach team)? A few real examples of your written feedback would let me match it closely.
11. **Grader reads the overall grade from the rubric math.** If the model's letter disagrees with the sum of its criterion scores, the app uses the math and keeps the model's original in `model_reported` for review.

## Product and data decisions

12. **Shared login with the journal app:** I assumed the journal app uses Supabase and that CheckMyTrade will live in the same Supabase project. All tables are prefixed `cmt_`. A journal login alone does not unlock CheckMyTrade; each person redeems an invite code once. Is that right, or should every journal user get access automatically? Does the journal already have a profiles or roles table I should reuse instead of `cmt_profiles`?
13. **Optional fields added:** contracts and account size, so risk sizing can actually be checked. The form marks them optional.
14. **Daily limits** reset at midnight New York time (`RATE_LIMIT_TZ`). Coaches are exempt. A failed AI call is refunded so students are not charged for errors. Per student overrides are columns on `cmt_profiles`.
15. **Futures point values** for dollar risk are in `netlify/lib/trade-math.js` (ES, MES, NQ, MNQ, YM, MYM, RTY, M2K, CL, MCL, GC, MGC, SI, NG, 6E, ZB, ZN). Add any others your students trade.
16. **Screenshot storage:** charts are kept in a private Supabase bucket with no automatic deletion. Do you want a retention period?
17. **Ask the Course** keeps the last 6 chat messages for context and logs each question and answer for the coach, but chats are not saved as threads for students.
18. **Calibration:** the 6 most recent coach overrides marked as calibration examples go into every grading prompt (`CALIBRATION_EXAMPLES`). Too many would slow grading and raise cost.
19. **Mock mode banner** is visible to students whenever no API key is set, so nobody mistakes sample grades for real ones.
20. **Brand:** I used a gold "S" mark as a placeholder logo, Cinzel for headings, and Inter for body text. Send your logo and brand fonts if you have them.

## Technical notes

21. **Netlify time limit:** Netlify's synchronous functions stop at about 30 seconds (per Netlify's docs as of this build). Grading uses `claude-sonnet-5-5` at `medium` effort with a 24 second client timeout and skips the retry if there is not enough time left. If you see timeouts with real charts, set `GRADE_EFFORT=low`, or I can move grading to a background function with polling.
22. **Model refusal fallback:** grading sends Anthropic's server side refusal fallback by default (`ENABLE_REFUSAL_FALLBACK=true`). If the API ever rejects it, the app retries without it automatically. Set it to `false` to turn it off.
23. **Prices for cost estimates** are list prices per million tokens: Sonnet 5.5 $2 input, $10 output, $0.20 cache read; Haiku 5.5 $0.10 input, $0.50 output, $0.01 cache read. Cache write prices are assumed at 1.25 times input (5 minute cache). Override with `PRICING_JSON` if your pricing differs.
24. **Image compression:** the browser resizes screenshots to at most 1800 pixels on the long side as JPEG. Very small indicator labels might get hard to read. Easy to raise once we see real charts.
25. **DNS for ceoashon.com:** I do not know where it is hosted, so the README covers both an outside DNS provider (CNAME) and Netlify DNS.
26. **Pull request base:** you asked for a PR to `main`, but the repo was completely empty, so `main` did not exist. I created `main` from the very first scaffold commit (folder READMEs and `.gitignore` only) so the pull request has a base, and everything else is in the PR.
