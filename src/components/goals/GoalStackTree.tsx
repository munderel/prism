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

interface GoalStackTreeProps {
  stackId: string;
  isCompanyStack: boolean;
  isAdmin: boolean;
}

interface FlatGoal {
  goal: any;
  depth: number;
}

function flattenTree(goals: any[], depth = 0): FlatGoal[] {
  const result: FlatGoal[] = [];
  for (const goal of goals) {
    result.push({ goal, depth });
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
  onStatusChange,
  onKpiClick,
  isCompanyStack,
  isAdmin,
}: {
  item: FlatGoal;
  onEdit: (goal: any) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (goal: any) => void;
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
  } = useSortable({ id: item.goal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GoalCard
        goal={item.goal}
        depth={item.depth}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddChild={onAddChild}
        onStatusChange={onStatusChange}
        onKpiClick={onKpiClick}
        isCompanyStack={isCompanyStack}
        isAdmin={isAdmin}
        hasLinks={item.goal.companyGoalLinks?.length > 0}
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

  const flatGoals = useMemo(() => {
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

  const [selectedGoalForKpi, setSelectedGoalForKpi] = useState<any>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    open: boolean;
    parentGoal?: any;
    goal?: any;
  }>({ open: false });

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

    const activeIndex = flatGoals.findIndex((f) => f.goal.id === active.id);
    const overIndex = flatGoals.findIndex((f) => f.goal.id === over.id);
    if (activeIndex === -1 || overIndex === -1) return;

    try {
      await fetch(`/api/goals/${active.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: overIndex }),
      });
      await mutateGoals(); // Refresh from server
    } catch {
      await mutateGoals(); // Revert on error
    }
  }, [flatGoals, mutateGoals]);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading goals...</div>
      </div>
    );
  }

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

      {flatGoals.length === 0 ? (
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
            items={flatGoals.map((f) => f.goal.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              <AnimatePresence>
                {flatGoals.map((item) => (
                  <SortableGoalCard
                    key={item.goal.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAddChild={handleAddChild}
                    onStatusChange={handleStatusChange}
                    onKpiClick={handleKpiClick}
                    isCompanyStack={isCompanyStack}
                    isAdmin={isAdmin}
                  />
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>

          <DragOverlay>
            {activeId ? (
              <div className="opacity-80">
                <GoalCard
                  goal={flatGoals.find((f) => f.goal.id === activeId)?.goal}
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
