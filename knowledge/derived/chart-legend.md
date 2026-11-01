# Chart Legend: Reading a Strat Trader Chart

> **STATUS: NOT YET EXTRACTED. SOURCE CODE MISSING.**
>
> This legend must be written from `knowledge/derived/indicator-spec.md`, which is itself waiting on the Strat Trader Pine Script. Until then, this file tells the grading model how to behave safely.

## Instructions for an AI model reading a screenshot (current, temporary)

1. **Do not assign Strat Trader meaning to any color, line, label, shape, or table on the chart.** The indicator's legend has not been extracted from the code yet, so any guess could teach a student the wrong thing.
2. You may read **plain price structure** from the candles themselves: candle highs, lows, opens, closes, and how each candle relates to the one before it (inside, directional up, directional down, outside). Use the definitions in `glossary.md`.
3. You may read text that is printed on the chart (for example a ticker, a timeframe, a price scale value, or a label's literal text). Report literal text as literal text, without interpreting what the indicator meant by it.
4. When the screenshot is unclear, too small, or cropped, say so plainly and lean on the trade details the student typed.
5. When a judgment depends on what an indicator element means, note "Strat Trader legend pending coach upload" in your feedback instead of guessing.

## Sections to fill once the spec exists

- Candle numbers and labels (where the 1, 2U, 2D, 3 labels sit, their colors)
- Bar colors and background colors
- Higher timeframe levels and continuity table (what each row, color, and arrow means)
- Flip lines and key levels
- Entry, trigger, stop, and target lines (colors, styles, when they extend or delete)
- Signal shapes (triangles, arrows, circles) and when they print
- What a chart looks like for a valid long setup, a valid short setup, and an invalidated setup
- Common misreads (for example a repainting higher timeframe candle that has not closed)
