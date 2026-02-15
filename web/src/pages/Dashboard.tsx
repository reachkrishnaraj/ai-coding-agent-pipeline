import { useEffect, useState } from 'react';
import type { Task } from '../types';
import { api } from '../lib/api';
import { TaskList } from '../components/TaskList';
import { useWebSocketContext } from '../context/WebSocketContext';

export function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [repoFilter, setRepoFilter] = useState<string>('');
  const { socket, isConnected } = useWebSocketContext();

  const loadTasks = async () => {
    try {
      const response = await api.tasks.list({
        status: statusFilter || undefined,
        repo: repoFilter || undefined,
      });
      setTasks(response.tasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [statusFilter, repoFilter]);

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
        const index = prevTasks.findIndex((t) => t._id === payload.taskId);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
      </div>

      <div className="mb-6 flex space-x-4">
        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-700"
          >
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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

        <div>
          <label
            htmlFor="repo"
            className="block text-sm font-medium text-gray-700"
          >
            Repository
          </label>
          <input
            type="text"
            id="repo"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            placeholder="e.g. mothership/finance-service"
            className="mt-1 block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
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
