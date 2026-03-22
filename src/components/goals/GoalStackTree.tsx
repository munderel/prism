'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { GoalCard } from './GoalCard';
import { GoalEditor } from './GoalEditor';

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
  isCompanyStack,
  isAdmin,
}: {
  item: FlatGoal;
  onEdit: (goal: any) => void;
  onDelete: (goalId: string) => void;
  onAddChild: (goal: any) => void;
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
  const [, setGoals] = useState<any[]>([]);
  const [flatGoals, setFlatGoals] = useState<FlatGoal[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`/api/goals?stackId=${stackId}`);
      if (!res.ok) return;
      const data = await res.json();

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

      setGoals(roots);
      setFlatGoals(flattenTree(roots));
    } finally {
      setLoading(false);
    }
  }, [stackId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIndex = flatGoals.findIndex((f) => f.goal.id === active.id);
    const overIndex = flatGoals.findIndex((f) => f.goal.id === over.id);
    if (activeIndex === -1 || overIndex === -1) return;

    // Optimistic reorder
    const newFlat = [...flatGoals];
    const [moved] = newFlat.splice(activeIndex, 1);
    newFlat.splice(overIndex, 0, moved);
    setFlatGoals(newFlat);

    try {
      await fetch(`/api/goals/${active.id}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: overIndex }),
      });
      await fetchGoals(); // Refresh from server
    } catch {
      setFlatGoals(flatGoals); // Revert on error
    }
  };

  const handleDelete = async (goalId: string) => {
    if (!confirm('Delete this goal and all its children?')) return;
    await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
    fetchGoals();
  };

  const handleEdit = (goal: any) => {
    setEditorState({ open: true, goal });
  };

  const handleAddChild = (parentGoal: any) => {
    setEditorState({ open: true, parentGoal });
  };

  const handleAddRoot = () => {
    setEditorState({ open: true });
  };

  const handleEditorSave = () => {
    setEditorState({ open: false });
    fetchGoals();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading goals...</div>
      </div>
    );
  }

  return (
    <div>
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
  );
}
