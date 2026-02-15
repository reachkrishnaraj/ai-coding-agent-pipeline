import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Task } from '../types';
import { StatusBadge } from './StatusBadge';

interface TaskListProps {
  tasks: Task[];
}

function ActionsMenu({ task, onClone }: { task: Task; onClone: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
        title="Actions"
      >
        <svg
          className="w-5 h-5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-36 bg-white rounded-md shadow-lg border border-gray-200 z-10">
          <div className="py-1">
            <button
              onClick={() => {
                onClone();
                setIsOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Clone
            </button>
            <Link
              to={`/tasks/${task.id}`}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              onClick={() => setIsOpen(false)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View
            </Link>
            {task.githubIssueUrl && (
              <a
                href={task.githubIssueUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => setIsOpen(false)}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Issue
              </a>
            )}
            {task.githubPrUrl && (
              <a
                href={task.githubPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={() => setIsOpen(false)}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                PR
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskList({ tasks }: TaskListProps) {
  const navigate = useNavigate();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const handleClone = (task: Task) => {
    navigate('/tasks/new', {
      state: {
        cloneFrom: {
          description: task.description,
          type: task.taskTypeHint || task.taskType || '',
          repo: task.repo,
          files: task.filesHint || task.likelyFiles || [],
          acceptanceCriteria: task.acceptanceCriteria || '',
          priority: task.priority || 'normal',
          recommended_agent: task.recommendedAgent || '',
        },
      },
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No tasks found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="w-auto px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Title
            </th>
            <th className="w-28 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Author
            </th>
            <th className="w-44 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Repo
            </th>
            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Agent
            </th>
            <th className="w-24 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="w-40 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="w-16 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">

            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="px-4 py-4 whitespace-nowrap">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-4 py-4">
                <Link
                  to={`/tasks/${task.id}`}
                  className="text-indigo-600 hover:text-indigo-900 font-medium truncate block"
                >
                  {task.llmSummary || task.description.slice(0, 60) + '...'}
                </Link>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 truncate">
                {task.createdBy || '-'}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 truncate">
                {task.repo}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {task.recommendedAgent || '-'}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {task.taskType || '-'}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(task.createdAt)}
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-center">
                <ActionsMenu task={task} onClone={() => handleClone(task)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
