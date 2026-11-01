# CheckMyTrade Grading Rubric (Draft v0.1)

> **STATUS: DRAFT. NEEDS COACH REVIEW.**
>
> Built without the study notes or the Strat Trader code (both missing at the time of writing). Every weight, threshold, and judgment below is the assistant's proposal unless it cites your materials, and is marked **NEEDS COACH REVIEW**. The criterion ids in `code` are used by the app. Change wording and weights freely, but keep the ids, or update `netlify/functions/_lib/rubric-config.js` to match.

## How grading works

- The grade measures **process, not outcome.** A winning trade taken against the rules can score low, and a well executed losing trade can score high. **NEEDS COACH REVIEW**
- Each criterion is scored from 0 to its weight. The total is out of 100.
- When something cannot be judged from the screenshot or the details (for example account size for risk sizing), the grader gives **partial credit equal to half the weight**, says what was missing, and asks the student to include it next time. **NEEDS COACH REVIEW**
- The grader never assumes the meaning of a Strat Trader color, line, or label that is not documented in `chart-legend.md`.

## Letter grade scale (NEEDS COACH REVIEW)

| Score | Grade | Score | Grade | Score | Grade |
|---|---|---|---|---|---|
| 97 to 100 | A+ | 83 to 86 | B | 67 to 69 | D+ |
| 93 to 96 | A | 80 to 82 | B- | 63 to 66 | D |
| 90 to 92 | A- | 77 to 79 | C+ | 60 to 62 | D- |
| 87 to 89 | B+ | 73 to 76 | C | 0 to 59 | F |
| | | 70 to 72 | C- | | |

## Criteria

### 1. Timeframe Continuity `timeframe_continuity` (15 points) NEEDS COACH REVIEW
- **Full marks:** The trade is in the direction of full timeframe continuity across the timeframes the course requires. The student names the higher timeframe context.
- **Partial:** Most higher timeframes agree, or continuity is mixed but the student acknowledged it and reduced size.
- **Zero:** Trade is against clear continuity with no reason given.
- **Common mistakes:** Going long while higher timeframes are red; ignoring the monthly or weekly; reading continuity from an unclosed lower timeframe candle.
- **Review:** Glossary: Timeframe Continuity, Full Timeframe Continuity (FTFC), Higher Timeframe.

### 2. Setup Validity `setup_validity` (20 points) NEEDS COACH REVIEW
- **Full marks:** The candle sequence on the chart is a real Strat setup (for example 2-1-2, 3-1-2, 2-2 reversal, 1-2-2 RevStrat), correctly numbered, at a meaningful location.
- **Partial:** A real setup, but mislabeled, or formed in the middle of a range with no context.
- **Zero:** No identifiable setup, or the candles were numbered wrong in a way that changes the trade.
- **Common mistakes:** Calling a candle a 1 when it broke the prior high; trading a 2 with no setup before it; confusing a 3 with a 2.
- **Review:** Glossary: 1, 2U, 2D, 3, 2-1-2 Reversal, 3-1-2, 2-2 Reversal, 1-2-2 RevStrat.

### 3. Trigger `trigger` (15 points) NEEDS COACH REVIEW
- **Full marks:** Entry happened only after the trigger level broke (the setup was in force), in the setup's direction.
- **Partial:** Entered on the trigger candle but slightly before the break, or on a close rather than the break, with a reason.
- **Zero:** Anticipated the trigger with no break, or entered on the wrong side.
- **Common mistakes:** Entering inside the inside bar; buying the break of the wrong candle.
- **Review:** Glossary: Trigger, In Force, Inside Bar.

### 4. Entry Location `entry_location` (10 points) NEEDS COACH REVIEW
- **Full marks:** Entry is at or within a small distance of the trigger (proposed: within 25 percent of the stop distance). **NEEDS COACH REVIEW: tolerance**
- **Partial:** Entry is late but the trade still has at least 1.5:1 to target.
- **Zero:** Chased far beyond the trigger.
- **Common mistakes:** Chasing after a big candle; entering in the middle of the setup candle.
- **Review:** Glossary: Entry, Chasing.

### 5. Stop Placement `stop_placement` (10 points) NEEDS COACH REVIEW
- **Full marks:** Stop sits where the setup is proven wrong, beyond the opposite side of the setup or trigger candle, and was set before entry.
- **Partial:** Stop is logical but noticeably wider or tighter than the setup suggests.
- **Zero:** No stop, a random dollar stop, or a stop inside the setup candle's noise.
- **Common mistakes:** Stop too tight inside the inside bar; no stop; moving the stop wider after entry.
- **Review:** Glossary: Stop, Moving the Stop.

### 6. Risk to Reward `risk_reward` (10 points) NEEDS COACH REVIEW
- **Full marks:** Planned R:R of 2:1 or better to a logical Strat target (previous candle extreme or higher timeframe level).
- **Partial:** 1.5:1 to under 2:1, or a good ratio to a target that is not a logical level.
- **Zero:** Under 1:1, or no target.
- **Common mistakes:** Target picked from a dollar goal instead of structure; target beyond an obvious level.
- **Review:** Glossary: Target, Magnitude, Risk to Reward.
- The app computes R:R from entry, stop, and target so the model does not have to.

### 7. Risk Sizing `risk_sizing` (10 points) NEEDS COACH REVIEW
- **Full marks:** Position size keeps the loss at stop within the course's per trade risk limit (proposed: 1 percent of account or less). **NEEDS COACH REVIEW: limit**
- **Partial:** Size not stated (half credit, see rule above), or slightly over the limit.
- **Zero:** Clearly oversized (for example many contracts on a wide stop).
- **Common mistakes:** Same contract count on every trade regardless of stop distance; sizing up after a loss.
- **Review:** Glossary: Risk Sizing.

### 8. Discipline `discipline` (10 points) NEEDS COACH REVIEW
- **Full marks:** The notes show a plan made before entry, the plan was followed, and the exit matched the plan (target, stop, or a planned trail).
- **Partial:** Mostly followed the plan with one deviation that the student owns in the notes.
- **Zero:** Revenge trade, moved stop wider, exited from emotion, or no plan.
- **Common mistakes:** Cutting winners early from fear; holding losers past the stop; trading outside planned hours.
- **Review:** Glossary: Trade Plan, Moving the Stop, Chasing.

## Output the grader must return

Overall grade (A+ to F), a score for each criterion above, what the student did well, the main mistake, how to fix it, and which lesson or glossary term to review. The exact JSON schema lives in `netlify/functions/_lib/grade-schema.js`.

Every result shows: **Education only, not financial advice.**
