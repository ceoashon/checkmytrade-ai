# CheckMyTrade AI

An AI trade grader and course Q&A tool for **Solomon's Circle**, a futures mentorship that teaches Rob Smith's TheStrat.

Students upload a chart screenshot and their trade details and get a graded breakdown in the coach's voice: an overall grade from A+ to F, a score on each rubric criterion, what they did well, the main mistake, how to fix it, and what to review. They can also ask questions that are answered only from the course materials. Coaches can see every submission, override grades, leave comments, teach the grader with calibration examples, and see the estimated AI cost per student.

> **Current status:** the app, database, tests, and docs are built and run end to end in mock mode. **The Strat Trader Pine Script, the study notes, and example screenshots were not in the repo yet**, so the indicator spec and chart legend are placeholders and the glossary and rubric are provisional drafts. See `OPEN_QUESTIONS.md`, items 1 to 3.

## Repo structure

```
knowledge/
  indicator/      Strat Trader Pine Script source (drop .pine files here)
  study-notes/    Strat study notes (pdf/docx originals plus .md copies)
  examples/       Chart screenshots, each one becomes an eval case
  derived/        Files generated from the two sources above
    indicator-spec.md   How the indicator works, with code line references
    chart-legend.md     Plain English guide to reading a Strat Trader chart
    glossary.md         TheStrat terms
    conflicts.md        Where the notes and the code disagree
    rubric.md           Grading rubric
public/           Static front end (HTML, CSS, JS, no framework)
netlify/
  functions/      API endpoints (grade, ask, history, coach, me, config, redeem-invite)
  lib/            Shared server code (AI calls, validation, schema, auth, storage, mock mode)
supabase/
  schema.sql      Database tables, security rules, and storage bucket
  first-coach.sql Creates your first coach invite code
scripts/          Knowledge bundler, notes converter, case sync, local dev server
tests/
  unit/           Unit tests (node:test)
  cases.json      Grading eval cases
  qa-cases.json   Q&A grounding questions
  eval.js         npm run eval
  REPORT.md       Latest test report
netlify.toml      Build, functions, /api redirect, security headers
.env.example      Every environment variable (names only)
OPEN_QUESTIONS.md Assumptions and decisions that need you
```

## How it works

- **Front end** (`public/`) is plain HTML, CSS, and JavaScript. Screenshots are resized and compressed in the browser before upload.
- **Back end** is Netlify Functions. The Anthropic API key and the Supabase service key live only in Netlify environment variables. The browser only ever gets the Supabase anon key, which is designed to be public.
- **Grading** sends the screenshot, the trade details, app calculated numbers (risk to reward, dollar risk, percent of account), `chart-legend.md`, `indicator-spec.md`, `glossary.md`, and `rubric.md` to `claude-sonnet-5-5`. The answer comes back as structured JSON, is checked against a schema, and is retried once if it does not match. The overall score and letter are recomputed from the criterion scores so they always match the rubric.
- **Ask the Course** sends the question and all knowledge files to `claude-haiku-5-5` with instructions to answer only from those files and to say so when the answer is not there.
- **Prompt caching** is on for the knowledge files and rubric (they are identical on every request), and coach calibration examples are cached in their own block so adding one does not throw away the larger cache.
- **Mock mode:** with no `ANTHROPIC_API_KEY`, the app returns realistic, deterministic fake grades and keyword matched answers so everything works end to end.
- **Guardrails:** invite code access only, daily limits per student (default 5 grades and 20 questions, coaches unlimited, failed AI calls are not counted), and "Education only, not financial advice." on every result.

## Setup

### 1. Supabase (database and login)

You can use the **same Supabase project as your journal app** so students have one login. Everything CheckMyTrade creates is prefixed `cmt_`, and nothing touches the journal's tables.

1. Open your Supabase project (or create one at supabase.com).
2. Go to **SQL Editor**, click **New query**, paste all of `supabase/schema.sql`, and click **Run**. It is safe to run again later.
3. Open `supabase/first-coach.sql`, replace the code with something private, and run it. Keep that code for step 5.
4. Go to **Authentication > Providers**:
   - **Email** is on by default. The app uses magic links (no passwords to forget).
   - **Google:** turn it on and paste a Google OAuth Client ID and Secret. In Google Cloud Console, create an OAuth client of type Web application with the authorized redirect URI `https://<your-project-ref>.supabase.co/auth/v1/callback`. If your journal app already uses Google login on this project, this is already done.
5. Go to **Authentication > URL Configuration**:
   - Add `https://check.ceoashon.com` to **Redirect URLs** (and your `https://<site>.netlify.app` address while testing). If the journal app owns the Site URL, leave it and just add these as redirect URLs.
6. Go to **Project Settings > API** and copy the **Project URL**, the **anon public** key, and the **service_role** key for step 2.

### 2. Netlify (hosting)

1. In Netlify, click **Add new site > Import an existing project > GitHub**, and pick `ceoashon/checkmytrade-ai`.
2. The build settings come from `netlify.toml` (build command `npm run build`, publish folder `public`, functions in `netlify/functions`). Leave them as they are.
3. Before the first deploy, open **Site configuration > Environment variables** and add:

