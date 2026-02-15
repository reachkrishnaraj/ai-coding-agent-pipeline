import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TasksByRepoChartProps {
  data: Record<string, number>;
}

export const TasksByRepoChart: React.FC<TasksByRepoChartProps> = ({ data }) => {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({
      name: name.replace('mothership/', ''),
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Repository (Top 10)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={150} />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
