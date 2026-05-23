'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { freshFetcher } from '@/lib/fetcher';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence } from 'framer-motion';
import React from 'react';
import { GoalCard } from './GoalCard';
import { GoalEditor } from './GoalEditor';
import { KpiSidebar } from './KpiSidebar';
import { TaskCardInline } from './TaskCardInline';
import { TaskEditor } from '../tasks/TaskEditor';
import { ConfirmDialog } from '../ui/ConfirmDialog';

/** Lightweight Goal shape matching the API response used in this tree */
interface GoalTreeItem {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: string;
  progressPct: number;
  parentId: string | null;
  startDate: string | null;
  endDate: string | null;
  stackId: string;
  sortOrder: number;
  isAssignedToMe?: boolean;
  tasks?: TaskTreeItem[];
  children?: GoalTreeItem[];
}

/** Lightweight Task shape matching the API response used in this tree */
interface TaskTreeItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  goalId: string | null;
  isWinTheDay?: boolean;
}

interface GoalStackTreeProps {
  stackId: string;
  isCompanyStack: boolean;
  isAdmin: boolean;
  showInProgress?: boolean;
  showDueToday?: boolean;
  /** When true, only show goals where isAssignedToMe is true (company stacks only). */
  mineFilter?: boolean;
}

interface FlatItem {
  type: 'goal' | 'task';
  goal?: GoalTreeItem;
  task?: TaskTreeItem;
  depth: number;
  id: string;
}

function flattenTree(goals: GoalTreeItem[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const goal of goals) {
    // Skip DAILY goals (they've been migrated to tasks)
    if (goal.level === 'DAILY') continue;

    result.push({ type: 'goal', goal, depth, id: goal.id });

    // For WEEKLY goals, inject linked tasks as children
    if (goal.level === 'WEEKLY' && goal.tasks?.length) {
      for (const task of goal.tasks) {
        result.push({ type: 'task', task, depth: depth + 1, id: `task-${task.id}` });
      }
    }

    if (goal.children?.length) {
      result.push(...flattenTree(goal.children, depth + 1));
    }
  }
  return result;
}

const SortableGoalCard = React.memo(function SortableGoalCard({
  item,
  onEdit,
  onDelete,
  onAddChild,
  onAddTask,
  onStatusChange,
  onKpiClick,
}: {
  item: FlatItem;
  onEdit: (goal: GoalTreeItem) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (goal: GoalTreeItem) => void;
  onAddTask: (goalId: string) => void;
  onStatusChange: (goalId: string, status: string) => void;
  onKpiClick: (goal: GoalTreeItem) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  };

  // Connector line colors per depth
  const connectorColors = [
    'border-purple-500/20',
    'border-violet-500/20',
    'border-indigo-500/20',
    'border-cyan-500/20',
    'border-gray-500/15',
  ];

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {item.depth > 0 && (
        <div
          className={`absolute left-0 top-0 bottom-0 border-l-2 border-dashed ${connectorColors[Math.min(item.depth - 1, connectorColors.length - 1)]}`}
          style={{ marginLeft: `${(item.depth - 1) * 24 + 11}px` }}
        />
      )}
      <GoalCard
        goal={item.goal}
        depth={item.depth}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddChild={onAddChild}
        onAddTask={onAddTask}
        onStatusChange={onStatusChange}
        onKpiClick={onKpiClick}
      />
    </div>
  );
});

