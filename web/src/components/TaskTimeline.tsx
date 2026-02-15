import { useState } from 'react';
import type { TaskEvent } from '../types';

interface TaskTimelineProps {
  events: TaskEvent[];
}

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  created: { icon: '📥', color: 'bg-blue-500' },
  analyzing: { icon: '🔍', color: 'bg-yellow-500' },
  llm_response: { icon: '🤖', color: 'bg-purple-500' },
  clarification_sent: { icon: '❓', color: 'bg-orange-500' },
  clarification_received: { icon: '💬', color: 'bg-green-500' },
  dispatched: { icon: '🚀', color: 'bg-indigo-500' },
  pr_opened: { icon: '📝', color: 'bg-teal-500' },
  pr_merged: { icon: '✅', color: 'bg-green-600' },
  pr_closed: { icon: '❌', color: 'bg-red-500' },
  failed: { icon: '⚠️', color: 'bg-red-500' },
  retry_requested: { icon: '🔄', color: 'bg-gray-500' },
  agent_question: { icon: '🙋', color: 'bg-yellow-600' },
};

function EventPayload({ payload }: { payload: any }) {
  const [expanded, setExpanded] = useState(false);

  if (!payload || Object.keys(payload).length === 0) return null;

  const preview = JSON.stringify(payload).slice(0, 50);
  const isLong = JSON.stringify(payload).length > 50;

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      {expanded && (
        <pre className="mt-2 text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto border border-gray-200 max-h-64 overflow-y-auto">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
      {!expanded && isLong && (
        <span className="text-xs text-gray-400 ml-2">{preview}...</span>
      )}
    </div>
  );
}

export function TaskTimeline({ events }: TaskTimelineProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    };
  };

  const formatEventType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No events recorded yet</p>
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {events.map((event, idx) => {
          const eventConfig = EVENT_ICONS[event.eventType] || { icon: '📌', color: 'bg-gray-400' };
          const { time, date } = formatDate(event.createdAt);

          return (
            <li key={event.id || idx}>
              <div className="relative pb-8">
                {idx !== events.length - 1 && (
                  <span
                    className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-4">
                  <div>
                    <span
                      className={`h-10 w-10 rounded-full ${eventConfig.color} flex items-center justify-center ring-4 ring-white shadow-sm`}
                    >
                      <span className="text-base">{eventConfig.icon}</span>
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {formatEventType(event.eventType)}
                      </p>
                      <div className="text-right">
                        <p className="text-xs font-medium text-gray-500">{time}</p>
                        <p className="text-xs text-gray-400">{date}</p>
                      </div>
                    </div>
                    <EventPayload payload={event.payload} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
