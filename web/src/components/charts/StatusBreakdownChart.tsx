import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface StatusBreakdownChartProps {
  data: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  received: '#9ca3af',
  analyzing: '#3b82f6',
  needs_clarification: '#eab308',
  dispatched: '#a855f7',
  coding: '#6366f1',
  pr_open: '#f97316',
  merged: '#10b981',
  failed: '#ef4444',
};

export const StatusBreakdownChart: React.FC<StatusBreakdownChartProps> = ({ data }) => {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value,
    originalName: name,
  }));

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Status Breakdown</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.originalName] || '#6366f1'} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