| Variable | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase Project URL |
| `SUPABASE_ANON_KEY` | yes | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service_role key. Server only, never shared |
| `ANTHROPIC_API_KEY` | for live grading | Leave empty to run in mock mode |
| `GRADE_MODEL` | no | Default `claude-sonnet-5-5` |
| `QA_MODEL` | no | Default `claude-haiku-5-5` |
| `GRADE_EFFORT` | no | `low`, `medium` (default), or `high`. Lower is faster and cheaper |
| `DAILY_GRADE_LIMIT` | no | Default `5` |
| `DAILY_QUESTION_LIMIT` | no | Default `20` |
| `RATE_LIMIT_TZ` | no | When the daily limits reset. Default `America/New_York` |
| `CALIBRATION_EXAMPLES` | no | Coach examples added to each grading prompt. Default `6` |
| `CACHE_TTL` | no | `5m` (default) or `1h` prompt cache lifetime |
| `ENABLE_REFUSAL_FALLBACK` | no | Default `true` |
| `PRICING_JSON` | no | Override the per model prices used for cost estimates |

   See `.env.example` for the full list. Never put real values in the repo.
4. Click **Deploy**. When it finishes, open `https://<site>.netlify.app/api/config`. You should see `"mockAi": false` (if you set the key) and your Supabase URL. No secret values ever appear there.

### 3. Custom domain: check.ceoashon.com

1. In Netlify, open **Domain management > Add a domain**, enter `check.ceoashon.com`, and confirm.
2. Where the DNS for `ceoashon.com` is managed, add a record:
   - Type `CNAME`, name `check`, value `<your-site-name>.netlify.app`
   - (If `ceoashon.com` already uses Netlify DNS, Netlify adds this for you.)
3. Back in Netlify, wait for the domain to show as verified, then under **HTTPS** click **Verify DNS configuration** and let it provision the certificate (usually a few minutes).
4. Check it: open `https://check.ceoashon.com/api/config`, then sign in once to confirm the Supabase redirect works. From a terminal you can also run:

```bash
dig +short check.ceoashon.com CNAME
```

### 4. Invite codes

1. Open `https://check.ceoashon.com`, sign in with Google or an email link, and enter the coach code from Supabase step 3. You now see the **Coach** tab.
2. In **Coach > Invite Codes**, create codes for students. Leave the code blank to generate one like `SC-7KQ2-M9XD`. Set max uses (for example 30 for a whole cohort), an optional expiry, and a note.
3. Students sign in with their journal login (or any email or Google account) and enter the code once. Pause a code anytime from the same screen.
4. Per student limits: set `daily_grade_limit` or `daily_question_limit` on a row in the `cmt_profiles` table (blank means use the default). To pause a student, set `active` to false.

### 5. Add your knowledge

1. Put the Strat Trader `.pine` file in `knowledge/indicator/`, your notes in `knowledge/study-notes/`, and chart screenshots in `knowledge/examples/`, then commit and push (GitHub's **Add file > Upload files** works fine).
2. Run `npm run convert:notes` to make markdown copies of pdf and docx notes.
3. Ask Claude to finish Steps 2 and 3 of the build (indicator spec, chart legend, glossary, conflicts) from those files.
4. Run `npm run cases:sync`, fill in `tests/cases.json`, and run `npm run eval`.
5. Every deploy rebuilds the knowledge bundle automatically.

## Running locally and running tests

Requires Node 20 or newer.

```bash
npm install
```

```bash
npm test
```

```bash
npm run eval
```

`npm test` runs the unit tests. `npm run eval` runs the unit tests, every grading case several times (`EVAL_RUNS=5 npm run eval` to change the count), and the Q&A grounding questions, then writes `tests/REPORT.md`. It uses the real API when `ANTHROPIC_API_KEY` is set (in your shell or a local `.env` file) and mock mode otherwise. A live eval costs roughly a few cents per grading run.

To click through the whole app locally with no accounts at all:

```bash
npm run dev:local
```

Then open http://localhost:8888, sign in with any test email, and use invite code `DEMO-STUDENT` or `DEMO-COACH`. Local dev sign in only works when Supabase is not configured and is always refused on the production deploy. If you use the Netlify CLI instead, `npm run dev` works too.

## Cost

Estimated costs are stored per request and shown per student in the Coach view. With the knowledge files cached, a live grade on `claude-sonnet-5-5` should land around one to three cents and a question on `claude-haiku-5-5` well under a cent, depending on screenshot size and how much the model writes. Your Anthropic invoice is the final word. Netlify and Supabase both have free tiers that should cover a small cohort, but check their current limits.

## Security notes

- The Anthropic and Supabase service keys are only read inside Netlify Functions.
- All writes go through the functions. Row level security lets a signed in browser read only its own rows (coaches can read all).
- Chart screenshots are stored in a private bucket and shown to coaches through short lived signed links.

*Education only, not financial advice.*
