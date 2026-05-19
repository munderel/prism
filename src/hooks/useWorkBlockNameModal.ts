'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  WorkBlockObjectiveInput,
  WorkBlockObjectivePayload,
  WorkBlockNameRequest,
  WorkBlockNameResolved,
} from '@/components/calendar/WorkBlockObjectiveModal';
import { fetchTaskWorkBlockHints } from '@/lib/work-blocks-client';

interface UseWorkBlockNameModalResult {
  /** Pass to `<CalendarSplitView onRequestNameWorkBlock={openAndAwait}>` so drops open the modal. */
  openAndAwait: (input: WorkBlockNameRequest) => Promise<WorkBlockNameResolved | null>;
  /** Spread onto `<WorkBlockObjectiveModal {...modalProps} />` at top level. */
  modalProps: {
    open: boolean;
    input: WorkBlockObjectiveInput | null;
    mode: 'create';
    onCancel: () => void;
    onSave: (payload: WorkBlockObjectivePayload) => void;
  };
}

/**
 * Host the shared naming modal alongside a calendar drag-to-create flow.
 * The returned `openAndAwait` opens the modal, waits for save/cancel, and
 * resolves a payload (or `null` when cancelled) so the caller can POST the
 * workblock with the user's chosen name + clear goals.
 */
export function useWorkBlockNameModal(): UseWorkBlockNameModalResult {
  const [input, setInput] = useState<WorkBlockObjectiveInput | null>(null);
  const resolveRef = useRef<((payload: WorkBlockNameResolved | null) => void) | null>(null);

  const openAndAwait = useCallback(async (request: WorkBlockNameRequest) => {
    if (resolveRef.current) {
      resolveRef.current(null);
      resolveRef.current = null;
    }
    const hints = await fetchTaskWorkBlockHints(request.taskId);
    return new Promise<WorkBlockNameResolved | null>((resolve) => {
      resolveRef.current = resolve;
      setInput({
        ...request,
        taskDeliverable: request.taskDeliverable ?? hints.deliverable,
        taskLevelClearGoals: hints.clearGoals,
      });
    });
  }, []);

  const onSave = useCallback((payload: WorkBlockObjectivePayload) => {
    resolveRef.current?.({
      start: new Date(payload.start),
      end: new Date(payload.end),
      mainObjective: payload.mainObjective,
      clearGoals: payload.clearGoals,
    });
    resolveRef.current = null;
    setInput(null);
  }, []);

  const onCancel = useCallback(() => {
    resolveRef.current?.(null);
    resolveRef.current = null;
    setInput(null);
  }, []);

  return {
    openAndAwait,
    modalProps: { open: !!input, input, mode: 'create', onCancel, onSave },
  };
}
