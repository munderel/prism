'use client';

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import {
  WorkBlockObjectiveModal,
  type WorkBlockObjectiveInput,
  type WorkBlockObjectivePayload,
} from '@/components/calendar/WorkBlockObjectiveModal';

type BlockStatus = 'PENDING' | 'COMPLETED' | 'PARTIAL' | 'MISSED';

interface WorkBlock {
  id: string;
  start: string;
  end: string;
  mainObjective: string;
  completionStatus: BlockStatus;
  clearGoals: { id: string; text: string; isComplete: boolean }[];
}

const STATUS_STYLES: Record<BlockStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-gray-500/15 text-gray-400' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-500/15 text-emerald-400' },
  PARTIAL: { label: 'Partial', className: 'bg-amber-500/15 text-amber-400' },
  MISSED: { label: 'Missed', className: 'bg-red-500/15 text-red-400' },
};

function formatMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function rangeMinutes(startISO: string, endISO: string): number {
  return Math.max(0, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000));
}

function formatRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const date = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const startT = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endT = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${startT}–${endT}`;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  taskId: string;
  taskTitle: string;
  taskEstimatedMinutes: number;
  defaultBlockMinutes: number;
}

export function WorkBlocksSection({ taskId, taskTitle, taskEstimatedMinutes, defaultBlockMinutes }: Props) {
  const swrKey = `/api/work-blocks?taskId=${taskId}`;
  const { data, isLoading } = useSWR<WorkBlock[]>(swrKey, fetcher, { revalidateOnFocus: false });
  const blocks = Array.isArray(data) ? data : [];

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [modalInput, setModalInput] = useState<WorkBlockObjectiveInput | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const scheduledMinutes = blocks.reduce((acc, b) => {
    const dur = Math.max(0, Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000));
    return acc + dur;
  }, 0);
  const remaining = Math.max(0, taskEstimatedMinutes - scheduledMinutes);

  const openCreate = () => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
    const proposed = remaining > 0 ? Math.min(defaultBlockMinutes, remaining) : defaultBlockMinutes;
    setModalInput({
      taskId,
      taskTitle,
      start: now,
      end: new Date(now.getTime() + proposed * 60000),
      proposedMinutes: proposed,
    });
    setEditingBlockId(null);
    setModalMode('create');
  };

  const openEdit = (block: WorkBlock) => {
    const start = new Date(block.start);
    const end = new Date(block.end);
    const mins = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
    setModalInput({
      taskId,
      taskTitle,
      start,
      end,
      proposedMinutes: mins,
      initialMainObjective: block.mainObjective,
      initialClearGoals: block.clearGoals.map((g) => g.text),
    });
    setEditingBlockId(block.id);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingBlockId(null);
    setModalInput(null);
  };

  const handleSave = async (payload: WorkBlockObjectivePayload) => {
    const isEdit = modalMode === 'edit' && editingBlockId;
    const url = isEdit ? `/api/work-blocks/${editingBlockId}` : '/api/work-blocks';
    const method = isEdit ? 'PATCH' : 'POST';
    const body = isEdit
      ? {
          start: payload.start,
          end: payload.end,
          mainObjective: payload.mainObjective,
          clearGoals: payload.clearGoals,
        }
      : {
          taskId,
          start: payload.start,
          end: payload.end,
          mainObjective: payload.mainObjective,
          clearGoals: payload.clearGoals,
        };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save work block');
    }
    await mutate(swrKey);
    closeModal();
  };

  const handleDelete = async (blockId: string) => {
    if (!confirm('Delete this work block?')) return;
    setDeletingId(blockId);
    try {
      const res = await fetch(`/api/work-blocks/${blockId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await mutate(swrKey);
    } catch {
      // leave row visible — user can retry
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-raised)]/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Work Blocks</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {blocks.length === 0
              ? 'No blocks scheduled yet.'
              : `${formatMinutes(scheduledMinutes)} scheduled · ${formatMinutes(remaining)} unscheduled`}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add block
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!isLoading && blocks.length > 0 && (
        <ul className="space-y-1.5">
          {blocks.map((block) => {
            const style = STATUS_STYLES[block.completionStatus];
            return (
              <li
                key={block.id}
                className="flex items-start gap-2 rounded-md border border-[var(--border-color)] bg-background/40 px-2.5 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      {formatRange(block.start, block.end)}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      · {formatMinutes(rangeMinutes(block.start, block.end))}
                    </span>
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}>
                      {style.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{block.mainObjective}</p>
                  {block.clearGoals.length > 0 && (
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {block.clearGoals.filter((g) => g.isComplete).length}/{block.clearGoals.length} clear goals hit
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(block)}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                    title="Edit block"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(block.id)}
                    disabled={deletingId === block.id}
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-red-400 disabled:opacity-50"
                    title="Delete block"
                  >
                    {deletingId === block.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <WorkBlockObjectiveModal
        open={modalMode !== null}
        input={modalInput}
        mode={modalMode === 'edit' ? 'edit' : 'create'}
        editableStart
        onCancel={closeModal}
        onSave={handleSave}
      />
    </div>
  );
}
