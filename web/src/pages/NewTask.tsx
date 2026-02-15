import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CreateTaskDto } from '../types';

export function NewTask() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<CreateTaskDto>({
    description: '',
    type: '',
    repo: 'mothership/finance-service',
    files: [],
    acceptanceCriteria: '',
    priority: 'normal',
    recommended_agent: '',
  });
  const [filesInput, setFilesInput] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data: CreateTaskDto = {
        ...formData,
        files: filesInput ? filesInput.split(',').map((f) => f.trim()) : [],
        type: formData.type || undefined,
        recommended_agent: formData.recommended_agent || undefined,
      };

      const response = await api.tasks.create(data);

      if (response.status === 'needs_clarification' && response.questions) {
        setQuestions(response.questions);
        setAnswers(new Array(response.questions.length).fill(''));
        setTaskId(response.id);
      } else {
        navigate(`/tasks/${response.id}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleClarify = async () => {
    if (!taskId) return;

    setLoading(true);
    setError(null);

    try {
      await api.tasks.clarify(taskId, { answers });
      navigate(`/tasks/${taskId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit answers');
    } finally {
      setLoading(false);
    }
  };

  if (questions.length > 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow sm:rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Clarification Needed
          </h2>
          <p className="text-gray-600 mb-6">
            Please answer the following questions to help us better understand
            your task:
          </p>

          {questions.map((question, idx) => (
            <div key={idx} className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {idx + 1}. {question}
              </label>
              <textarea
                value={answers[idx]}
                onChange={(e) => {
                  const newAnswers = [...answers];
                  newAnswers[idx] = e.target.value;
                  setAnswers(newAnswers);
                }}
                rows={3}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
              />
            </div>
          ))}

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              onClick={handleClarify}
              disabled={loading || answers.some((a) => !a.trim())}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Answers'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow sm:rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Create New Task
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              Description *
            </label>
            <textarea
              id="description"
              required
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={4}
              className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
              placeholder="Describe the coding task you want the AI agent to complete..."
            />
          </div>

          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700"
            >
              Task Type
            </label>
            <select
              id="type"
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value })
              }
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">Auto-detect</option>
              <option value="bug-fix">Bug Fix</option>
              <option value="feature">Feature</option>
              <option value="refactor">Refactor</option>
              <option value="test-coverage">Test Coverage</option>
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
              value={formData.repo}
              onChange={(e) =>
                setFormData({ ...formData, repo: e.target.value })
              }
              className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
            />
          </div>

          <div>
            <label
              htmlFor="files"
              className="block text-sm font-medium text-gray-700"
            >
              Files/Modules (comma-separated)
            </label>
            <input
              type="text"
              id="files"
              value={filesInput}
              onChange={(e) => setFilesInput(e.target.value)}
              placeholder="e.g. src/modules/payment/, src/lib/stripe.ts"
              className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
            />
          </div>

          <div>
            <label
              htmlFor="acceptanceCriteria"
              className="block text-sm font-medium text-gray-700"
            >
              Acceptance Criteria
            </label>
            <textarea
              id="acceptanceCriteria"
              value={formData.acceptanceCriteria}
              onChange={(e) =>
                setFormData({ ...formData, acceptanceCriteria: e.target.value })
              }
              rows={3}
              className="mt-1 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border border-gray-300 rounded-md p-2"
              placeholder="What defines success for this task?"
            />
          </div>

          <div>
            <label
              htmlFor="agent"
              className="block text-sm font-medium text-gray-700"
            >
              Preferred Agent
            </label>
            <select
              id="agent"
              value={formData.recommended_agent}
              onChange={(e) =>
                setFormData({ ...formData, recommended_agent: e.target.value })
              }
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">Auto-select</option>
              <option value="claude-code">Claude Code (complex tasks)</option>
              <option value="codex">Codex (quick generation)</option>
              <option value="copilot">Copilot (simple bugs)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Priority
            </label>
            <div className="mt-2 space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="normal"
                  checked={formData.priority === 'normal'}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Normal</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="urgent"
                  checked={formData.priority === 'urgent'}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value })
                  }
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Urgent</span>
              </label>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded">{error}</div>
          )}

          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
