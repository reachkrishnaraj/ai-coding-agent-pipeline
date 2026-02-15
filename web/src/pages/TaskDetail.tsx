import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Task, TaskEvent } from '../types';
import { api } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTimeline } from '../components/StatusTimeline';
import { TaskTimeline } from '../components/TaskTimeline';
import { useWebSocketContext } from '../context/WebSocketContext';

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const { socket, isConnected } = useWebSocketContext();
  const timelineRef = useRef<HTMLDivElement>(null);

  const loadTask = async () => {
    if (!id) return;

    try {
      const response = await api.tasks.get(id);
      setTask(response);
      setEvents(response.events || []);
      // Initialize answers array based on questions
      if (response.clarificationQuestions && response.status === 'needs_clarification') {
        setAnswers(new Array(response.clarificationQuestions.length).fill(''));
      }
    } catch (error) {
      console.error('Failed to load task:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTask();
  }, [id]);

  // WebSocket real-time updates
  useEffect(() => {
    if (!socket || !isConnected || !id) return;

    // Join task room
    socket.emit('task:join', { taskId: id });

    // Handle task state (on initial join or reconnect)
    const handleTaskState = (taskData: Task) => {
      console.log('[TaskDetail] Received task state:', taskData);
      setTask(taskData);
      setEvents(taskData.events || []);
      setLoading(false);
    };

    // Handle status changes
    const handleStatusChanged = (payload: any) => {
      console.log('[TaskDetail] Status changed:', payload);
      if (payload.taskId === id) {
        setTask((prevTask) => {
          if (!prevTask) return prevTask;
          return {
            ...prevTask,
            status: payload.status,
            ...payload,
          };
        });
      }
    };

    // Handle event added
    const handleEventAdded = (payload: { taskId: string; event: TaskEvent }) => {
      console.log('[TaskDetail] Event added:', payload);
      if (payload.taskId === id) {
        setEvents((prevEvents) => [...prevEvents, payload.event]);

        // Auto-scroll to latest event
        setTimeout(() => {
          if (timelineRef.current) {
            timelineRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }, 100);
      }
    };

    // Handle PR updates
    const handlePrUpdated = (payload: any) => {
      console.log('[TaskDetail] PR updated:', payload);
      if (payload.taskId === id) {
        setTask((prevTask) => {
          if (!prevTask) return prevTask;
          return {
            ...prevTask,
            status: payload.status || prevTask.status,
            githubPrNumber: payload.prNumber || prevTask.githubPrNumber,
            githubPrUrl: payload.prUrl || prevTask.githubPrUrl,
            githubPrStatus: payload.prStatus || prevTask.githubPrStatus,
          };
        });
      }
    };

    socket.on('task:state', handleTaskState);
    socket.on('task:status_changed', handleStatusChanged);
    socket.on('task:event_added', handleEventAdded);
    socket.on('task:pr_updated', handlePrUpdated);

    return () => {
      socket.off('task:state', handleTaskState);
      socket.off('task:status_changed', handleStatusChanged);
      socket.off('task:event_added', handleEventAdded);
      socket.off('task:pr_updated', handlePrUpdated);
      socket.emit('task:leave', { taskId: id });
    };
  }, [socket, isConnected, id]);

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

  const handleSubmitAnswers = async () => {
    if (!id || !task) return;

    // Validate all answers are filled
    if (answers.some((a) => !a.trim())) {
      alert('Please answer all questions');
      return;
    }

    setSubmitting(true);
    try {
      await api.tasks.clarify(id, { answers });
      await loadTask();
    } catch (error) {
      console.error('Failed to submit answers:', error);
      alert('Failed to submit answers. Please try again.');
    } finally {
      setSubmitting(false);
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
              {task.llmSummary || 'Task Details'}
            </h1>
            <div className="mt-2 flex items-center space-x-3">
              <StatusBadge status={task.status} />
              {task.recommendedAgent && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {task.recommendedAgent}
                </span>
              )}
              {task.taskType && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {task.taskType}
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

            {task.createdBy && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Author</dt>
                <dd className="mt-1 text-sm text-gray-900">{task.createdBy}</dd>
              </div>
            )}

            {task.source && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Source</dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">{task.source}</dd>
              </div>
            )}

            {task.githubIssueUrl && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  GitHub Issue
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={task.githubIssueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    #{task.githubIssueNumber}
                  </a>
                </dd>
              </div>
            )}

            {task.githubPrUrl && (
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Pull Request
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={task.githubPrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    #{task.githubPrNumber} ({task.githubPrStatus})
                  </a>
                </dd>
              </div>
            )}

            {task.acceptanceCriteria && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">
                  Acceptance Criteria
                </dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {task.acceptanceCriteria}
                </dd>
              </div>
            )}

            {task.likelyFiles && task.likelyFiles.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">
                  Likely Files
                </dt>
                <dd className="mt-1">
                  <ul className="list-disc list-inside text-sm text-gray-900">
                    {task.likelyFiles.map((file, idx) => (
                      <li key={idx}>{file}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}

            {/* Clarification Q&A - Show form if needs_clarification, otherwise show answered */}
            {task.clarificationQuestions &&
              task.clarificationQuestions.length > 0 && (
                <div className="sm:col-span-2">
                  <dt className="text-sm font-medium text-gray-500 mb-3">
                    Clarification Questions
                  </dt>
                  <dd className="space-y-4">
                    {task.status === 'needs_clarification' ? (
                      // Show editable form
                      <>
                        {task.clarificationQuestions.map((question, idx) => (
                          <div key={idx} className="border-l-4 border-yellow-400 pl-4 py-2 bg-yellow-50 rounded-r">
                            <p className="text-sm font-medium text-gray-900 mb-2">
                              Q{idx + 1}: {question}
                            </p>
                            <textarea
                              value={answers[idx] || ''}
                              onChange={(e) => {
                                const newAnswers = [...answers];
                                newAnswers[idx] = e.target.value;
                                setAnswers(newAnswers);
                              }}
                              placeholder="Type your answer here..."
                              rows={2}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            />
                          </div>
                        ))}
                        <button
                          onClick={handleSubmitAnswers}
                          disabled={submitting}
                          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? 'Submitting...' : 'Submit Answers'}
                        </button>
                      </>
                    ) : (
                      // Show answered Q&A
                      task.clarificationQuestions.map((question, idx) => (
                        <div key={idx} className="border-l-4 border-green-400 pl-4">
                          <p className="text-sm font-medium text-gray-900">
                            Q: {question}
                          </p>
                          {task.clarificationAnswers?.[idx] && (
                            <p className="mt-1 text-sm text-gray-600">
                              A: {task.clarificationAnswers[idx]}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </dd>
                </div>
              )}

            {task.errorMessage && (
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Error</dt>
                <dd className="mt-1 text-sm text-red-600 bg-red-50 p-3 rounded">
                  {task.errorMessage}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Status Progress Timeline */}
      <div className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h2 className="text-lg font-medium text-gray-900">Progress</h2>
        </div>
        <div className="border-t border-gray-200 px-6 py-8">
          <StatusTimeline
            currentStatus={task.status}
            createdAt={task.createdAt}
            dispatchedAt={task.dispatchedAt}
            completedAt={task.completedAt}
          />
        </div>
      </div>

      {/* Event Log */}
      <div ref={timelineRef} className="mt-8 bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <h2 className="text-lg font-medium text-gray-900">Event Log</h2>
          <span className="text-sm text-gray-500">{events.length} events</span>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
          <TaskTimeline events={events} />
        </div>
      </div>
    </div>
  );
}
