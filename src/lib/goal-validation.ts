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
