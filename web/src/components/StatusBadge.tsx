import type { TaskStatus } from '../types';

const statusColors: Record<TaskStatus, string> = {
  received: 'bg-gray-100 text-gray-800',
  analyzing: 'bg-blue-100 text-blue-800',
  needs_clarification: 'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-purple-100 text-purple-800',
  coding: 'bg-indigo-100 text-indigo-800',
  pr_open: 'bg-orange-100 text-orange-800',
  merged: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

interface StatusBadgeProps {
  status: TaskStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