export function GoalStackTree({
  stackId,
  isCompanyStack: _isCompanyStack,
  isAdmin: _isAdmin,
  showInProgress,
  showDueToday,
  mineFilter,
}: GoalStackTreeProps) {
  const { data: goalsData, isLoading, mutate: mutateGoals } = useSWR(`/api/goals?stackId=${stackId}`);
  const { mutate: globalMutate } = useSWRConfig();

  const flatItems = useMemo(() => {
    const data = Array.isArray(goalsData) ? goalsData : [];
    // Build tree from flat list
    const map = new Map<string, GoalTreeItem>();
    for (const g of data) {
      map.set(g.id, { ...g, children: [] });
    }
    const roots: GoalTreeItem[] = [];
    for (const g of data) {
      const node = map.get(g.id)!;
      if (g.parentId && map.has(g.parentId)) {
        map.get(g.parentId)!.children!.push(node);
      } else if (!g.parentId) {
        roots.push(node);
      }
    }

    // Filter: Mine — for company stacks, show only goals where isAssignedToMe is true.
    // We filter roots before flattening so the whole subtree of a non-matching root is hidden.
    // A root goal is "mine" if it or any of its descendants is assigned to me.
    function isGoalOrDescendantMine(goal: GoalTreeItem): boolean {
      if (goal.isAssignedToMe) return true;
      return (goal.children ?? []).some(isGoalOrDescendantMine);
    }
    const filteredRoots = mineFilter
      ? roots.filter(isGoalOrDescendantMine)
      : roots;

    let items = flattenTree(filteredRoots);

    // Filter: In Progress — show only goals whose status is IN_PROGRESS
    if (showInProgress) {
      const inProgressGoalIds = new Set(
        items
          .filter((i) => i.type === 'goal' && i.goal?.status === 'IN_PROGRESS')
          .map((i) => i.goal!.id)
      );
      items = items.filter((item) => {
        if (item.type === 'task') {
          return item.task?.goalId && inProgressGoalIds.has(item.task.goalId);
        }
        return item.goal?.status === 'IN_PROGRESS';
      });
    }

    // Filter: Due Today — show goals/tasks due today or overdue
    if (showDueToday) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      items = items.filter((item) => {
        if (item.type === 'task') {
          const due = item.task?.dueDate ? new Date(item.task.dueDate) : null;
          return due && due <= today && item.task?.status !== 'DONE';
        }
        const goal = item.goal;
        const due = goal?.endDate ? new Date(goal.endDate) : null;
        return due && due <= today && goal?.status !== 'COMPLETED' && goal?.status !== 'ABANDONED';
      });
    }

    return items;
  }, [goalsData, showInProgress, showDueToday]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    parentGoal?: GoalTreeItem;
    goal?: GoalTreeItem;
  }>({ open: false });
  const [taskEditorState, setTaskEditorState] = useState<{
    open: boolean;
    goalId?: string;
    task?: TaskTreeItem;
  }>({ open: false });
  const [selectedGoalForKpi, setSelectedGoalForKpi] = useState<GoalTreeItem | null>(null);
  const [confirmState, setConfirmState] = useState<
    | { kind: 'goal'; goalId: string }
    | { kind: 'task'; taskId: string }
    | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Only reorder goals, not tasks
    const activeItem = flatItems.find((f) => f.id === active.id);
    if (!activeItem || activeItem.type !== 'goal') return;

    const goalItems = flatItems.filter((f) => f.type === 'goal');
    const activeIndex = goalItems.findIndex((f) => f.id === active.id);
    const overIndex = goalItems.findIndex((f) => f.id === over.id);
    if (activeIndex === -1 || overIndex === -1) return;

    try {
      await fetch(`/api/goals/${active.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: overIndex }),
      });
      await mutateGoals();
    } catch {
      await mutateGoals();
    }
  }, [flatItems, mutateGoals]);

  const handleDelete = useCallback((goalId: string) => {
    setConfirmState({ kind: 'goal', goalId });
  }, []);

  const performGoalDelete = useCallback(async (goalId: string) => {
    await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
    mutateGoals(freshFetcher(`/api/goals?stackId=${stackId}`), { revalidate: false });
    globalMutate('/api/stacks');
  }, [mutateGoals, stackId, globalMutate]);

  const handleEdit = useCallback((goal: GoalTreeItem) => {
    setEditorState({ open: true, goal });
  }, []);

  const handleAddChild = useCallback((parentGoal: GoalTreeItem) => {
    setEditorState({ open: true, parentGoal });
  }, []);

  const handleAddTask = useCallback((goalId: string) => {
    setTaskEditorState({ open: true, goalId });
  }, []);

  const handleTaskToggle = useCallback(async (task: TaskTreeItem) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';

    // Optimistic update: immediately toggle in local SWR data
    const optimisticData = (current: any) => {
      if (!Array.isArray(current)) return current;
      return current.map((goal: any) => ({
        ...goal,
        tasks: goal.tasks?.map((t: any) =>
          t.id === task.id ? { ...t, status: newStatus } : t
        ),
      }));
    };

    mutateGoals(
      async (_current: any) => {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        return freshFetcher(`/api/goals?stackId=${stackId}`);
      },
      { optimisticData, revalidate: false, rollbackOnError: true },
    );
  }, [mutateGoals, stackId]);

  const handleTaskEdit = useCallback((task: TaskTreeItem) => {
    setTaskEditorState({ open: true, task });
  }, []);

  const handleTaskDelete = useCallback((taskId: string) => {
    setConfirmState({ kind: 'task', taskId });
  }, []);

  const performTaskDelete = useCallback(async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    mutateGoals(freshFetcher(`/api/goals?stackId=${stackId}`), { revalidate: false });
  }, [mutateGoals, stackId]);

  const handleStatusChange = useCallback(async (goalId: string, status: string) => {
    await fetch(`/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    mutateGoals(freshFetcher(`/api/goals?stackId=${stackId}`), { revalidate: false });
    globalMutate('/api/stacks');
  }, [mutateGoals, stackId, globalMutate]);

  const handleKpiClick = useCallback((goal: GoalTreeItem) => {
    setSelectedGoalForKpi((prev: GoalTreeItem | null) => prev?.id === goal.id ? null : goal);
  }, []);

  const handleAddRoot = useCallback(() => {
    setEditorState({ open: true });
  }, []);

  const handleEditorSave = useCallback(() => {
    setEditorState({ open: false });
    // Pass a fresh fetch to mutate so it bypasses SWR's dedupingInterval
    mutateGoals(freshFetcher(`/api/goals?stackId=${stackId}`), { revalidate: false });
    globalMutate('/api/stacks');
  }, [mutateGoals, stackId, globalMutate]);

  const handleTaskEditorSave = useCallback(async () => {
    setTaskEditorState({ open: false });
    // Await fresh fetch then revalidate to ensure new tasks appear immediately
    await mutateGoals(freshFetcher(`/api/goals?stackId=${stackId}`), { revalidate: true });
    globalMutate('/api/stacks');
  }, [mutateGoals, stackId, globalMutate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[var(--text-muted)]">Loading goals...</div>
      </div>
    );
  }

  // Only goal IDs for sortable context (tasks are not sortable in the dnd context)
  const sortableIds = flatItems.filter((f) => f.type === 'goal').map((f) => f.id);

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="mb-4 flex justify-end">
          <button
            onClick={handleAddRoot}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            + New Root Goal
          </button>
        </div>

        {flatItems.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[var(--text-muted)] mb-4">No goals yet. Start building your goal stack!</p>
            <button
              onClick={handleAddRoot}
              className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Create Your First Goal
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                <AnimatePresence>
                  {flatItems.map((item) =>
                    item.type === 'goal' ? (
                      <SortableGoalCard
                        key={item.id}
                        item={item}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onAddChild={handleAddChild}
                        onAddTask={handleAddTask}
                        onStatusChange={handleStatusChange}
                        onKpiClick={handleKpiClick}
                      />
                    ) : (
                      <TaskCardInline
                        key={item.id}
                        task={item.task}
                        depth={item.depth}
                        onToggle={handleTaskToggle}
                        onEdit={handleTaskEdit}
                        onDelete={handleTaskDelete}
                      />
                    )
                  )}
                </AnimatePresence>
              </div>
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div className="opacity-80">
                  <GoalCard
                    goal={flatItems.find((f) => f.id === activeId)?.goal}
                    depth={0}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onAddChild={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {editorState.open && (
          <GoalEditor
            stackId={stackId}
            parentGoal={editorState.parentGoal}
            goal={editorState.goal}
            onSave={handleEditorSave}
            onClose={() => setEditorState({ open: false })}
          />
        )}

        {taskEditorState.open && (
          <TaskEditor
            task={taskEditorState.task}
            prefilledGoalId={taskEditorState.goalId}
            onSave={handleTaskEditorSave}
            onClose={() => setTaskEditorState({ open: false })}
          />
        )}
      </div>

      <AnimatePresence>
        {selectedGoalForKpi && (
          <KpiSidebar
            goalId={selectedGoalForKpi.id}
            goalTitle={selectedGoalForKpi.title}
            goalLevel={selectedGoalForKpi.level}
            parentGoalId={selectedGoalForKpi.parentId}
            onClose={() => setSelectedGoalForKpi(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmState !== null}
        variant="danger"
        title={confirmState?.kind === 'task' ? 'Delete task?' : 'Delete goal?'}
        message={
          confirmState?.kind === 'task'
            ? 'This task will be removed.'
            : 'This goal and all of its children will be deleted.'
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmState(null)}
        onConfirm={async () => {
          const pending = confirmState;
          setConfirmState(null);
          if (!pending) return;
          if (pending.kind === 'goal') await performGoalDelete(pending.goalId);
          else await performTaskDelete(pending.taskId);
        }}
      />
    </div>
  );
}
