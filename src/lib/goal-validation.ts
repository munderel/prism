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
  WEEKLY: null, // WEEKLY is now leaf — daily items are tasks, not goals
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

export const KPI_ALLOWED_LEVELS: GoalLevel[] = ['HIGH_HARD', 'STRATEGIC', 'MONTHLY', 'WEEKLY'];

export function validateKpiLevel(goalLevel: GoalLevel | string): boolean {
  return KPI_ALLOWED_LEVELS.includes(goalLevel as GoalLevel);
}

export function validateKpiLink(
  childGoalLevel: GoalLevel | string,
  childGoalParentId: string | null,
  parentKpiGoalId: string,
  parentKpiGoalLevel: GoalLevel | string,
  childKpiType: string,
  parentKpiType: string
): boolean {
  return (
    VALID_PARENT[childGoalLevel as GoalLevel] === parentKpiGoalLevel &&
    childGoalParentId === parentKpiGoalId &&
    childKpiType === parentKpiType
  );
}
