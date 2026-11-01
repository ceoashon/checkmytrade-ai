# TheStrat Glossary

> **STATUS: PROVISIONAL DRAFT. NEEDS COACH REVIEW.**
>
> The study notes and the Strat Trader code were not available when this was written. Every definition below comes from general, publicly taught TheStrat theory (Rob Smith), written by the assistant so the app can run end to end. None of it has been checked against your notes yet. When your notes arrive, each entry gets a `Source:` line pointing to the notes or the indicator spec, and anything that disagrees is logged in `conflicts.md`.
>
> Entries marked **[Strat Trader]** describe something the indicator is expected to show. How the indicator actually does it must come from `indicator-spec.md`.

## Candle types (the numbers)

**1 (Inside Bar)**
A candle whose high is lower than or equal to the previous candle's high AND whose low is higher than or equal to the previous candle's low. It traded entirely within the prior candle's range. It signals consolidation or balance, and it often sets up the next move: a break of its high or low is a common trigger.
_Lesson to review: Candle numbers. NEEDS COACH REVIEW: how ties (equal highs or lows) are treated._

**2U (Two Up, Directional Up)**
A candle that takes out the previous candle's high but does not take out its low. Buyers pushed price into new territory above the prior range.

**2D (Two Down, Directional Down)**
A candle that takes out the previous candle's low but does not take out its high. Sellers pushed price into new territory below the prior range.

**3 (Outside Bar)**
A candle that takes out both the previous candle's high and its low. It shows broadening, both sides were active, and it often marks volatility or a turning point.

**Failed 2 (Failed 2U / Failed 2D)**
A 2U that breaks the prior high but then reverses and trades back down (commonly closing red or back inside the prior range) is a failed 2U, a bearish signal. A 2D that breaks the prior low and then reverses up is a failed 2D, a bullish signal.
_NEEDS COACH REVIEW: the exact condition (close color, close back inside the prior range, or opposite side trigger) varies by teacher and by indicator._

## Scenarios and combos

**The three scenarios**
Every candle is a 1, a 2, or a 3 relative to the candle before it. Strat setups are named by the sequence of these numbers.

**2-1-2 Reversal**
A 2 in one direction, an inside bar, then a 2 in the opposite direction (for example 2D, 1, 2U). The trigger is the break of the inside bar in the new direction.

**2-1-2 Continuation**
A 2, an inside bar, then a 2 in the same direction (for example 2U, 1, 2U).

**3-1-2**
An outside bar, an inside bar, then a 2 breaking out of the inside bar. Often considered a strong setup because the inside bar forms after a broadening candle.

**2-2 Reversal**
A 2 in one direction followed immediately by a 2 in the opposite direction (for example 2D then 2U). The second candle triggers when it takes out the first candle's opposite extreme.

**1-2-2 RevStrat (Reversal Strat)**
An inside bar, a 2 that breaks one side of it, then a 2 that reverses through the other side.

**3-2-2 Reversal**
An outside bar, a 2, then a 2 in the opposite direction.

## Timeframes and continuity

**Timeframe Continuity (TFC)**
Whether price is trading above (green) or below (red) the open of each timeframe's current candle. When several timeframes all agree, the market is said to be in continuity in that direction.

**Full Timeframe Continuity (FTFC)**
All of the timeframes you track (for example monthly, weekly, daily, and the trading timeframe) are green, or all are red. Trading in the direction of FTFC is the core filter in TheStrat.
_NEEDS COACH REVIEW: which timeframes Solomon's Circle requires for futures day trading._ **[Strat Trader]** _the timeframes the indicator checks come from the spec._

**Higher Timeframe (HTF)**
A timeframe larger than the one you enter on. HTF candles give the context; lower timeframes give the entry.

**In Force**
A setup is in force when the trigger level has been taken out and price is moving toward the target. A setup that has not triggered is not in force.

## Execution terms

**Trigger**
The price level whose break activates a setup, usually the high (for longs) or low (for shorts) of the setup candle, often an inside bar.

**Entry**
The price where you actually get filled. A disciplined Strat entry is at or very near the trigger, not after price has run far from it.

**Stop**
The level where the setup is proven wrong, usually just beyond the opposite side of the setup candle (for example below the inside bar's low on a long).
_NEEDS COACH REVIEW: preferred stop placement for Solomon's Circle._

**Target**
The level where you plan to take profit. In TheStrat the first target is commonly the previous candle's opposite extreme or the next key level in the direction of the trade (magnitude).

**Magnitude**
The distance to the next logical target level, such as the previous candle's high or low or a higher timeframe level.

**Risk to Reward (R:R)**
The distance from entry to target divided by the distance from entry to stop. 2:1 means you aim to make twice what you risk.

**Risk Sizing**
Choosing position size so that if the stop is hit, the loss is a fixed, small share of the account (for example 1 percent). In futures this means choosing the number of contracts from the stop distance and the instrument's tick value.

## Patterns and context

**Broadening Formation**
A pattern of higher highs and lower lows, like a megaphone. TheStrat sees the market as broadening over time, and edges of the broadening formation act as targets.

**Hammer**
A candle with a long lower wick and a small body near the top, showing rejection of lower prices. An actionable bullish signal at a key level.

**Shooter (Shooting Star)**
A candle with a long upper wick and a small body near the bottom, showing rejection of higher prices. An actionable bearish signal at a key level.

**Actionable Signal**
A candle that gives a clear, tradable trigger level, such as an inside bar, a hammer, or a shooter.

**Exhaustion**
A move that has extended far in one direction and starts to stall, often shown by failed 2s or rejection wicks.

## Discipline terms

**Trade Plan**
Entry, stop, target, and size decided before entering, written down.

**Chasing**
Entering after price has already moved far beyond the trigger, which worsens the stop distance and risk to reward.

**Moving the Stop**
Widening a stop after entry to avoid being stopped out. Treated as a discipline mistake. Tightening or trailing a stop by plan is not.
