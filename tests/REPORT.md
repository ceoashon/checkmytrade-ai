# CheckMyTrade Test Report

Generated 2026-11-01T21:05:40.912Z by `npm run eval`.

- AI mode: **MOCK** (no ANTHROPIC_API_KEY, so grades and answers come from the deterministic mock)
- Runs per case: 3
- Knowledge bundle: `efe7af9204ec505e`. Indicator spec **pending (source code missing)**, chart legend **pending**, glossary **provisional**, study notes files: 0.

## 1. Unit tests

63 of 63 passed, 0 failed. Covers input validation, JSON schema validation and retry, rate limiting, auth checks, coach overrides, calibration, and cost math.

## 2. Grading evaluation

> **No coach example screenshots yet.** `knowledge/examples/` is empty, so the only case below is a synthetic fixture that checks the pipeline end to end. Add screenshots, run `npm run cases:sync`, fill in the details and expected ranges, then run `npm run eval` again.

| Case | Source | Expected | Grades over runs | Mean score | Score spread (sd) | Same grade every run | In expected range | Avg cost | Avg time |
|---|---|---|---|---|---|---|---|---|---|
| fixture-synthetic-2-1-2 | fixture | B to A+ (NEEDS COACH REVIEW) | B+, B+, B+ | 87.5 | 0.00 (87.5 to 87.5) | 100% | 3/3 | $0.0138 | 0.0s |

Overall: 3/3 graded runs landed in the expected range.

Note: mock grades are deterministic by design, so consistency is always 100% in mock mode. Run with a real key to measure real grade consistency.

## 3. Q&A grounding

14/14 passed. Answerable questions answered: 8/8. Out of scope questions declined: 6/6.

| Group | Question | Expected grounded | Got | Pass | Sources | Answer (start) |
|---|---|---|---|---|---|---|
| answerable | What is an inside bar? | true | true | PASS | knowledge/derived/glossary.md | 1 (Inside Bar): A candle whose high is lower than or equal to the previous candle's high AND whose low is high |
| answerable | What does 2U mean? | true | true | PASS | knowledge/derived/glossary.md | 2U (Two Up, Directional Up): A candle that takes out the previous candle's high but does not take out its low. |
| answerable | What is full timeframe continuity? | true | true | PASS | knowledge/derived/glossary.md | Full Timeframe Continuity (FTFC): All of the timeframes you track (for example monthly, weekly, daily, and the |
| answerable | What is a 2-1-2 reversal? | true | true | PASS | knowledge/derived/glossary.md | 2-1-2 Reversal: A 2 in one direction, an inside bar, then a 2 in the opposite direction (for example 2D, 1, 2U |
| answerable | What is a failed 2? | true | true | PASS | knowledge/derived/glossary.md | Failed 2 (Failed 2U / Failed 2D): A 2U that breaks the prior high but then reverses and trades back down (comm |
| answerable | What is a shooter? | true | true | PASS | knowledge/derived/glossary.md | Shooter (Shooting Star): A candle with a long upper wick and a small body near the bottom, showing rejection o |
| answerable | What is magnitude? | true | true | PASS | knowledge/derived/glossary.md | Magnitude: The distance to the next logical target level, such as the previous candle's high or low or a highe |
| answerable | How is risk sizing graded? | true | true | PASS | knowledge/derived/glossary.md | Risk Sizing: Choosing position size so that if the stop is hit, the loss is a fixed, small share of the accoun |
| not_in_knowledge | Will NQ go up tomorrow? | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |
| not_in_knowledge | What is the best broker for futures day trading? | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |
| not_in_knowledge | Explain the Wyckoff accumulation schematic. | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |
| not_in_knowledge | How do Bollinger Bands work? | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |
| not_in_knowledge | Should I buy Tesla stock this week? | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |
| not_in_knowledge | What year did Rob Smith start trading? | false | false | PASS |  | That one is not covered in the course materials yet, so I do not want to guess. Please bring it to your coach, |

## What this report can and cannot tell you yet

- The indicator spec and chart legend are placeholders until the Strat Trader Pine Script is uploaded, so real grading cannot judge indicator specific behavior yet.
- Expected grade ranges are the assistant's guesses and are marked NEEDS COACH REVIEW.
- The glossary is provisional, so "answerable" here means answerable from the provisional glossary.
