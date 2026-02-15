import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StatsCard } from '../components/StatsCard';
import { StatusBreakdownChart } from '../components/charts/StatusBreakdownChart';
import { DailyVolumeChart } from '../components/charts/DailyVolumeChart';
import { AgentPerformanceTable } from '../components/charts/AgentPerformanceTable';
import { TasksByRepoChart } from '../components/charts/TasksByRepoChart';
import { formatTime } from '../utils/formatTime';

interface StatsMetrics {
  period: {
    from: string;
    to: string;
    label: string;
  };
  filters: {
    repo: string;
    agent: string;
    taskType: string;
    status: string;
  };
  volume: {
    tasksCreated: number;
    tasksDispatched: number;
    tasksMerged: number;
    tasksFailed: number;
    tasksInProgress: number;
  };
  quality: {
    successRate: number;
    failureRate: number;
    clarificationRate: number;
  };
  performance: {
    avgTimeToPr: number;
    medianTimeToPr: number;
    p95TimeToPr: number;
    avgTimeToMerge: number;
    medianTimeToMerge: number;
    p95TimeToMerge: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byTaskType: Record<string, number>;
    byAgent: Record<string, number>;
    byRepo: Record<string, number>;
  };
  trends: {
    completionTrend: number;
    successRateTrend: number;
    avgTimeToPrTrend: number;
  };
}

export default function Stats() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [metrics, setMetrics] = useState<StatsMetrics | null>(null);
  const [dailyVolume, setDailyVolume] = useState<any>(null);
  const [agentPerformance, setAgentPerformance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeRange = searchParams.get('timeRange') || '7d';
  const repo = searchParams.get('repo') || 'all';
  const agent = searchParams.get('agent') || 'all';

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange, repo, agent]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        timeRange,
        repo,
        agent,
      });

      // Fetch overview metrics
      const metricsRes = await fetch(`/api/stats/overview?${params}`);
      if (!metricsRes.ok) throw new Error('Failed to fetch metrics');
      const metricsData = await metricsRes.json();
      setMetrics(metricsData);

      // Fetch daily volume
      const volumeRes = await fetch(`/api/stats/trends?${params}`);
      if (!volumeRes.ok) throw new Error('Failed to fetch volume');
      const volumeData = await volumeRes.json();
      setDailyVolume(volumeData);

      // Fetch agent performance
      const agentRes = await fetch(`/api/stats/agent-performance?${params}`);
      if (!agentRes.ok) throw new Error('Failed to fetch agent performance');
      const agentData = await agentRes.json();
      setAgentPerformance(agentData);

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleTimeRangeChange = (newTimeRange: string) => {
    setSearchParams({ timeRange: newTimeRange, repo, agent });
  };

  const handleRepoChange = (newRepo: string) => {
    setSearchParams({ timeRange, repo: newRepo, agent });
  };

  const handleAgentChange = (newAgent: string) => {
    setSearchParams({ timeRange, repo, agent: newAgent });
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
          <button
            onClick={fetchStats}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const completionRate = metrics
    ? metrics.volume.tasksDispatched > 0
      ? ((metrics.volume.tasksMerged / metrics.volume.tasksDispatched) * 100).toFixed(1)
      : '0'
    : '0';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Statistics</h1>
          {metrics && (
            <p className="text-sm text-gray-500 mt-1">
              Showing data for: {metrics.period.label}
            </p>
          )}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="alltime">All Time</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Repository</label>
            <select
              value={repo}
              onChange={(e) => handleRepoChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Repositories</option>
              {metrics &&
                Object.keys(metrics.breakdown.byRepo).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Agent</label>
            <select
              value={agent}
              onChange={(e) => handleAgentChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Agents</option>
              <option value="claude-code">Claude Code</option>
              <option value="codex">Codex</option>
              <option value="copilot">Copilot</option>
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          label="Tasks Created"
          value={metrics?.volume.tasksCreated ?? 0}
          trend={metrics?.trends.completionTrend}
          loading={loading}
        />
        <StatsCard
          label="Completion Rate"
          value={`${completionRate}%`}
          trend={metrics?.trends.completionTrend}
          loading={loading}
        />
        <StatsCard
          label="Success Rate"
          value={`${metrics?.quality.successRate.toFixed(1) ?? 0}%`}
          trend={metrics?.trends.successRateTrend}
          loading={loading}
        />
        <StatsCard
          label="Avg Time to PR"
          value={formatTime(metrics?.performance.avgTimeToPr ?? 0)}
          trend={metrics?.trends.avgTimeToPrTrend}
          loading={loading}
        />
      </div>

      {/* Charts Row 1 */}
      {!loading && metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StatusBreakdownChart data={metrics.breakdown.byStatus} />
          <TasksByRepoChart data={metrics.breakdown.byRepo} />
        </div>
      )}

      {/* Charts Row 2 */}
      {!loading && dailyVolume && (
        <DailyVolumeChart data={dailyVolume.data} />
      )}

      {/* Agent Performance Table */}
      {!loading && agentPerformance && (
        <AgentPerformanceTable agents={agentPerformance.agents} />
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
}
