import { useState, useEffect } from 'react';

interface Task {
  id: string;
  description: string;
  llmSummary?: string;
  status: string;
}

interface Dependency {
  id?: string;
  type: 'task' | 'pr' | 'external_issue';
  taskId?: string;
  taskTitle?: string;
  repo?: string;
  prNumber?: number;
  externalRepo?: string;
  externalIssueNumber?: number;
  blockingBehavior: 'hard' | 'soft';
  requiredStatus: string;
  currentState?: string;
}

interface DependencySelectorProps {
  taskId: string;
  dependencies: Dependency[];
  onDependencyAdded: () => void;
  onDependencyRemoved: (depId: string) => void;
}

export function DependencySelector({
  taskId,
  dependencies,
  onDependencyAdded,
  onDependencyRemoved,
}: DependencySelectorProps) {
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState<'task' | 'pr' | 'external_issue'>('task');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [repo, setRepo] = useState('');
  const [prNumber, setPrNumber] = useState('');
  const [externalRepo, setExternalRepo] = useState('');
  const [externalIssueNumber, setExternalIssueNumber] = useState('');
  const [blockingBehavior, setBlockingBehavior] = useState<'hard' | 'soft'>('hard');
  const [autoStart, setAutoStart] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (showModal && type === 'task') {
      loadAvailableTasks();
    }
  }, [showModal, type]);

  const loadAvailableTasks = async () => {
    try {
      const response = await fetch('/api/tasks?limit=100', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        // Filter out current task and tasks that are already dependencies
        const filtered = data.tasks.filter(
          (t: Task) =>
            t.id !== taskId &&
            !dependencies.some(d => d.type === 'task' && d.taskId === t.id),
        );
        setAvailableTasks(filtered);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  const handleAddDependency = async () => {
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        type,
        blockingBehavior,
        autoStart,
      };

      if (type === 'task') {
        if (!selectedTaskId) {
          setError('Please select a task');
          return;
        }
        payload.taskId = selectedTaskId;
        payload.requiredStatus = 'merged';
      } else if (type === 'pr') {
        if (!repo || !prNumber) {
          setError('Please enter repo and PR number');
          return;
        }
        payload.repo = repo;
        payload.prNumber = parseInt(prNumber);
        payload.requiredStatus = 'merged';
      } else if (type === 'external_issue') {
        if (!externalRepo || !externalIssueNumber) {
          setError('Please enter repo and issue number');
          return;
        }
        payload.externalRepo = externalRepo;
        payload.externalIssueNumber = parseInt(externalIssueNumber);
        payload.requiredStatus = 'closed';
      }

      const response = await fetch(`/api/tasks/${taskId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to add dependency');
      }

      // Reset form
      setSelectedTaskId('');
      setRepo('');
      setPrNumber('');
      setExternalRepo('');
      setExternalIssueNumber('');
      setBlockingBehavior('hard');
      setAutoStart(false);
      setShowModal(false);

      onDependencyAdded();
    } catch (err: any) {
      setError(err.message || 'Failed to add dependency');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDependency = async (depId: string) => {
    if (!confirm('Are you sure you want to remove this dependency?')) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${taskId}/dependencies/${depId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to remove dependency');
      }

      onDependencyRemoved(depId);
    } catch (err) {
      console.error('Failed to remove dependency:', err);
    }
  };

  const getStatusIcon = (state?: string) => {
    switch (state) {
      case 'resolved':
        return <span className="text-green-600">✓</span>;
      case 'blocked':
      case 'failed':
        return <span className="text-red-600">✗</span>;
      case 'pending':
        return <span className="text-yellow-600">⏳</span>;
      default:
        return <span className="text-gray-400">○</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-700">Task Dependencies</h3>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200"
        >
          + Add Dependency
        </button>
      </div>

      {dependencies.length === 0 ? (
        <p className="text-sm text-gray-500">No dependencies yet</p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
          {dependencies.map(dep => (
            <li key={dep.id} className="p-3 flex justify-between items-start">
              <div className="flex items-start space-x-2">
                <span className="mt-0.5">{getStatusIcon(dep.currentState)}</span>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {dep.type === 'task' && (
                      <>
                        Task: {dep.taskTitle || `#${dep.taskId?.substring(0, 8)}`}
                      </>
                    )}
                    {dep.type === 'pr' && (
                      <>
                        PR #{dep.prNumber} ({dep.repo})
                      </>
                    )}
                    {dep.type === 'external_issue' && (
                      <>
                        Issue #{dep.externalIssueNumber} ({dep.externalRepo})
                      </>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dep.blockingBehavior === 'hard' ? 'Hard blocking' : 'Soft blocking'} •{' '}
                    Required: {dep.requiredStatus} •{' '}
                    State: {dep.currentState || 'pending'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRemoveDependency(dep.id!)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add Dependency Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Dependency</h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dependency Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="task">Task in this system</option>
                  <option value="pr">GitHub PR</option>
                  <option value="external_issue">External Issue</option>
                </select>
              </div>

              {type === 'task' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Task
                  </label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  >
                    <option value="">-- Select a task --</option>
                    {availableTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.llmSummary || task.description.substring(0, 60)} ({task.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {type === 'pr' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Repository
                    </label>
                    <input
                      type="text"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="e.g. mothership/finance-service"
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      PR Number
                    </label>
                    <input
                      type="number"
                      value={prNumber}
                      onChange={(e) => setPrNumber(e.target.value)}
                      placeholder="e.g. 42"
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </>
              )}

              {type === 'external_issue' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Repository
                    </label>
                    <input
                      type="text"
                      value={externalRepo}
                      onChange={(e) => setExternalRepo(e.target.value)}
                      placeholder="e.g. mothership/platform"
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Issue Number
                    </label>
                    <input
                      type="number"
                      value={externalIssueNumber}
                      onChange={(e) => setExternalIssueNumber(e.target.value)}
                      placeholder="e.g. 999"
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Blocking Behavior
                </label>
                <select
                  value={blockingBehavior}
                  onChange={(e) => setBlockingBehavior(e.target.value as any)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="hard">Hard (task won't start)</option>
                  <option value="soft">Soft (advisory only)</option>
                </select>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Auto-start task when resolved
                  </span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <button
                onClick={handleAddDependency}
                disabled={loading}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Dependency'}
              </button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                }}
                className="flex-1 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
