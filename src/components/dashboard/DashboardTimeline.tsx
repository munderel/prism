'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DndContext, useDraggable, useSensors, useSensor, PointerSensor, MouseSensor, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { PRISM_COLORS, type ItemType } from '@/lib/prism-colors';

interface TimeBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'IMPROVE' | 'REACT' | 'MAINTENANCE' | 'AIM' | 'REVIEW' | 'GOOGLE_CAL' | 'POWER_DOWN' | 'MEETING' | 'FOOD';
}

interface DashboardTimelineProps {
  blocks: TimeBlock[];
  className?: string;
  onBlockMove?: (blockId: string, type: string, newStart: Date, newEnd: Date) => void;
}

const DEFAULT_TIMELINE_START = 6;  // 6am
const DEFAULT_TIMELINE_END = 20;   // 8pm
const SNAP_MINUTES = 15;

function getHourPosition(date: Date, timelineStart: number, timelineHours: number): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  return ((hours - timelineStart) / timelineHours) * 100;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return '12am';
  if (hour < 12) return hour + 'am';
  if (hour === 12) return '12pm';
  return (hour - 12) + 'pm';
}

function snapToInterval(hours: number): number {
  const totalMinutes = hours * 60;
  const snapped = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  return snapped / 60;
}

const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
  ...transform,
  y: 0,
});

const MIN_WIDTH_FOR_TEXT = 5; // percentage threshold

function DraggableBlock({
  block,
  canDrag,
}: {
  block: {
    id: string;
    title: string;
    start: string;
    end: string;
    type: string;
    left: number;
    width: number;
    colors: any;
    narrow: boolean;
  };
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    left: `${block.left}%`,
    width: `${block.width}%`,
    backgroundColor: block.colors.bg,
    borderLeft: `2px solid ${block.colors.border}`,
    userSelect: 'none',
    ...(transform ? { transform: `translate3d(${transform.x}px, 0, 0)` } : {}),
    ...(isDragging ? { opacity: 0.8, zIndex: 20, cursor: 'grabbing' } : {}),
    ...(canDrag ? { cursor: isDragging ? 'grabbing' : 'grab' } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute top-1 bottom-1 overflow-hidden rounded-md px-1.5 text-xs leading-[42px]"
      style={style}
      title={`${block.colors.emoji} ${block.title}`}
    >
      {block.narrow ? (
        <span className="text-sm">{block.colors.emoji}</span>
      ) : (
        <span className="flex items-center gap-1 truncate whitespace-nowrap text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
          <span>{block.colors.emoji}</span>
          <span className="truncate">{block.title}</span>
        </span>
      )}
    </div>
  );
}

export function DashboardTimeline({ blocks, className = '', onBlockMove }: DashboardTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Compute dynamic timeline bounds based on events
  const { timelineStart, timelineEnd, timelineHours, hourLabels } = useMemo(() => {
    let earliest = DEFAULT_TIMELINE_START;
    let latest = DEFAULT_TIMELINE_END;
    for (const b of blocks) {
      const s = new Date(b.start);
      const e = new Date(b.end);
      const sHour = Math.floor(s.getHours());
      const eHour = Math.ceil(e.getHours() + e.getMinutes() / 60);
      if (sHour < earliest) earliest = sHour;
      if (eHour > latest) latest = Math.min(eHour, 24);
    }
    const hours = latest - earliest;
    const labels: number[] = [];
    for (let h = earliest; h <= latest; h += 2) labels.push(h);
    return { timelineStart: earliest, timelineEnd: latest, timelineHours: hours, hourLabels: labels };
  }, [blocks]);

  const [nowPosition, setNowPosition] = useState<number | null>(() => {
    const now = new Date();
    const pos = getHourPosition(now, timelineStart, timelineHours);
    return pos >= 0 && pos <= 100 ? pos : null;
  });

  useEffect(() => {
    function updateNow() {
      const now = new Date();
      const pos = getHourPosition(now, timelineStart, timelineHours);
      setNowPosition(pos >= 0 && pos <= 100 ? pos : null);
    }

    updateNow();
    const interval = setInterval(updateNow, 60_000);
    return () => clearInterval(interval);
  }, [timelineStart, timelineHours]);

  const positionedBlocks = useMemo(() => {
    return blocks.map((block) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      const startHour = start.getHours() + start.getMinutes() / 60;
      const endHour = end.getHours() + end.getMinutes() / 60;
      const durationHours = endHour - startHour;

      const left = ((startHour - timelineStart) / timelineHours) * 100;
      const width = (durationHours / timelineHours) * 100;

      const clampedLeft = Math.max(0, left);
      const clampedWidth = Math.min(100 - clampedLeft, width);

      const colors = PRISM_COLORS[block.type as ItemType];

      return {
        ...block,
        left: clampedLeft,
        width: clampedWidth,
        colors,
        narrow: clampedWidth < MIN_WIDTH_FOR_TEXT,
      };
    });
  }, [blocks, timelineStart, timelineHours]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!onBlockMove || !trackRef.current) return;
    const { active, delta } = event;
    if (delta.x === 0) return;

    const trackWidth = trackRef.current.getBoundingClientRect().width;
    const deltaPercent = (delta.x / trackWidth) * 100;
    const deltaHours = (deltaPercent / 100) * timelineHours;

    const block = blocks.find((b) => b.id === active.id);
    if (!block) return;

    const startDate = new Date(block.start);
    const endDate = new Date(block.end);
    const durationMs = endDate.getTime() - startDate.getTime();

    const oldStartHour = startDate.getHours() + startDate.getMinutes() / 60;
    const newStartHour = snapToInterval(Math.max(timelineStart, Math.min(timelineEnd, oldStartHour + deltaHours)));

    const newStart = new Date(startDate);
    newStart.setHours(Math.floor(newStartHour), Math.round((newStartHour % 1) * 60), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    if (newEnd.getHours() + newEnd.getMinutes() / 60 > timelineEnd) return;

    onBlockMove(block.id, block.type, newStart, newEnd);
  }, [blocks, onBlockMove, timelineStart, timelineEnd, timelineHours]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    })
  );

  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-700/60 dark:bg-zinc-900/40 ${className}`}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
        Today&apos;s Schedule
      </p>

      <div className="relative mb-1 flex h-5 select-none">
        {hourLabels.map((hour) => {
          const left = ((hour - timelineStart) / timelineHours) * 100;
          return (
            <span
              key={hour}
              className="absolute -translate-x-1/2 text-[10px] text-zinc-600 dark:text-zinc-400"
              style={{ left: `${left}%` }}
            >
              {formatHourLabel(hour)}
            </span>
          );
        })}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis]}>
        <div ref={trackRef} className="relative h-[50px] w-full overflow-visible rounded-lg bg-zinc-100 dark:bg-zinc-800/60">
          {positionedBlocks.map((block) => (
            <DraggableBlock key={block.id} block={block} canDrag={!!onBlockMove} />
          ))}

          {nowPosition !== null && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10"
              style={{ left: `${nowPosition}%` }}
            >
              <div className="absolute -left-[4px] -top-[3px] h-[9px] w-[9px] rounded-full bg-red-500 shadow-sm" />
              <div className="absolute left-0 top-0 h-full w-[2px] -translate-x-1/2 bg-red-500" />
            </div>
          )}
        </div>
      </DndContext>
    </div>
  );
}
