/**
 * Aim Phase System — Research-Backed Habit Building
 *
 * Phases: SEED -> SPROUT -> GROW -> FLOW
 */

export type AimPhase = 'SEED' | 'SPROUT' | 'GROW' | 'FLOW';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

const POINTS_PER_COMPLETION: Record<AimPhase, number> = {
  SEED: 2,
  SPROUT: 3,
  GROW: 4,
  FLOW: 5,
};

const GRADUATION_CRITERIA: Record<AimPhase, { minCompletions: number; minCompletionRate: number; minWeeks: number } | null> = {
  SEED:   { minCompletions: 5, minCompletionRate: 0, minWeeks: 2 },
  SPROUT: { minCompletions: 0, minCompletionRate: 0.8, minWeeks: 2 },
  GROW:   { minCompletions: 0, minCompletionRate: 0.85, minWeeks: 3 },
  FLOW:   null,
};

const NEXT_PHASE: Record<AimPhase, AimPhase | null> = {
  SEED: 'SPROUT',
  SPROUT: 'GROW',
  GROW: 'FLOW',
  FLOW: null,
};

export const PHASE_ORDER: AimPhase[] = ['SEED', 'SPROUT', 'GROW', 'FLOW'];

export const PHASE_LABELS: Record<AimPhase, { label: string; description: string }> = {
  SEED:   { label: 'Seed',   description: 'Building the habit' },
  SPROUT: { label: 'Sprout', description: 'Getting stronger' },
  GROW:   { label: 'Grow',   description: 'Almost automatic' },
  FLOW:   { label: 'Flow',   description: 'In flow' },
};

export function getPointsPerCompletion(phase: AimPhase): number {
  return POINTS_PER_COMPLETION[phase];
}

export interface UserAimLike {
  customDuration: number | null;
  customFrequency: number | null;
  currentPhase: string;
  phaseStartedAt: string | Date;
  aimCategory: {
    defaultDurationMin: number;
    defaultFrequency: number;
  };
}

/**
 * Get the effective duration for an aim based on its current phase.
 *
 * SEED: starts at 5 min, ramps +5 min each week in phase (capped at full target).
 * SPROUT: 50% of target duration.
 * GROW: 75% of target duration.
 * FLOW: full target duration.
 */
export function getEffectiveDuration(userAim: UserAimLike): number {
  const baseDuration = userAim.customDuration ?? userAim.aimCategory.defaultDurationMin;
  const phase = userAim.currentPhase as AimPhase;

  switch (phase) {
    case 'SEED': {
      const weeksInPhase = Math.floor(
        (Date.now() - new Date(userAim.phaseStartedAt).getTime()) / MS_PER_WEEK,
      );
      return Math.min(baseDuration, 5 + weeksInPhase * 5);
    }
    case 'SPROUT':
      return Math.max(5, Math.round(baseDuration * 0.5));
    case 'GROW':
      return Math.max(5, Math.round(baseDuration * 0.75));
    case 'FLOW':
      return baseDuration;
  }
}

/**
 * Get the effective frequency for an aim based on its current phase.
 *
 * SEED: always 1x/week regardless of target.
 * SPROUT: 50% of target (min 1).
 * GROW: 75% of target (min 1).
 * FLOW: full target frequency.
 */
export function getEffectiveFrequency(userAim: UserAimLike): number {
  const baseFreq = userAim.customFrequency ?? userAim.aimCategory.defaultFrequency;
  const phase = userAim.currentPhase as AimPhase;

  switch (phase) {
    case 'SEED':
      return 1;
    case 'SPROUT':
      return Math.max(1, Math.ceil(baseFreq * 0.5));
    case 'GROW':
      return Math.max(1, Math.ceil(baseFreq * 0.75));
    case 'FLOW':
      return baseFreq;
  }
}

interface AimInstanceLike {
  status: string;
  scheduledDate: Date;
}

/**
 * Evaluate whether an aim should graduate to the next phase.
 * Returns the new phase if graduation criteria are met, null otherwise.
 */
export function evaluatePhaseGraduation(
  currentPhase: AimPhase,
  phaseStartedAt: Date,
  completionCount: number,
  recentInstances: AimInstanceLike[],
): AimPhase | null {
  const criteria = GRADUATION_CRITERIA[currentPhase];
  if (!criteria) return null; // FLOW is permanent

  const nextPhase = NEXT_PHASE[currentPhase];
  if (!nextPhase) return null;

  const weeksInPhase = (Date.now() - phaseStartedAt.getTime()) / MS_PER_WEEK;
  if (weeksInPhase < criteria.minWeeks) return null;

  // SEED: check total completions since phase started
  if (currentPhase === 'SEED') {
    const completionsSincePhase = recentInstances.filter(
      (i) => i.status === 'COMPLETED' && i.scheduledDate >= phaseStartedAt,
    ).length;
    return completionsSincePhase >= criteria.minCompletions ? nextPhase : null;
  }

  // SPROUT/GROW: check completion rate over evaluation period
  const evalStart = new Date(Date.now() - criteria.minWeeks * MS_PER_WEEK);
  const evalInstances = recentInstances.filter((i) => i.scheduledDate >= evalStart);
  if (evalInstances.length === 0) return null;

  const completedCount = evalInstances.filter((i) => i.status === 'COMPLETED').length;
  const completionRate = completedCount / evalInstances.length;
  return completionRate >= criteria.minCompletionRate ? nextPhase : null;
}

/**
 * Calculate the streak update for an aim completion.
 * Returns { newStreak, streakBroken } based on lastCompletedAt.
 */
export function calculateAimStreak(
  currentStreak: number,
  lastCompletedAt: Date | null,
  phase: AimPhase,
): { newStreak: number; streakBroken: boolean } {
  if (!lastCompletedAt) {
    return { newStreak: 1, streakBroken: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDate = new Date(lastCompletedAt);
  lastDate.setHours(0, 0, 0, 0);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / MS_PER_DAY);

  // Already completed today
  if (daysDiff === 0) {
    return { newStreak: currentStreak, streakBroken: false };
  }

  // Consecutive day, or early phases allow gaps up to 3 days
  const isEarlyPhase = phase === 'SEED' || phase === 'SPROUT';
  if (daysDiff === 1 || (isEarlyPhase && daysDiff <= 3)) {
    return { newStreak: currentStreak + 1, streakBroken: false };
  }

  return { newStreak: 1, streakBroken: true };
}
