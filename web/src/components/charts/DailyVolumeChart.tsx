import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DailyVolumeData {
  date: string;
  tasksCreated: number;
  tasksMerged: number;
  tasksFailed: number;
}

interface DailyVolumeChartProps {
  data: DailyVolumeData[];
}

export const DailyVolumeChart: React.FC<DailyVolumeChartProps> = ({ data }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Task Volume</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="tasksCreated" fill="#93c5fd" stroke="none" name="Created" />
          <Line type="monotone" dataKey="tasksMerged" stroke="#10b981" strokeWidth={2} name="Merged" />
          <Line
            type="monotone"
            dataKey="tasksFailed"
            stroke="#ef4444"
            strokeDasharray="5 5"
            name="Failed"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
