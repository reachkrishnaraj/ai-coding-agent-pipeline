import type { TaskStatus } from '../types';

interface StatusTimelineProps {
  currentStatus: TaskStatus;
  createdAt: string;
  dispatchedAt?: string;
  completedAt?: string;
}

const STATUS_FLOW: { key: TaskStatus; label: string; icon: string }[] = [
  { key: 'received', label: 'Received', icon: '📥' },
  { key: 'analyzing', label: 'Analyzing', icon: '🔍' },
  { key: 'needs_clarification', label: 'Clarification', icon: '❓' },
  { key: 'dispatched', label: 'Dispatched', icon: '🚀' },
  { key: 'coding', label: 'Coding', icon: '💻' },
  { key: 'pr_open', label: 'PR Open', icon: '📝' },
  { key: 'merged', label: 'Merged', icon: '✅' },
];

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  completed: { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-700' },
  current: { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-700' },
  pending: { bg: 'bg-gray-200', border: 'border-gray-300', text: 'text-gray-400' },
  failed: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-700' },
  skipped: { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-300' },
};

export function StatusTimeline({
  currentStatus,
  createdAt,
  dispatchedAt,
  completedAt,
}: StatusTimelineProps) {
  const getStatusState = (statusKey: TaskStatus): 'completed' | 'current' | 'pending' | 'failed' | 'skipped' => {
    if (currentStatus === 'failed') {
      // Find how far we got before failing
      const statusIndex = STATUS_FLOW.findIndex((s) => s.key === statusKey);
      // Assume failed at early stage
      if (statusIndex <= 1) return 'completed';
      return 'failed';
    }

    const currentIndex = STATUS_FLOW.findIndex((s) => s.key === currentStatus);
    const statusIndex = STATUS_FLOW.findIndex((s) => s.key === statusKey);

    // Skip needs_clarification if task went directly to dispatched
    if (statusKey === 'needs_clarification' && currentIndex > 2 && !dispatchedAt) {
      return 'skipped';
    }

    if (statusIndex < currentIndex) return 'completed';
    if (statusIndex === currentIndex) return 'current';
    return 'pending';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimestamp = (statusKey: TaskStatus): string => {
    switch (statusKey) {
      case 'received':
        return formatDate(createdAt);
      case 'dispatched':
        return formatDate(dispatchedAt);
      case 'merged':
        return formatDate(completedAt);
      default:
        return '';
    }
  };

  // Filter out needs_clarification if not relevant
  const relevantStatuses = STATUS_FLOW.filter((status) => {
    if (status.key === 'needs_clarification') {
      return currentStatus === 'needs_clarification' ||
             STATUS_FLOW.findIndex((s) => s.key === currentStatus) <= 2;
    }
    return true;
  });

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {relevantStatuses.map((status, index) => {
          const state = getStatusState(status.key);
          const colors = STATUS_COLORS[state];
          const timestamp = getTimestamp(status.key);
          const isLast = index === relevantStatuses.length - 1;

          return (
            <div key={status.key} className="flex items-center flex-1">
              {/* Status node */}
              <div className="flex flex-col items-center">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${colors.bg} ${state === 'pending' ? 'border-2 ' + colors.border : ''}
                    transition-all duration-300 shadow-sm
                    ${state === 'current' ? 'ring-4 ring-indigo-200 scale-110' : ''}
                  `}
                >
                  {state === 'completed' ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : state === 'failed' ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : state === 'current' ? (
                    <span className="text-lg">{status.icon}</span>
                  ) : (
                    <span className="text-sm opacity-50">{status.icon}</span>
                  )}
                </div>
                <span className={`mt-2 text-xs font-medium ${colors.text}`}>
                  {status.label}
                </span>
                {timestamp && (
                  <span className="text-xs text-gray-400 mt-0.5">{timestamp}</span>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 mx-2">
                  <div
                    className={`h-1 rounded-full transition-all duration-300 ${
                      state === 'completed' || state === 'current'
                        ? 'bg-green-400'
                        : state === 'failed'
                        ? 'bg-red-300'
                        : 'bg-gray-200'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Failed status indicator */}
      {currentStatus === 'failed' && (
        <div className="mt-4 flex items-center justify-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
            <svg className="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Task Failed
          </span>
        </div>
      )}
    </div>
  );
}
