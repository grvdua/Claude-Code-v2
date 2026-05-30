'use client';

interface DataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  yLabel?: string;
  color?: string;
}

export function LineChart({
  data,
  width = 480,
  height = 180,
  yLabel,
  color = '#0ea5e9',
}: LineChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 dark:bg-slate-900/50 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
        No data to chart.
      </div>
    );
  }

  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = data.map((d) => d.value);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const span = maxV - minV || 1;

  const x = (i: number) =>
    padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - minV) / span) * innerH;

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(' ');

  // y-axis ticks: 4 levels
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = minV + t * span;
    return { y: y(v), v };
  });

  // Theme-aware wrapper: gridlines/labels read currentColor from these
  // classes; the line/points keep their semantic accent color.
  return (
    <div className="text-slate-300 dark:text-slate-700">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
      >
        {yLabel ? (
          <text
            x={6}
            y={padT}
            fontSize={10}
            className="fill-slate-500 dark:fill-slate-400"
            dominantBaseline="hanging"
          >
            {yLabel}
          </text>
        ) : null}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={width - padR}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              strokeDasharray="2 3"
            />
            <text
              x={padL - 4}
              y={t.y}
              fontSize={9}
              className="fill-slate-500 dark:fill-slate-400"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {Math.round(t.v)}
            </text>
          </g>
        ))}
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.value)} r={3} fill={color} />
            {data.length <= 12 ? (
              <text
                x={x(i)}
                y={height - 6}
                fontSize={9}
                className="fill-slate-500 dark:fill-slate-400"
                textAnchor="middle"
              >
                {d.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
