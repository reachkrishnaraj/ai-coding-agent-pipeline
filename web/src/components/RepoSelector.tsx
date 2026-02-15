import { useState, useEffect } from 'react';

interface RepoStats {
  totalTasks: number;
  successRate: number;
  health: 'green' | 'yellow' | 'red' | 'gray';
}

interface Repo {
  id: string;
  repoName: string;
  stats?: RepoStats;
}

interface RepoSelectorProps {
  selectedRepo: string;
  onSelectRepo: (repoName: string) => void;
  repos: Repo[];
  isLoading?: boolean;
}

const healthColors = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  gray: 'bg-gray-400',
};

export default function RepoSelector({
  selectedRepo,
  onSelectRepo,
  repos,
  isLoading = false,
}: RepoSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.repo-selector')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (repoName: string) => {
    onSelectRepo(repoName);
    setIsOpen(false);
  };

  const displayName =
    selectedRepo === 'all'
      ? 'All Repos'
      : repos.find((r) => r.repoName === selectedRepo)?.repoName || selectedRepo;

  return (
    <div className="relative inline-block repo-selector">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      >
        <span className="font-medium text-gray-700">Repos:</span>
        <span className="text-gray-900">{displayName}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200">
          <div className="py-1 max-h-96 overflow-y-auto">
            {/* All Repos option */}
            <button
              onClick={() => handleSelect('all')}
              className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${
                selectedRepo === 'all' ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                {selectedRepo === 'all' && (
                  <svg
                    className="w-4 h-4 text-indigo-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span className="font-medium">All Repos</span>
              </div>
              <span className="text-sm text-gray-500">
                ({repos.reduce((sum, r) => sum + (r.stats?.totalTasks || 0), 0)} tasks)
              </span>
            </button>

            <div className="border-t border-gray-200 my-1"></div>

            {/* Individual repos */}
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => handleSelect(repo.repoName)}
                className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${
                  selectedRepo === repo.repoName ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {selectedRepo === repo.repoName && (
                    <svg
                      className="w-4 h-4 text-indigo-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  <span className="text-sm">{repo.repoName}</span>
                  {repo.stats && (
                    <span
                      className={`w-2 h-2 rounded-full ${healthColors[repo.stats.health]}`}
                      title={`Health: ${repo.stats.health}, Success rate: ${repo.stats.successRate}%`}
                    ></span>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  ({repo.stats?.totalTasks || 0} tasks)
                </span>
              </button>
            ))}

            {repos.length === 0 && !isLoading && (
              <div className="px-4 py-3 text-sm text-gray-500 text-center">
                No repositories added yet
              </div>
            )}
          </div>

          <div className="border-t border-gray-200">
            <a
              href="/repos/manage"
              className="block px-4 py-2 text-sm text-indigo-600 hover:bg-gray-50 text-center font-medium"
            >
              Manage Repos
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
