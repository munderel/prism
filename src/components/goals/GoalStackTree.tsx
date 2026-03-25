'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
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

interface GoalStackTreeProps {
  stackId: string;
  isCompanyStack: boolean;
  isAdmin: boolean;
}

interface FlatItem {
  type: 'goal' | 'task';
  goal?: any;
  task?: any;
  depth: number;
  id: string;
}

function flattenTree(goals: any[], depth = 0): FlatItem[] {
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

function SortableGoalCard({
  item,
  onEdit,
  onDelete,
  onAddChild,
  onAddTask,
  onStatusChange,
  onKpiClick,
  isCompanyStack,
  isAdmin,
}: {
  item: FlatItem;
  onEdit: (goal: any) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (goal: any) => void;
  onAddTask: (goalId: string) => void;
  onStatusChange: (goalId: string, status: string) => void;
  onKpiClick: (goal: any) => void;
  isCompanyStack: boolean;
  isAdmin: boolean;
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
}

export function GoalStackTree({
  stackId,
  isCompanyStack,
  isAdmin,
}: GoalStackTreeProps) {
  const { data: goalsData, isLoading, mutate: mutateGoals } = useSWR(`/api/goals?stackId=${stackId}`);

  const flatItems = useMemo(() => {
    const data = Array.isArray(goalsData) ? goalsData : [];
    // Build tree from flat list
    const map = new Map<string, any>();
    for (const g of data) {
      map.set(g.id, { ...g, children: [] });
    }
    const roots: any[] = [];
    for (const g of data) {
      const node = map.get(g.id)!;
      if (g.parentId && map.has(g.parentId)) {
        map.get(g.parentId)!.children.push(node);
      } else if (!g.parentId) {
        roots.push(node);
      }
    }
    return flattenTree(roots);
  }, [goalsData]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    parentGoal?: any;
    goal?: any;
  }>({ open: false });
  const [taskEditorState, setTaskEditorState] = useState<{
    open: boolean;
    goalId?: string;
    task?: any;
  }>({ open: false });
  const [selectedGoalForKpi, setSelectedGoalForKpi] = useState<any>(null);

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

  const handleDelete = useCallback(async (goalId: string) => {
    if (!confirm('Delete this goal and all its children?')) return;
    await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
    mutateGoals();
  }, [mutateGoals]);

  const handleEdit = useCallback((goal: any) => {
    setEditorState({ open: true, goal });
  }, []);

  const handleAddChild = useCallback((parentGoal: any) => {
    setEditorState({ open: true, parentGoal });
  }, []);

  const handleAddTask = useCallback((goalId: string) => {
    setTaskEditorState({ open: true, goalId });
  }, []);

  const handleTaskToggle = useCallback(async (task: any) => {
    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    mutateGoals();
  }, [mutateGoals]);

  const handleTaskEdit = useCallback((task: any) => {
    setTaskEditorState({ open: true, task });
  }, []);

  const handleTaskDelete = useCallback(async (taskId: string) => {
    if (!confirm('Delete this task?')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    mutateGoals();
  }, [mutateGoals]);

  const handleStatusChange = useCallback(async (goalId: string, status: string) => {
    await fetch(`/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    mutateGoals();
  }, [mutateGoals]);

  const handleKpiClick = useCallback((goal: any) => {
    setSelectedGoalForKpi((prev: any) => prev?.id === goal.id ? null : goal);
  }, []);

  const handleAddRoot = useCallback(() => {
    setEditorState({ open: true });
  }, []);

  const handleEditorSave = useCallback(() => {
    setEditorState({ open: false });
    mutateGoals();
  }, [mutateGoals]);

  const handleTaskEditorSave = useCallback(() => {
    setTaskEditorState({ open: false });
    mutateGoals();
  }, [mutateGoals]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading goals...</div>
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
            <p className="text-gray-500 mb-4">No goals yet. Start building your goal stack!</p>
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
                        isCompanyStack={isCompanyStack}
                        isAdmin={isAdmin}
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
    </div>
  );
}
