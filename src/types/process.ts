export interface Step {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  sortOrder: number;
}

export interface ProcessData {
  id: string;
  title: string;
  description: string | null;
  cadence: string;
  mode: 'BASIC' | 'ADVANCED';
  subtaskMode: 'PAIRED' | 'UNPAIRED';
  defaultDurationMinutes: number;
  scheduledTime: string | null;
  scheduledDayOfWeek: number | null;
  scheduledDayOfMonth: number | null;
  nextDueAt: string | null;
  assigneeId: string | null;
  delegateId: string | null;
  delegateUntil: string | null;
  assignee: { id: string; name: string | null; email: string } | null;
  delegate: { id: string; name: string | null; email: string } | null;
  _count: { steps: number };
}

export interface BusinessFunction {
  id: string;
  name: string;
  description: string | null;
  processes: ProcessData[];
}

export interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

export interface ProcessFormValues {
  title: string;
  description: string;
  cadence: string;
  assigneeId: string;
  defaultDurationMinutes: number;
  scheduledTime: string;
  scheduledDayOfWeek: number;
  scheduledDayOfMonth: number;
  mode: 'BASIC' | 'ADVANCED';
  subtaskMode: 'PAIRED' | 'UNPAIRED';
}

export const INITIAL_PROCESS_FORM: ProcessFormValues = {
  title: '',
  description: '',
  cadence: 'WEEKLY',
  assigneeId: '',
  defaultDurationMinutes: 60,
  scheduledTime: '',
  scheduledDayOfWeek: 1,
  scheduledDayOfMonth: 1,
  mode: 'BASIC',
  subtaskMode: 'PAIRED',
};
