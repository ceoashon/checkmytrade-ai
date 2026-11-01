'use strict';
// Mirrors knowledge/derived/rubric.md. Keep ids and weights in sync with that file.
// NEEDS COACH REVIEW: weights and the grade scale are draft proposals.

const CRITERIA = [
  { id: 'timeframe_continuity', name: 'Timeframe Continuity', weight: 15, review: 'Full Timeframe Continuity (FTFC)' },
  { id: 'setup_validity', name: 'Setup Validity', weight: 20, review: 'Candle numbers: 1, 2U, 2D, 3' },
  { id: 'trigger', name: 'Trigger', weight: 15, review: 'Trigger and In Force' },
  { id: 'entry_location', name: 'Entry Location', weight: 10, review: 'Entry and Chasing' },
  { id: 'stop_placement', name: 'Stop Placement', weight: 10, review: 'Stop' },
  { id: 'risk_reward', name: 'Risk to Reward', weight: 10, review: 'Risk to Reward (R:R)' },
  { id: 'risk_sizing', name: 'Risk Sizing', weight: 10, review: 'Risk Sizing' },
  { id: 'discipline', name: 'Discipline', weight: 10, review: 'Trade Plan' },
];

const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

// [minimum score, grade], checked top down.
const SCALE = [
  [97, 'A+'], [93, 'A'], [90, 'A-'],
  [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'],
  [67, 'D+'], [63, 'D'], [60, 'D-'],
  [0, 'F'],
];

function scoreToGrade(score) {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  for (const [min, g] of SCALE) if (s >= min) return g;
  return 'F';
}

function gradeRank(g) {
  const i = GRADES.indexOf(g);
  return i === -1 ? null : GRADES.length - 1 - i; // F = 0, A+ = 12
}

const TOTAL_POINTS = CRITERIA.reduce((a, c) => a + c.weight, 0);

module.exports = { CRITERIA, GRADES, SCALE, scoreToGrade, gradeRank, TOTAL_POINTS };
