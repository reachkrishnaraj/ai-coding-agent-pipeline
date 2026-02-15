import { useState } from 'react';
import { formatTime, getSuccessRateColor } from '../../utils/formatTime';

interface AgentPerformance {
  name: string;
  totalTasks: number;
  mergedCount: number;
  failedCount: number;
  successRate: number;
  avgTimeToPr: number;
  avgTimeToMerge: number;
}

interface AgentPerformanceTableProps {
  agents: AgentPerformance[];
}

type SortField = 'name' | 'totalTasks' | 'successRate' | 'avgTimeToPr' | 'avgTimeToMerge';
type SortDirection = 'asc' | 'desc';

export const AgentPerformanceTable: React.FC<AgentPerformanceTableProps> = ({ agents }) => {
  const [sortField, setSortField] = useState<SortField>('successRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    return (aVal > bVal ? 1 : -1) * multiplier;
  });

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Performance</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Agent {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('totalTasks')}
              >
                Total {sortField === 'totalTasks' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Merged
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('successRate')}
              >
                Success % {sortField === 'successRate' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('avgTimeToPr')}
              >
                Avg Time PR {sortField === 'avgTimeToPr' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('avgTimeToMerge')}
              >
                Avg Time Merge {sortField === 'avgTimeToMerge' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedAgents.map((agent, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-medium text-gray-900">{agent.name}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {agent.totalTasks}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                  {agent.mergedCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                  {agent.failedCount}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getSuccessRateColor(agent.successRate)}`}>
                  {agent.successRate.toFixed(1)}%
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatTime(agent.avgTimeToPr)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatTime(agent.avgTimeToMerge)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
