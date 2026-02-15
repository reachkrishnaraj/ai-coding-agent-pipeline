export function formatTime(seconds: number): string {
  if (!seconds || seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatTrend(value: number): { text: string; icon: string; color: string } {
  const absValue = Math.abs(value);
  const text = `${absValue.toFixed(1)}%`;

  if (value > 0) {
    return { text, icon: '↑', color: 'text-green-600' };
  } else if (value < 0) {
    return { text, icon: '↓', color: 'text-red-600' };
  } else {
    return { text: '0%', icon: '→', color: 'text-gray-500' };
  }
}

export function getSuccessRateColor(rate: number): string {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 70) return 'text-yellow-600';
  return 'text-red-600';
}
