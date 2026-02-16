import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface Repo {
  id: string;
  repoName: string;
  defaultAgent?: string;
  isActive: boolean;
  addedAt?: string;
}

interface AvailableRepo {
  full_name: string;
  description?: string;
  private: boolean;
  html_url: string;
}

export function RepoManage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [availableRepos, setAvailableRepos] = useState<AvailableRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [showAvailable, setShowAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState('');

  const fetchRepos = async () => {
    try {
      setLoading(true);
      const data = await api.repos.list(true);
      setRepos(data.repos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailable = async () => {
    try {
      setAvailableLoading(true);
      const data = await api.repos.available();
      setAvailableRepos(data.repos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAvailableLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  const handleAddRepo = async (repoName: string) => {
    try {
      await api.repos.add(repoName);
      await fetchRepos();
      setShowAvailable(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemoveRepo = async (id: string) => {
    try {
      await api.repos.remove(id);
      await fetchRepos();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateSettings = async (id: string) => {
    try {
      await api.repos.updateSettings(id, { defaultAgent: editAgent });
      setEditingId(null);
      await fetchRepos();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShowAvailable = () => {
    setShowAvailable(true);
    fetchAvailable();
  };

  const addedRepoNames = new Set(repos.map((r) => r.repoName));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Manage Repositories</h1>
        <button
          onClick={handleShowAvailable}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
        >
          + Add Repository
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading repositories...</div>
      ) : repos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-4">No repositories added yet.</p>
          <button
            onClick={handleShowAvailable}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
          >
            Add your first repository
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{repo.repoName}</span>
                  {repo.defaultAgent && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                      {repo.defaultAgent}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editingId === repo.id ? (
                  <>
                    <select
                      value={editAgent}
                      onChange={(e) => setEditAgent(e.target.value)}
                      className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                    >
                      <option value="claude-code">claude-code</option>
                      <option value="codex">codex</option>
                      <option value="copilot">copilot</option>
                    </select>
                    <button
                      onClick={() => handleUpdateSettings(repo.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(repo.id);
                        setEditAgent(repo.defaultAgent || 'claude-code');
                      }}
                      className="px-3 py-1 text-gray-600 hover:text-gray-800 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Settings
                    </button>
                    <button
                      onClick={() => handleRemoveRepo(repo.id)}
                      className="px-3 py-1 text-red-600 hover:text-red-800 text-sm border border-red-300 rounded-md hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAvailable && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Repository</h2>
              <button
                onClick={() => setShowAvailable(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-4">
              {availableLoading ? (
                <div className="text-center py-8 text-gray-500">Loading available repos...</div>
              ) : availableRepos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No additional repos available. Check your GitHub token permissions.
                </div>
              ) : (
                <div className="space-y-2">
                  {availableRepos.map((repo) => (
                    <div
                      key={repo.full_name}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{repo.full_name}</span>
                          {repo.private && (
                            <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                              private
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{repo.description}</p>
                        )}
                      </div>
                      {addedRepoNames.has(repo.full_name) ? (
                        <span className="text-xs text-gray-400 ml-2">Added</span>
                      ) : (
                        <button
                          onClick={() => handleAddRepo(repo.full_name)}
                          className="ml-2 px-3 py-1 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
