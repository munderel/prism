'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { DndContext, useDraggable, useSensors, useSensor, PointerSensor, MouseSensor, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { PRISM_COLORS, type ItemType } from '@/lib/prism-colors';

interface TimeBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'IMPROVE' | 'REACT' | 'MAINTENANCE' | 'AIM' | 'REVIEW' | 'GOOGLE_CAL' | 'POWER_DOWN' | 'MEETING';
}

interface DashboardTimelineProps {
  blocks: TimeBlock[];
  className?: string;
  onBlockMove?: (blockId: string, type: string, newStart: Date, newEnd: Date) => void;
}

const TIMELINE_START = 6;  // 6am
const TIMELINE_END = 20;   // 8pm
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START; // 14 hours
const SNAP_MINUTES = 15;

const HOUR_LABELS: number[] = [];
for (let h = TIMELINE_START; h <= TIMELINE_END; h += 2) {
  HOUR_LABELS.push(h);
}

function getHourPosition(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  return ((hours - TIMELINE_START) / TIMELINE_HOURS) * 100;
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
  const [nowPosition, setNowPosition] = useState<number | null>(() => {
    const now = new Date();
    const pos = getHourPosition(now);
    return pos >= 0 && pos <= 100 ? pos : null;
  });

  useEffect(() => {
    function updateNow() {
      const now = new Date();
      const pos = getHourPosition(now);
      setNowPosition(pos >= 0 && pos <= 100 ? pos : null);
    }

    updateNow();
    const interval = setInterval(updateNow, 60_000);
    return () => clearInterval(interval);
  }, []);

  const positionedBlocks = useMemo(() => {
    return blocks.map((block) => {
      const start = new Date(block.start);
      const end = new Date(block.end);
      const startHour = start.getHours() + start.getMinutes() / 60;
      const endHour = end.getHours() + end.getMinutes() / 60;
      const durationHours = endHour - startHour;

      const left = ((startHour - TIMELINE_START) / TIMELINE_HOURS) * 100;
      const width = (durationHours / TIMELINE_HOURS) * 100;

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
  }, [blocks]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (!onBlockMove || !trackRef.current) return;
    const { active, delta } = event;
    if (delta.x === 0) return;

    const trackWidth = trackRef.current.getBoundingClientRect().width;
    const deltaPercent = (delta.x / trackWidth) * 100;
    const deltaHours = (deltaPercent / 100) * TIMELINE_HOURS;

    const block = blocks.find((b) => b.id === active.id);
    if (!block) return;

    const startDate = new Date(block.start);
    const endDate = new Date(block.end);
    const durationMs = endDate.getTime() - startDate.getTime();

    const oldStartHour = startDate.getHours() + startDate.getMinutes() / 60;
    const newStartHour = snapToInterval(Math.max(TIMELINE_START, Math.min(TIMELINE_END, oldStartHour + deltaHours)));

    const newStart = new Date(startDate);
    newStart.setHours(Math.floor(newStartHour), Math.round((newStartHour % 1) * 60), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    if (newEnd.getHours() + newEnd.getMinutes() / 60 > TIMELINE_END) return;

    onBlockMove(block.id, block.type, newStart, newEnd);
  }, [blocks, onBlockMove]);

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
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Today&apos;s Schedule
      </p>

      <div className="relative mb-1 flex h-5 select-none">
        {HOUR_LABELS.map((hour) => {
          const left = ((hour - TIMELINE_START) / TIMELINE_HOURS) * 100;
          return (
            <span
              key={hour}
              className="absolute -translate-x-1/2 text-[10px] text-zinc-400 dark:text-zinc-500"
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
