'use client';

import useSWR from 'swr';
import {
  ScheduledItemGoals,
  type ScheduledWorkBlock,
  type ScheduledAimInstance,
  type ScheduledTaskOnly,
} from './ScheduledItemGoals';

interface EventGoalsPopoverProps {
  source: string | undefined;
  workBlockId?: string;
  aimInstanceId?: string;
  taskId?: string;
  taskTitle?: string;
  taskType?: string;
  onChange?: () => void;
}

export function EventGoalsPopover({
  source,
  workBlockId,
  aimInstanceId,
  taskId,
  taskTitle,
  taskType,
  onChange,
}: EventGoalsPopoverProps) {
  if (source === 'task' && workBlockId) {
    return <WorkBlockPopoverGoals id={workBlockId} onChange={onChange} />;
  }
  if (source === 'task' && taskId) {
    const task: ScheduledTaskOnly = {
      id: taskId,
      title: taskTitle ?? 'Task',
      taskType: taskType ?? 'IMPROVE',
    };
    return <ScheduledItemGoals item={{ kind: 'taskOnly', task }} mode="popover" onChange={onChange} />;
  }
  if (source === 'aims' && aimInstanceId) {
    return <AimPopoverGoals id={aimInstanceId} onChange={onChange} />;
  }
  return null;
}

function WorkBlockPopoverGoals({ id, onChange }: { id: string; onChange?: () => void }) {
  const { data, mutate } = useSWR<ScheduledWorkBlock>(`/api/work-blocks/${id}`);
  if (!data) return null;
  return (
    <ScheduledItemGoals
      item={{ kind: 'workBlock', block: data }}
      mode="popover"
      onChange={() => {
        mutate();
        onChange?.();
      }}
    />
  );
}

function AimPopoverGoals({ id, onChange }: { id: string; onChange?: () => void }) {
  const { data, mutate } = useSWR<ScheduledAimInstance>(`/api/aims/instances/${id}`);
  if (!data) return null;
  return (
    <ScheduledItemGoals
      item={{ kind: 'aimInstance', aim: data }}
      mode="popover"
      onChange={() => {
        mutate();
        onChange?.();
      }}
    />
  );
}
