/**
 * StreakHeatmap logic unit tests
 *
 * Tests the exported grid builder functions directly to avoid SWR / fake-timer
 * interactions in jsdom.
 *
 * Fixed clock: Wednesday 2026-05-20 09:00 local (America/New_York = EDT in summer).
 * Vitest TZ is pinned to America/New_York in vitest.config.ts.
 *
 * Daily bitmask encoding:
 *   Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64
 *   M–F  = 2+4+8+16+32 = 62
 *   All  = 127
 *
 * Week containing 2026-05-20 (Wed):
 *   Sun 05-17, Mon 05-18, Tue 05-19, Wed 05-20 (today),
 *   Thu 05-21, Fri 05-22, Sat 05-23
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDailyGrid, buildWeeklyGrid } from '../StreakHeatmap';
import type { DayEntry } from '../StreakHeatmap';

// ── Fixed clock ───────────────────────────────────────────────────────────────
// Wednesday 2026-05-20 09:00 EDT = 13:00 UTC
const FIXED_NOW = new Date('2026-05-20T13:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function entry(date: string, completed: boolean): DayEntry {
  return { date, scheduled: completed, completed };
}

// ── buildDailyGrid tests ──────────────────────────────────────────────────────

describe('buildDailyGrid — daily mode', () => {
  it('returns 8 weeks with 7 cells each', () => {
    const grid = buildDailyGrid([], 127, 0);
    expect(grid).toHaveLength(8);
    grid.forEach((week) => expect(week).toHaveLength(7));
  });

  it('completed active weekday → state="completed"', () => {
    // Mon 05-18 is active (M-F bitmask=62) and completed
    const history = [entry('2026-05-18', true)];
    const grid = buildDailyGrid(history, 62, 0);
    const allCells = grid.flat();
    const monCell = allCells.find((c) => c.dateKey === '2026-05-18');
    expect(monCell).toBeDefined();
    expect(monCell!.state).toBe('completed');
  });

  it('missed active weekday (past) → state="missed"', () => {
    // Mon 05-18 is active (M-F bitmask=62) and NOT completed — in the past → missed
    const grid = buildDailyGrid([], 62, 0);
    const allCells = grid.flat();
    const monCell = allCells.find((c) => c.dateKey === '2026-05-18');
    expect(monCell).toBeDefined();
    expect(monCell!.state).toBe('missed');
  });

  it('inactive weekday (Sun/Sat with M-F bitmask) → state="inactive", never "missed"', () => {
    // Sun 05-17 and Sat 05-23 are inactive with M-F bitmask
    const grid = buildDailyGrid([], 62, 0);
    const allCells = grid.flat();

    const sunCell = allCells.find((c) => c.dateKey === '2026-05-17');
    const satCell = allCells.find((c) => c.dateKey === '2026-05-23');

    expect(sunCell?.state).toBe('inactive');
    expect(satCell?.state).toBe('inactive');

    // Verify no inactive cell is ever "missed"
    const inactiveCells = allCells.filter((c) => {
      const dow = new Date(c.dateKey + 'T00:00:00').getDay();
      const bit = 1 << dow;
      return (62 & bit) === 0; // not in M-F mask
    });
    inactiveCells.forEach((c) => {
      expect(c.state).not.toBe('missed');
    });
  });

  it('activeWeekdays=0: all cells are inactive, no missed cells', () => {
    const grid = buildDailyGrid([], 0, 0);
    const allCells = grid.flat();
    const missedCells = allCells.filter((c) => c.state === 'missed');
    expect(missedCells).toHaveLength(0);
    // All non-empty cells should be inactive or future (not missed)
    const nonEmptyCells = allCells.filter((c) => c.state !== 'empty');
    nonEmptyCells.forEach((c) => {
      expect(c.state).toBeOneOf(['inactive', 'future']);
    });
  });

  it('future cells (Thu 05-21, Fri 05-22) → state="future", not "missed"', () => {
    // Even though Thu/Fri are active with M-F mask, they are future
    const grid = buildDailyGrid([], 62, 0);
    const allCells = grid.flat();

    const thuCell = allCells.find((c) => c.dateKey === '2026-05-21');
    const friCell = allCells.find((c) => c.dateKey === '2026-05-22');

    expect(thuCell?.state).toBe('future');
    expect(friCell?.state).toBe('future');
  });

  it('today (Wed 05-20) that is active but not completed → state="missed" (not future)', () => {
    // Today itself: today <= today is NOT strictly >, so today is not "future"
    // And it is an active weekday (Wed) with M-F mask, and no completion → missed
    const grid = buildDailyGrid([], 62, 0);
    const allCells = grid.flat();
    const todayCell = allCells.find((c) => c.dateKey === '2026-05-20');
    expect(todayCell?.state).toBe('missed');
  });

  it('weekOffset increases the page backward in time', () => {
    const grid0 = buildDailyGrid([], 127, 0);
    const grid1 = buildDailyGrid([], 127, 1);
    // The newest date in offset=1 should be older than newest in offset=0
    const latestDate0 = grid0.flat().reduce((max, c) => (c.dateKey > max ? c.dateKey : max), '');
    const latestDate1 = grid1.flat().reduce((max, c) => (c.dateKey > max ? c.dateKey : max), '');
    expect(latestDate1 < latestDate0).toBe(true);
  });

  it('promotes a completed cell to "gold" when the isGoldDay callback returns true', () => {
    // 7 consecutive completed days ending Wed 05-20 (today).
    const history = [
      entry('2026-05-14', true), entry('2026-05-15', true), entry('2026-05-16', true),
      entry('2026-05-17', true), entry('2026-05-18', true), entry('2026-05-19', true),
      entry('2026-05-20', true),
    ];
    // Mark the 7th day as gold.
    const isGoldDay = (key: string) => key === '2026-05-20';
    const grid = buildDailyGrid(history, 127, 0, isGoldDay);
    const cells = grid.flat();
    expect(cells.find((c) => c.dateKey === '2026-05-20')!.state).toBe('gold');
    // Earlier completed days stay 'completed'.
    expect(cells.find((c) => c.dateKey === '2026-05-19')!.state).toBe('completed');
  });

  it('leaves cells as "completed" when isGoldDay is omitted', () => {
    const history = [entry('2026-05-19', true), entry('2026-05-20', true)];
    const grid = buildDailyGrid(history, 127, 0);
    const cells = grid.flat();
    expect(cells.find((c) => c.dateKey === '2026-05-20')!.state).toBe('completed');
  });
});

// ── buildWeeklyGrid tests ─────────────────────────────────────────────────────

describe('buildWeeklyGrid — weekly mode', () => {
  /**
   * ISO week numbering for May 2026 (America/New_York, TZ pinned by vitest):
   *   W20: Sun 05-10 (as tail) + Mon 05-11 to Sun 05-17 — fully in the past.
   *   W21: Mon 05-18 to Sun 05-24 — current (today = Wed 05-20).
   *
   * So "past week" = W20 (Mon 05-11 to Sun 05-17).
   * "current week" = W21 (Mon 05-18 to Sun 05-24).
   */
  function completionsInW20(count: number): DayEntry[] {
    const dates = ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15'];
    return dates.slice(0, count).map((d) => entry(d, true));
  }

  it('returns 8 cells (one per week)', () => {
    const cells = buildWeeklyGrid([], 3, 0);
    expect(cells).toHaveLength(8);
  });

  it('completions === target → state="met" (green)', () => {
    // W20 (past week): 3 completions, target=3 → met
    const history = completionsInW20(3);
    const cells = buildWeeklyGrid(history, 3, 0);
    const w20Cell = cells.find((c) => c.weekKey === '2026-W20');
    expect(w20Cell).toBeDefined();
    expect(w20Cell!.state).toBe('met');
    expect(w20Cell!.completions).toBe(3);
    expect(w20Cell!.target).toBe(3);
  });

  it('completions > target → state="exceeded" (gold)', () => {
    // W20 (past week): 5 completions, target=3 → exceeded
    const history = completionsInW20(5);
    const cells = buildWeeklyGrid(history, 3, 0);
    const w20Cell = cells.find((c) => c.weekKey === '2026-W20');
    expect(w20Cell).toBeDefined();
    expect(w20Cell!.state).toBe('exceeded');
    expect(w20Cell!.completions).toBe(5);
  });

  it('completions < target and weekIsPast → state="missed" (red)', () => {
    // W20 (past week): 2 completions, target=3 → missed
    const history = completionsInW20(2);
    const cells = buildWeeklyGrid(history, 3, 0);
    const w20Cell = cells.find((c) => c.weekKey === '2026-W20');
    expect(w20Cell).toBeDefined();
    expect(w20Cell!.state).toBe('missed');
    expect(w20Cell!.completions).toBe(2);
  });

  it('current week (W21) not yet complete → state="future" (not red)', () => {
    // W21 is the current week (Mon 05-18, today is Wed 05-20)
    // weekIsPast = false (week ends Sun 05-24), 0 completions → future
    const history: DayEntry[] = [];
    const cells = buildWeeklyGrid(history, 3, 0);
    const w21Cell = cells.find((c) => c.weekKey === '2026-W21');
    expect(w21Cell).toBeDefined();
    expect(w21Cell!.state).toBe('future');
  });

  it('target=0 treated as 1 — no division/comparison errors', () => {
    const cells = buildWeeklyGrid([], 0, 0);
    expect(cells).toHaveLength(8);
    // All should be future or missed, never throw
    cells.forEach((c) => {
      expect(['met', 'exceeded', 'missed', 'future']).toContain(c.state);
    });
  });

  it('weekOffset paginates to older weeks', () => {
    const cells0 = buildWeeklyGrid([], 3, 0);
    const cells1 = buildWeeklyGrid([], 3, 1);
    // The most recent week key in page 1 should be older than page 0
    const newest0 = cells0[cells0.length - 1].weekKey;
    const newest1 = cells1[cells1.length - 1].weekKey;
    expect(newest1 < newest0).toBe(true);
  });
});
