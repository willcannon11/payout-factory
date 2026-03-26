'use client';

type Datum = {
  label: string;
  value: number;
};

type BarChartProps = {
  data: Datum[];
  height?: number;
};

export default function BarChart({ data, height = 260 }: BarChartProps) {
  if (data.length === 0) {
    return <div className="chart-empty">No data yet.</div>;
  }

  const width = 720;
  const padding = 24;
  const values = data.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const baseline = height - padding - ((0 - min) / range) * (height - padding * 2);
  const barWidth = (width - padding * 2) / data.length - 6;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label="Bar chart">
        <line x1={padding} x2={width - padding} y1={baseline} y2={baseline} stroke="rgba(159,176,209,0.25)" />
        {data.map((point, index) => {
          const x = padding + index * ((width - padding * 2) / data.length) + 3;
          const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
          const barHeight = Math.abs(baseline - y);
          const fill = point.value >= 0 ? 'var(--accent)' : 'var(--danger)';

          return (
            <rect
              key={`${point.label}-${index}`}
              x={x}
              y={point.value >= 0 ? y : baseline}
              width={Math.max(barWidth, 6)}
              height={Math.max(barHeight, 2)}
              rx="4"
              fill={fill}
            />
          );
        })}
      </svg>
      <div className="chart-axis">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
