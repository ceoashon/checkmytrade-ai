# Strat Trader Indicator Spec

> **STATUS: NOT YET EXTRACTED. SOURCE CODE MISSING.**
>
> The Strat Trader Pine Script was not in this repository, in Google Drive, or on a connected computer when this file was generated. The instructions for this project say "Do not guess," so this spec contains **no claims about how Strat Trader behaves.** Every section below is an empty slot that must be filled from the code, with a line reference for every claim.
>
> To fill it in: add the `.pine` file to `knowledge/indicator/`, then ask Claude to "complete Step 2 of the CheckMyTrade build" (see `OPEN_QUESTIONS.md`, item 1).

## How this file is used

- The grader sends this file to the model on every grading request (it is prompt cached).
- While this file is in the NOT YET EXTRACTED state, the grader is instructed to grade from candle structure, the trade details the student typed, and the glossary only, and to never assert what a Strat Trader line, label, or color means.

## Required sections (fill from code, cite `strat-trader.pine:LINE` for every claim)

### 1. User settings and defaults
| Setting (input title) | Variable | Type | Default | Options / range | Line |
|---|---|---|---|---|---|
| _pending_ | | | | | |

### 2. Candle classification
For each state, quote the exact condition from the code.
| State | Condition in code | Line | Notes (ties, equal highs/lows, gaps) |
|---|---|---|---|
| 1 (inside bar) | _pending_ | | |
| 2U | _pending_ | | |
| 2D | _pending_ | | |
| 3 (outside bar) | _pending_ | | |
| Failed 2U / Failed 2D | _pending_ | | |
| Any other state the code detects | _pending_ | | |

### 3. Higher timeframes, continuity, flip lines and levels
- Which timeframes are requested (`request.security` calls) and with what lookahead setting: _pending_
- How timeframe continuity / FTFC is computed (open vs current price, which TFs): _pending_
- Flip lines or levels, how they are calculated and when they reset: _pending_

### 4. Entries, triggers, stops, targets, trailing logic, exits
| Element | Long rule | Short rule | Line |
|---|---|---|---|
| Setup detection | _pending_ | | |
| Trigger | _pending_ | | |
| Entry price | _pending_ | | |
| Stop | _pending_ | | |
| Target(s) | _pending_ | | |
| Trailing logic | _pending_ | | |
| Exit / invalidation | _pending_ | | |

### 5. Plotted lines, labels, colors, shapes, tables
| Object | Created by (`plot`, `line.new`, `label.new`, `plotshape`, `table.new`, `bgcolor`, `barcolor`) | Color | When it appears | Meaning | Line |
|---|---|---|---|---|---|
| _pending_ | | | | | |

### 6. Alert conditions
| Alert title | Condition | Message | Line |
|---|---|---|---|
| _pending_ | | | |

### 7. Unclear code
Quote any lines whose intent is ambiguous and explain the ambiguity. _pending_
