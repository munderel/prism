/**
 * Beeminder-style derail detection for Aims.
 *
 * Analyses recent AimInstance completions against the expected frequency
 * defined by the AimCategory + UserAim overrides — now phase-aware.
 *
 * SEED expects 1x/week → derails only if 0 completions in 2 weeks.
 * SPROUT/GROW/FLOW use the phase-adjusted frequency from aim-phases.ts.
 */

import { getEffectiveFrequency, type UserAimLike as PhaseUserAimLike } from './aim-phases';

export type DerailStatus = 'on_track' | 'caution' | 'derailing';

export interface DerailInfo {
  status: DerailStatus;
  message: string;
  daysUntilDerail: number | null;
  completionRate: number; // 0-1, actual rate over the window
  expectedRate: number; // 0-1, expected rate over the window
}

// ---- Minimal shape contracts so the lib stays decoupled from Prisma ----

interface AimCategoryLike {
  isDaily: boolean;
  defaultFrequency: number;
  defaultDurationMin: number;
}

export interface UserAimLike {
  isActive: boolean;
  customFrequency: number | null;
  customDuration: number | null;
  currentPhase: string;
  phaseStartedAt: Date | string;
  derailSensitivityDays: number;
  aimCategory: AimCategoryLike;
}

interface AimInstanceLike {
  status: string;
  scheduledDate: Date | string;
  completedAt: Date | string | null;
}

// ---- Helpers ----

/** Count distinct calendar dates on which an instance was completed. */
function countCompletedDays(instances: AimInstanceLike[]): number {
  const days = new Set<string>();
  for (const inst of instances) {
    if (inst.status === 'COMPLETED' || inst.completedAt) {
      const d = new Date(inst.scheduledDate);
      days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return days.size;
}

/**
 * Phase-aware expected completions-per-day.
 *
 * Uses getEffectiveFrequency from aim-phases.ts so that:
 * - SEED expects 1x/week (= 1/7 per day)
 * - SPROUT/GROW/FLOW scale appropriately
 * - Daily aims always expect 1/day
 */
function expectedRatePerDay(userAim: UserAimLike): number {
  if (userAim.aimCategory.isDaily) return 1;

  // Build the shape expected by getEffectiveFrequency
  const phaseAim: PhaseUserAimLike = {
    customDuration: userAim.customDuration,
    customFrequency: userAim.customFrequency,
    currentPhase: userAim.currentPhase,
    phaseStartedAt: userAim.phaseStartedAt,
    aimCategory: {
      defaultDurationMin: userAim.aimCategory.defaultDurationMin,
      defaultFrequency: userAim.aimCategory.defaultFrequency,
    },
  };

  const effectiveFreq = getEffectiveFrequency(phaseAim);
  return effectiveFreq / 7;
}

// ---- Main entry point ----

/**
 * Compute derail info for a single aim.
 *
 * @param userAim  The UserAim (with nested aimCategory).
 * @param instances  AimInstances from the analysis window (typically last 14 days).
 * @param windowDays  How many days the window covers (default 14).
 */
export function computeDerailInfo(
  userAim: UserAimLike,
  instances: AimInstanceLike[],
  windowDays = 14,
): DerailInfo {
  if (!userAim.isActive) {
    return {
      status: 'on_track',
      message: 'Aim is paused',
      daysUntilDerail: null,
      completionRate: 0,
      expectedRate: 0,
    };
  }

  const expectedPerDay = expectedRatePerDay(userAim);
  const expectedTotal = expectedPerDay * windowDays;
  const actualCompleted = countCompletedDays(instances);

  const completionRate = expectedTotal > 0 ? actualCompleted / expectedTotal : 1;
  const expectedRate = expectedTotal > 0 ? 1 : 0; // normalised target = 1

  // Apply sensitivity: the higher derailSensitivityDays, the more forgiving.
  // sensitivity of 1 (default) means standard thresholds.
  // sensitivity of 3 means thresholds are relaxed by ~30%.
  const sens = Math.max(1, userAim.derailSensitivityDays);
  const sensitivityMultiplier = 1 - (sens - 1) * 0.1; // e.g. sens=1 -> 1.0, sens=3 -> 0.8
  const cautionThreshold = 0.8 * Math.max(0.3, sensitivityMultiplier);
  const derailThreshold = 0.5 * Math.max(0.3, sensitivityMultiplier);

  let status: DerailStatus;
  let message: string;

  if (completionRate >= cautionThreshold) {
    status = 'on_track';
    message = 'You are on track! Keep it up.';
  } else if (completionRate >= derailThreshold) {
    status = 'caution';
    message = 'Falling behind -- schedule a session soon.';
  } else {
    status = 'derailing';
    message = 'Derailing! Immediate action needed.';
  }

  // Estimate days until derail: how many more zero-completion days before
  // the rolling rate drops below the derail threshold?
  let daysUntilDerail: number | null = null;
  if (status !== 'derailing' && expectedPerDay > 0) {
    // Simulate adding zero-days until rate < derailThreshold
    let simulated = actualCompleted;
    let simWindow = windowDays;
    let extraDays = 0;
    while (extraDays < 60) {
      extraDays++;
      simWindow++;
      const simExpected = expectedPerDay * simWindow;
      const simRate = simulated / simExpected;
      if (simRate < derailThreshold) {
        daysUntilDerail = extraDays;
        break;
      }
    }
  }

  return {
    status,
    message,
    daysUntilDerail,
    completionRate: Math.round(completionRate * 1000) / 1000,
    expectedRate: Math.round(expectedRate * 1000) / 1000,
  };
}

/**
 * Batch-compute derail info for multiple aims.
 *
 * @param aims  Array of { userAim, instances } pairs.
 * @param windowDays  Analysis window size (default 14).
 * @returns Map from userAim.id -> DerailInfo
 */
export function computeAllDerailInfo(
  aims: { userAim: UserAimLike & { id: string }; instances: AimInstanceLike[] }[],
  windowDays = 14,
): Map<string, DerailInfo> {
  const result = new Map<string, DerailInfo>();
  for (const { userAim, instances } of aims) {
    result.set(userAim.id, computeDerailInfo(userAim, instances, windowDays));
  }
  return result;
}
