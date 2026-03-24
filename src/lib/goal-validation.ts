import { GoalLevel } from '@prisma/client';

export const LEVEL_ORDER: GoalLevel[] = [
  'HIGH_HARD',
  'STRATEGIC',
  'MONTHLY',
  'WEEKLY',
  'DAILY',
];

const VALID_PARENT: Record<GoalLevel, GoalLevel | null> = {
  HIGH_HARD: null,
  STRATEGIC: 'HIGH_HARD',
  MONTHLY: 'STRATEGIC',
  WEEKLY: 'MONTHLY',
  DAILY: 'WEEKLY',
};

const VALID_CHILD: Record<GoalLevel, GoalLevel | null> = {
  HIGH_HARD: 'STRATEGIC',
  STRATEGIC: 'MONTHLY',
  MONTHLY: 'WEEKLY',
  WEEKLY: 'DAILY',
  DAILY: null,
};

export function validateGoalLevel(
  level: GoalLevel | string,
  parentLevel: GoalLevel | string | null
): boolean {
  return VALID_PARENT[level as GoalLevel] === parentLevel;
}

export function getChildLevel(
  parentLevel: GoalLevel | string
): GoalLevel | null {
  return VALID_CHILD[parentLevel as GoalLevel] ?? null;
}

// KPI validation

export const KPI_ALLOWED_LEVELS: GoalLevel[] = ['STRATEGIC', 'MONTHLY', 'WEEKLY'];

export function validateKpiLevel(goalLevel: GoalLevel | string): boolean {
  return KPI_ALLOWED_LEVELS.includes(goalLevel as GoalLevel);
}

export function validateKpiLink(
  weeklyGoalLevel: GoalLevel | string,
  weeklyGoalParentId: string | null,
  monthlyKpiGoalId: string,
  monthlyKpiGoalLevel: GoalLevel | string,
  weeklyKpiType: string,
  monthlyKpiType: string
): boolean {
  if (weeklyGoalLevel !== 'WEEKLY') return false;
  if (monthlyKpiGoalLevel !== 'MONTHLY') return false;
  if (weeklyGoalParentId !== monthlyKpiGoalId) return false;
  if (weeklyKpiType !== monthlyKpiType) return false;
  return true;
}
