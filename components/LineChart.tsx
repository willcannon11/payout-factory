'use client';

type Point = {
  label: string;
  value: number;
};

type LineChartProps = {
  data: Point[];
  height?: number;
  stroke?: string;
};

export default function LineChart({ data, height = 260, stroke = 'var(--accent)' }: LineChartProps) {
  if (data.length === 0) {
    return <div className="chart-empty">No data yet.</div>;
  }

  const width = 720;
  const padding = 24;
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((point, index) => {
    const x = padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { x, y, ...point };
  });

  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${path} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Line chart">
        <defs>
          <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#equityFill)" />
        <path d={path} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="chart-axis">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
