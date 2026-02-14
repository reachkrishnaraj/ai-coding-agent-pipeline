import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Task, TaskEvent } from '../types';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { TaskTimeline } from '../components/TaskTimeline';

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const loadTask = async () => {
    if (!id) return;

    try {
      const response = await api.tasks.get(id);
      setTask(response);
      setEvents(response.events || []);
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTask();
  }, [id]);

  const handleRetry = async () => {
    if (!id) return;

    setRetrying(true);
    try {
      await api.tasks.retry(id);
      await loadTask();
    } catch (error) {
      console.error('Failed to retry task:', error);
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Loading task...</p>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Task not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-indigo-600 hover:text-indigo-900"
        >
          ← Back to Dashboard
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {task.llm_summary || 'Task Details'}
            </h1>
            <div className="mt-2 flex items-center space-x-3">
              <StatusBadge status={task.status} />
              {task.recommended_agent && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {task.recommended_agent}
                </span>
              )}
              {task.task_type && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {task.task_type}
                </span>
              )}
            </div>
          </div>

          {task.status === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? 'Retrying...' : 'Retry'}
            </button>
          )}
        </div>

        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-gray-500">Description</dt>
              <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                {task.description}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Repository</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.repo}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Priority</dt>
              <dd className="mt-1 text-sm text-gray-900">{task.priority}</dd>
            </div>

            {task.github_issue_url && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  GitHub Issue
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={task.github_issue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    #{task.github_issue_number}
                  </a>
                </dd>
              </div>
            )}

            {task.github_pr_url && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Pull Request
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={task.github_pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    #{task.github_pr_number} ({task.github_pr_status})
                  </a>
                </dd>
              </div>
            )}

            {task.acceptance_criteria && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">
                  Acceptance Criteria
                </dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {task.acceptance_criteria}
                </dd>
              </div>
            )}

            {task.likely_files && task.likely_files.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">
                  Likely Files
                </dt>
                <dd className="mt-1">
                  <ul className="list-disc list-inside text-sm text-gray-900">
                    {task.likely_files.map((file, idx) => (
                      <li key={idx}>{file}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {task.clarification_questions &&
              task.clarification_questions.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500 mb-3">
                    Clarification Q&A
                  </dt>
                  <dd className="space-y-4">
                    {task.clarification_questions.map((question, idx) => (
                      <div key={idx} className="border-l-4 border-gray-300 pl-4">
                        <p className="text-sm font-medium text-gray-900">
                          Q: {question}
                        </p>
                        {task.clarification_answers?.[idx] && (
                          <p className="mt-1 text-sm text-gray-600">
                            A: {task.clarification_answers[idx]}
                          </p>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              )}

            {task.error_message && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Error</dt>
                <dd className="mt-1 text-sm text-red-600 bg-red-50 p-3 rounded">
                  {task.error_message}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h2 className="text-lg font-medium text-gray-900">Timeline</h2>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <TaskTimeline events={events} />
        </div>
      </div>
    </div>
  );
}
