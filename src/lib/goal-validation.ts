import { GoalLevel } from '@prisma/client';

export const LEVEL_ORDER: GoalLevel[] = [
  'HIGH_HARD',
  'STRATEGIC',
  'MONTHLY',
  'WEEKLY',
  'DAILY',
];

// Parent rules: each level lists which parent levels are valid.
// null means "can be a standalone root goal".
const VALID_PARENTS: Record<GoalLevel, (GoalLevel | null)[]> = {
  HIGH_HARD: [null],
  STRATEGIC: ['HIGH_HARD'],
  MONTHLY: ['STRATEGIC', null],   // standalone root for short-duration goals
  WEEKLY: ['MONTHLY', null],      // standalone root for very short goals
  DAILY: ['WEEKLY'],
};

const VALID_CHILDREN: Record<GoalLevel, GoalLevel[]> = {
  HIGH_HARD: ['STRATEGIC'],
  STRATEGIC: ['MONTHLY'],
  MONTHLY: ['WEEKLY'],
  WEEKLY: [],  // WEEKLY is leaf — daily items are tasks, not goals
  DAILY: [],
};

export function validateGoalLevel(
  level: GoalLevel | string,
  parentLevel: GoalLevel | string | null
): boolean {
  const allowed = VALID_PARENTS[level as GoalLevel];
  if (!allowed) return false;
  return allowed.includes(parentLevel as GoalLevel | null);
}

export function getChildLevel(
  parentLevel: GoalLevel | string
): GoalLevel | null {
  const children = VALID_CHILDREN[parentLevel as GoalLevel];
  return children?.[0] ?? null;
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
  const allowed = VALID_PARENTS[childGoalLevel as GoalLevel];
  return (
    allowed?.includes(parentKpiGoalLevel as GoalLevel) === true &&
    childGoalParentId === parentKpiGoalId &&
    childKpiType === parentKpiType
  );
}
