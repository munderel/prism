interface TaskData {
  status: string;
  taskType: string;
  completedAt: Date | string | null;
  failedAt: Date | string | null;
  recurrenceRule: string | null;
  title: string;
}

export interface IndividualReport {
  completionRate: number;
  failureRate: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  byType: { type: string; total: number; completed: number }[];
  streakHistory: { current: number; best: number };
  dailyCompletion: { date: string; completed: number }[];
}

export interface CompanyReport {
  teamCompletion: number;
  perPerson: { name: string; completionRate: number; total: number }[];
  goalProgress: { title: string; progress: number }[];
  leverageAnalysis: { title: string; recurrenceRule: string; frequency: number; suggestion: string }[];
}

export function computeIndividualReport(
  tasks: TaskData[],
  streak: { currentCount: number; bestCount: number } | null
): IndividualReport {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'DONE').length;
  const failed = tasks.filter((t) => t.status === 'DROPPED').length;

  const typeMap = new Map<string, { total: number; completed: number }>();
  for (const t of tasks) {
    const entry = typeMap.get(t.taskType) ?? { total: 0, completed: 0 };
    entry.total++;
    if (t.status === 'DONE') entry.completed++;
    typeMap.set(t.taskType, entry);
  }

  const dailyMap = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === 'DONE' && t.completedAt) {
      const d = new Date(t.completedAt);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    }
  }
  const dailyCompletion = Array.from(dailyMap.entries())
    .map(([date, completed]) => ({ date, completed }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    failureRate: total > 0 ? Math.round((failed / total) * 100) : 0,
    totalTasks: total,
    completedTasks: completed,
    failedTasks: failed,
    byType: Array.from(typeMap.entries()).map(([type, data]) => ({ type, ...data })),
    streakHistory: { current: streak?.currentCount ?? 0, best: streak?.bestCount ?? 0 },
    dailyCompletion,
  };
}

export function computeLeverageAnalysis(maintenanceTasks: TaskData[]): CompanyReport['leverageAnalysis'] {
  const freq = new Map<string, number>();

  for (const t of maintenanceTasks) {
    const count = freq.get(t.title) ?? 0;
    freq.set(t.title, count + 1);
  }

  return Array.from(freq.entries())
    .map(([title, frequency]) => ({
      title,
      recurrenceRule: maintenanceTasks.find((t) => t.title === title)?.recurrenceRule ?? '',
      frequency,
      suggestion: frequency > 20 ? 'Automate' : frequency > 10 ? 'Delegate' : 'Keep',
    }))
    .sort((a, b) => b.frequency - a.frequency);
}
