import { formatTrend } from '../utils/formatTime';

interface StatsCardProps {
  label: string;
  value: string | number;
  trend?: number;
  onClick?: () => void;
  loading?: boolean;
}

export const StatsCard: React.FC<StatsCardProps> = ({ label, value, trend, onClick, loading }) => {
  const trendData = trend !== undefined ? formatTrend(trend) : null;

  return (
    <div
      className={`bg-white p-6 rounded-lg shadow ${onClick ? 'cursor-pointer hover:shadow-lg' : ''} transition-shadow`}
      onClick={onClick}
    >
      <h3 className="text-sm font-medium text-gray-600 mb-2">{label}</h3>
      {loading ? (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-24"></div>
        </div>
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {trendData && (
            <p className={`text-sm mt-2 ${trendData.color}`}>
              {trendData.icon} {trendData.text} from last period
            </p>
          )}
        </>
      )}
    </div>
  );
};
