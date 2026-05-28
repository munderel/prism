import { KpiType } from '@prisma/client';

export interface KpiData {
  id: string;
  goalId: string;
  name: string;
  type: KpiType;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  isComplete: boolean;
  completedAt: string | null;
  sortOrder: number;
  linkedKpiId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyActual {
  weekLabel: string;
  goalId: string;
  goalTitle: string;
  actual: number | null;
  isComplete: boolean;
  hasLinkedKpi: boolean;
}

export interface KpiWithWeeklyActuals extends KpiData {
  linkedWeeklyActuals: WeeklyActual[];
}

export interface CascadedKpi {
  id: string;
  actualValue: number | null;
  isComplete: boolean;
}

export interface KpiCreateInput {
  name: string;
  type: KpiType;
  unit?: string;
  targetValue?: number;
  linkedKpiId?: string;
}

export interface KpiUpdateInput {
  name?: string;
  unit?: string;
  targetValue?: number;
  actualValue?: number;
  isComplete?: boolean;
  sortOrder?: number;
}

export interface KpiNode {
  name: string;
  type: string;
  unit?: string;
  target?: number;
  actual?: number;
  complete?: boolean;
  completed_at?: string;
  linked_to?: string;
}
