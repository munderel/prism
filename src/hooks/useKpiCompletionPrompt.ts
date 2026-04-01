'use client';

import { useState, useCallback } from 'react';

interface KpiPromptState {
  processId: string;
  processTitle: string;
}

interface KpiCheckableTask {
  taskType: string;
  processId?: string | null;
  processExecution?: { process?: { title?: string } } | null;
  title?: string;
}

interface KpiCompletionPromptResult {
  kpiPromptState: KpiPromptState | null;
  checkAndPrompt: (task: KpiCheckableTask) => Promise<void>;
  dismiss: () => void;
}

export function useKpiCompletionPrompt(): KpiCompletionPromptResult {
  const [kpiPromptState, setKpiPromptState] = useState<KpiPromptState | null>(
    null
  );

  const checkAndPrompt = useCallback(async (task: KpiCheckableTask) => {
    if (task.taskType !== 'MAINTENANCE' || !task.processId) return;

    try {
      const res = await fetch(`/api/processes/${task.processId}/kpis`);
      if (!res.ok) return;

      const kpis = await res.json();
      if (!Array.isArray(kpis) || kpis.length === 0) return;

      setKpiPromptState({
        processId: task.processId,
        processTitle:
          task.processExecution?.process?.title ?? task.title ?? 'Process',
      });
    } catch {
      // Silently fail -- don't block task completion
    }
  }, []);

  const dismiss = useCallback(() => setKpiPromptState(null), []);

  return { kpiPromptState, checkAndPrompt, dismiss };
}
