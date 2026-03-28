/**
 * Aim Phase System — Research-Backed Habit Building
 *
 * Based on: Atomic Habits (Clear), Tiny Habits (Fogg), Flow Research Collective
 * (Kotler/Doris), The Power of Habit (Duhigg), Self-Determination Theory (Deci/Ryan)
 *
 * Phases: SEED → SPROUT → GROW → FLOW
 */

export type AimPhase = 'SEED' | 'SPROUT' | 'GROW' | 'FLOW';

// Phase multipliers for duration and frequency
const PHASE_MULTIPLIERS: Record<AimPhase, { durationFactor: number; frequencyFactor: number }> = {
  SEED:   { durationFactor: 0.25, frequencyFactor: 0.5  },
  SPROUT: { durationFactor: 0.5,  frequencyFactor: 0.75 },
  GROW:   { durationFactor: 0.75, frequencyFactor: 1.0  },
  FLOW:   { durationFactor: 1.0,  frequencyFactor: 1.0  },
};

// Points earned per aim completion in each phase
const POINTS_PER_COMPLETION: Record<AimPhase, number> = {
  SEED: 2,
  SPROUT: 3,
  GROW: 4,
  FLOW: 5,
};

// Phase graduation criteria
const GRADUATION_CRITERIA: Record<AimPhase, { minCompletions: number; minCompletionRate: number; minWeeks: number } | null> = {
  SEED:   { minCompletions: 5, minCompletionRate: 0, minWeeks: 2 },
  SPROUT: { minCompletions: 0, minCompletionRate: 0.8, minWeeks: 2 },
  GROW:   { minCompletions: 0, minCompletionRate: 0.85, minWeeks: 3 },
  FLOW:   null, // permanent
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

export function getPhaseMultipliers(phase: AimPhase) {
  return PHASE_MULTIPLIERS[phase] || PHASE_MULTIPLIERS.SEED;
}

export function getPointsPerCompletion(phase: AimPhase): number {
  return POINTS_PER_COMPLETION[phase] || 2;
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

  if (phase === 'SEED') {
    const weeksInPhase = Math.floor(
      (Date.now() - new Date(userAim.phaseStartedAt).getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    return Math.min(baseDuration, 5 + weeksInPhase * 5); // 5, 10, 15, 20... capped at full
  }
  if (phase === 'SPROUT') {
    return Math.max(5, Math.round(baseDuration * 0.5));
  }
  if (phase === 'GROW') {
    return Math.max(5, Math.round(baseDuration * 0.75));
  }
  return baseDuration; // FLOW
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

  if (phase === 'SEED') return 1; // Always 1x/week in seed
  if (phase === 'SPROUT') return Math.max(1, Math.ceil(baseFreq * 0.5));
  if (phase === 'GROW') return Math.max(1, Math.ceil(baseFreq * 0.75));
  return baseFreq; // FLOW
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

  // Check minimum time in phase
  const weeksInPhase = (Date.now() - phaseStartedAt.getTime()) / (7 * 24 * 60 * 60 * 1000);
  if (weeksInPhase < criteria.minWeeks) return null;

  // For SEED: check total completions since phase started
  if (currentPhase === 'SEED') {
    const completionsSincePhase = recentInstances.filter(
      (i) => i.status === 'COMPLETED' && i.scheduledDate >= phaseStartedAt
    ).length;
    if (completionsSincePhase >= criteria.minCompletions) {
      return nextPhase;
    }
    return null;
  }

  // For SPROUT/GROW: check completion rate over evaluation period
  const evalWeeks = criteria.minWeeks;
  const evalStart = new Date(Date.now() - evalWeeks * 7 * 24 * 60 * 60 * 1000);
  const evalInstances = recentInstances.filter(
    (i) => i.scheduledDate >= evalStart
  );

  if (evalInstances.length === 0) return null;

  const completedCount = evalInstances.filter((i) => i.status === 'COMPLETED').length;
  const completionRate = completedCount / evalInstances.length;

  if (completionRate >= criteria.minCompletionRate) {
    return nextPhase;
  }

  return null;
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!lastCompletedAt) {
    return { newStreak: 1, streakBroken: false };
  }

  const lastDate = new Date(lastCompletedAt);
  lastDate.setHours(0, 0, 0, 0);

  const daysDiff = Math.floor((today.getTime() - lastDate.getTime()) / (24 * 60 * 60 * 1000));

  if (daysDiff === 0) {
    // Already completed today
    return { newStreak: currentStreak, streakBroken: false };
  }

  if (daysDiff === 1) {
    // Consecutive day
    return { newStreak: currentStreak + 1, streakBroken: false };
  }

  // Gap > 1 day
  if (phase === 'SEED' || phase === 'SPROUT') {
    // In early phases, gaps up to 3 days pause but don't break the streak
    if (daysDiff <= 3) {
      return { newStreak: currentStreak + 1, streakBroken: false };
    }
  }

  // Streak broken
  return { newStreak: 1, streakBroken: true };
}
