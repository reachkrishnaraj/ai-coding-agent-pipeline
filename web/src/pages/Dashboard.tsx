import { useEffect, useState } from 'react';
import type { Task } from '../types';
import { api } from '../lib/api';
import { TaskList } from '../components/TaskList';
import { useWebSocketContext } from '../context/WebSocketContext';
import RepoSelector from '../components/RepoSelector';

interface Repo {
  id: string;
  repoName: string;
  stats?: {
    totalTasks: number;
    successRate: number;
    health: 'green' | 'yellow' | 'red' | 'gray';
  };
}

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const { socket, isConnected } = useWebSocketContext();

  const loadTasks = async () => {
    try {
      const response = await api.tasks.list({
        status: statusFilter || undefined,
        repo: selectedRepo === 'all' ? undefined : selectedRepo,
      });
      setTasks(response.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRepos = async () => {
    try {
      const response = await fetch('/api/repos?includeStats=true', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos);
      }
    } catch (error) {
      console.error('Failed to load repos:', error);
    } finally {
      setReposLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
    // Load last selected repo from localStorage
    const lastRepo = localStorage.getItem('lastSelectedRepo');
    if (lastRepo) {
      setSelectedRepo(lastRepo);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [statusFilter, selectedRepo]);

  const handleSelectRepo = (repoName: string) => {
    setSelectedRepo(repoName);
    localStorage.setItem('lastSelectedRepo', repoName);
  };

  // WebSocket real-time updates
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join dashboard room
    socket.emit('dashboard:join');

    // Handle dashboard state (on initial join or reconnect)
    const handleDashboardState = (data: { tasks: Task[] }) => {
      console.log('[Dashboard] Received dashboard state:', data);
      setTasks(data.tasks);
      setLoading(false);
    };

    // Handle task list updates
    const handleTaskListUpdated = (payload: any) => {
      console.log('[Dashboard] Task list updated:', payload);

      setTasks((prevTasks) => {
        const index = prevTasks.findIndex((t) => t.id === payload.taskId);

        if (index !== -1) {
          // Update existing task
          const updatedTasks = [...prevTasks];
          updatedTasks[index] = {
            ...updatedTasks[index],
            ...payload,
          };
          return updatedTasks;
        } else {
          // Add new task if not exists
          return [payload, ...prevTasks];
        }
      });
    };

    socket.on('dashboard:state', handleDashboardState);
    socket.on('dashboard:task_list_updated', handleTaskListUpdated);

    return () => {
      socket.off('dashboard:state', handleDashboardState);
      socket.off('dashboard:task_list_updated', handleTaskListUpdated);
      socket.emit('dashboard:leave');
    };
  }, [socket, isConnected]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <a
          href="/tasks/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          New Task
        </a>
      </div>

      <div className="mb-6 flex items-end space-x-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Repository
          </label>
          <RepoSelector
            selectedRepo={selectedRepo}
            onSelectRepo={handleSelectRepo}
            repos={repos}
            isLoading={reposLoading}
          />
        </div>

        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
          >
            <option value="">All</option>
            <option value="received">Received</option>
            <option value="analyzing">Analyzing</option>
            <option value="needs_clarification">Needs Clarification</option>
            <option value="dispatched">Dispatched</option>
            <option value="coding">Coding</option>
            <option value="pr_open">PR Open</option>
            <option value="merged">Merged</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading tasks...</p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <TaskList tasks={tasks} />
        </div>
      )}
    </div>
  );
}
