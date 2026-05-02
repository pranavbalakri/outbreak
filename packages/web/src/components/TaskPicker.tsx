import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchTasks } from '../api/queries.js';
import { Select } from './ui.js';

const NO_TASK = '__none__';

export interface TaskPickerProps {
  /** Project the task must belong to. When null/empty, the picker is disabled. */
  projectId: string | null;
  /** Selected task id, or null for "no specific task". */
  value: string | null;
  onChange: (taskId: string | null) => void;
  disabled?: boolean;
  triggerWidth?: string | number;
  ariaLabel?: string;
}

export function TaskPicker({
  projectId,
  value,
  onChange,
  disabled,
  triggerWidth,
  ariaLabel,
}: TaskPickerProps) {
  const { data } = useQuery({
    queryKey: ['project-tasks', projectId],
    queryFn: () => fetchTasks(projectId!),
    enabled: !!projectId,
  });

  const options = useMemo(() => {
    const opts = [{ value: NO_TASK, label: 'No specific task' }];
    for (const t of data?.tasks ?? []) {
      opts.push({ value: t.id, label: t.name });
    }
    return opts;
  }, [data]);

  return (
    <Select
      value={value ?? NO_TASK}
      onChange={(v) => onChange(v === NO_TASK ? null : v)}
      options={options}
      placeholder={projectId ? 'Select task' : 'Pick a project first'}
      disabled={disabled || !projectId}
      ariaLabel={ariaLabel ?? 'Task'}
      {...(triggerWidth !== undefined ? { triggerWidth } : {})}
    />
  );
}
