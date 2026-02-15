import { useEffect, useState } from 'react';

interface NotificationPreference {
  userId: string;
  email: string;
  channels: {
    email: {
      enabled: boolean;
      address: string;
      digestMode: 'real-time' | 'hourly' | 'daily';
      digestTimes?: {
        morning: string;
        evening: string;
      };
    };
    slack_dm: {
      enabled: boolean;
      slackUserId?: string;
    };
    slack_channel: {
      enabled: boolean;
      channelId?: string;
      channelName?: string;
      eventTypesOnly?: string[];
    };
  };
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    bypassForUrgent: boolean;
  };
  eventPreferences: Record<string, boolean>;
  unsubscribed: {
    email: boolean;
    slackDm: boolean;
    slackChannel: boolean;
    unsubscribedAt?: Date;
    reason?: string;
  };
  timezone: string;
}

const eventLabels: Record<string, { label: string; description: string; urgent?: boolean; blocking?: boolean }> = {
  task_created: { label: 'Task Created', description: 'When a new task is submitted' },
  task_clarification_needed: { label: 'Clarification Needed', description: 'When the system needs clarification', blocking: true },
  task_dispatched: { label: 'Task Dispatched', description: 'When a task is assigned to an agent' },
  pr_opened: { label: 'PR Opened', description: 'When a pull request is ready for review' },
  pr_merged: { label: 'PR Merged', description: 'When a pull request is merged' },
  pr_closed: { label: 'PR Closed', description: 'When a pull request is closed without merging', urgent: true },
  task_failed: { label: 'Task Failed', description: 'When a task encounters an error', urgent: true },
  agent_question: { label: 'Agent Question', description: 'When an agent asks a question', blocking: true },
  task_clarified: { label: 'Task Clarified', description: 'When clarification is provided' },
};

const daysOfWeek = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const response = await fetch('/api/notifications/preferences', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preferences) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Preferences saved successfully!' });
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all preferences to defaults?')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/notifications/preferences/reset', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(data);
        setMessage({ type: 'success', text: 'Preferences reset to defaults!' });
      } else {
        throw new Error('Failed to reset');
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset preferences. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-gray-500">Loading preferences...</p>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-500">Failed to load preferences.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage how and when you receive notifications about your tasks.
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-md ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Channels */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Notification Channels</h2>

        {/* Email */}
        <div className="mb-6">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={preferences.channels.email.enabled}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  channels: {
                    ...preferences.channels,
                    email: { ...preferences.channels.email, enabled: e.target.checked },
                  },
                })
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="font-medium">Email Notifications</span>
          </label>
          {preferences.channels.email.enabled && (
            <div className="ml-7 mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Digest Mode
                </label>
                <select
                  value={preferences.channels.email.digestMode}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      channels: {
                        ...preferences.channels,
                        email: {
                          ...preferences.channels.email,
                          digestMode: e.target.value as 'real-time' | 'hourly' | 'daily',
                        },
                      },
                    })
                  }
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="real-time">Real-time (immediate)</option>
                  <option value="hourly">Hourly digest</option>
                  <option value="daily">Daily digest</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Slack DM */}
        <div className="mb-6">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={preferences.channels.slack_dm.enabled}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  channels: {
                    ...preferences.channels,
                    slack_dm: { ...preferences.channels.slack_dm, enabled: e.target.checked },
                  },
                })
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="font-medium">Slack Direct Messages</span>
          </label>
        </div>

        {/* Slack Channel */}
        <div>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={preferences.channels.slack_channel.enabled}
              onChange={(e) =>
                setPreferences({
                  ...preferences,
                  channels: {
                    ...preferences.channels,
                    slack_channel: { ...preferences.channels.slack_channel, enabled: e.target.checked },
                  },
                })
              }
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="font-medium">Slack Channel Posts</span>
          </label>
          <p className="ml-7 mt-1 text-sm text-gray-500">
            Post notifications to a team channel (requires channel configuration)
          </p>
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Quiet Hours</h2>
        <label className="flex items-center space-x-3 mb-4">
          <input
            type="checkbox"
            checked={preferences.quietHours.enabled}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                quietHours: { ...preferences.quietHours, enabled: e.target.checked },
              })
            }
            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
          />
          <span className="font-medium">Enable Quiet Hours</span>
        </label>

        {preferences.quietHours.enabled && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={preferences.quietHours.startTime}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      quietHours: { ...preferences.quietHours, startTime: e.target.value },
                    })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={preferences.quietHours.endTime}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      quietHours: { ...preferences.quietHours, endTime: e.target.value },
                    })
                  }
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
              <div className="flex flex-wrap gap-2">
                {daysOfWeek.map((day) => (
                  <label key={day.value} className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={preferences.quietHours.daysOfWeek.includes(day.value)}
                      onChange={(e) => {
                        const days = e.target.checked
                          ? [...preferences.quietHours.daysOfWeek, day.value]
                          : preferences.quietHours.daysOfWeek.filter((d) => d !== day.value);
                        setPreferences({
                          ...preferences,
                          quietHours: { ...preferences.quietHours, daysOfWeek: days },
                        });
                      }}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 mr-2"
                    />
                    <span className="text-sm">{day.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={preferences.quietHours.bypassForUrgent}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    quietHours: { ...preferences.quietHours, bypassForUrgent: e.target.checked },
                  })
                }
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm">Allow urgent notifications during quiet hours</span>
            </label>
          </div>
        )}
      </div>

      {/* Event Preferences */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Event Preferences</h2>
        <p className="text-sm text-gray-600 mb-4">
          Choose which events trigger notifications. Some critical events cannot be disabled.
        </p>
        <div className="space-y-3">
          {Object.entries(eventLabels).map(([key, { label, description, urgent, blocking }]) => (
            <div key={key} className="flex items-start space-x-3 py-2">
              <input
                type="checkbox"
                checked={preferences.eventPreferences[key] !== false}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    eventPreferences: {
                      ...preferences.eventPreferences,
                      [key]: e.target.checked,
                    },
                  })
                }
                disabled={blocking}
                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{label}</span>
                  {urgent && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                      Urgent
                    </span>
                  )}
                  {blocking && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button
          onClick={handleReset}
          disabled={saving}
          className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
