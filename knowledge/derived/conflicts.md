# Conflicts: Study Notes vs Strat Trader Code

> **STATUS: CANNOT RUN YET.** Both inputs (the study notes and the Pine Script) are missing, so there is nothing to compare. No conflicts have been resolved, silently or otherwise.

## Rules for resolving (from the project brief)

- For **Strat Trader behavior** (what the indicator plots, how it calculates levels, entries, stops, and targets), **the code wins.**
- For **general theory** (what a setup means, how to trade it, discipline), **the notes win.**
- Every item below is flagged for coach review even when the rule above decides it.

## Conflict log

| # | Topic | Study notes say (file:section) | Code does (strat-trader.pine:line) | Which wins by rule | Coach decision |
|---|---|---|---|---|---|
| _none yet_ | | | | | |

## Code behavior the notes never explain

| # | Code behavior (line) | Why it matters for grading | Coach decision |
|---|---|---|---|
| _none yet_ | | | |

## Glossary entries written without your materials

Every entry in `glossary.md` is currently provisional. Once the notes arrive, each one is checked and either gets a `Source:` line or becomes a row in the conflict log above.

## Checklist of places where Strat indicators and Strat notes commonly disagree

Check each of these first when the files arrive:

1. **Equal highs or lows.** Does the code count an equal high as "taking out" the prior high? Does a candle with an equal high and a higher low count as a 1?
2. **Failed 2 definition.** Close color, close back inside the prior range, or opposite side trigger?
3. **Which timeframes make up FTFC**, and whether the current, unclosed higher timeframe candle is used (repainting).
4. **Continuity reference.** Open of the current candle vs prior close.
5. **Trigger price.** Exactly at the inside bar high or low, or one tick beyond?
6. **Stop placement.** Opposite side of the setup candle, of the trigger candle, or a fixed tick buffer?
7. **Targets.** Previous candle extreme, higher timeframe levels, or fixed R multiples?
8. **Session handling for futures.** Overnight vs regular trading hours candles, and which session open is used for continuity.
9. **Labels that the notes never mention** (any custom pattern names in the code).
10. **Alerts** that fire on unclosed bars.
