'use client';

interface Segment {
  key: string;
  value: number;
  color: string;
}

interface BarChartData {
  label: string;
  segments?: Segment[];
  value?: number;
}

interface BarChartProps {
  data: BarChartData[];
  width?: number;
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function BarChart({
  data,
  width = 520,
  height = 220,
  color = '#0ea5e9',
  formatValue,
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-slate-50 p-6 text-center text-xs text-slate-500">
        No data to chart.
      </div>
    );
  }

  const padL = 50;
  const padR = 8;
  const padT = 14;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const totals = data.map((d) =>
    d.segments ? d.segments.reduce((s, x) => s + x.value, 0) : d.value ?? 0
  );
  const maxV = Math.max(...totals, 1);

  const barGap = 8;
  const barW = (innerW - barGap * (data.length - 1)) / data.length;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: padT + innerH - t * innerH,
    v: maxV * t,
  }));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={width - padR}
            y1={t.y}
            y2={t.y}
            stroke="#e2e8f0"
            strokeDasharray="2 3"
          />
          <text
            x={padL - 4}
            y={t.y}
            fontSize={9}
            fill="#94a3b8"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatValue ? formatValue(t.v) : Math.round(t.v)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x0 = padL + i * (barW + barGap);
        const total = totals[i];
        const barTopY = padT + innerH - (total / maxV) * innerH;
        if (d.segments && d.segments.length > 0) {
          let stackY = padT + innerH;
          return (
            <g key={i}>
              {d.segments.map((seg, j) => {
                const h = (seg.value / maxV) * innerH;
                stackY -= h;
                return (
                  <rect
                    key={j}
                    x={x0}
                    y={stackY}
                    width={barW}
                    height={h}
                    fill={seg.color}
                  >
                    <title>{`${seg.key}: ${formatValue ? formatValue(seg.value) : seg.value}`}</title>
                  </rect>
                );
              })}
              <text
                x={x0 + barW / 2}
                y={height - 12}
                fontSize={9}
                fill="#64748b"
                textAnchor="middle"
              >
                {d.label}
              </text>
              <text
                x={x0 + barW / 2}
                y={barTopY - 3}
                fontSize={9}
                fill="#334155"
                textAnchor="middle"
              >
                {formatValue ? formatValue(total) : total}
              </text>
            </g>
          );
        }
        const h = (total / maxV) * innerH;
        return (
          <g key={i}>
            <rect
              x={x0}
              y={padT + innerH - h}
              width={barW}
              height={h}
              fill={color}
            />
            <text
              x={x0 + barW / 2}
              y={height - 12}
              fontSize={9}
              fill="#64748b"
              textAnchor="middle"
            >
              {d.label}
            </text>
            <text
              x={x0 + barW / 2}
              y={padT + innerH - h - 3}
              fontSize={9}
              fill="#334155"
              textAnchor="middle"
            >
              {formatValue ? formatValue(total) : total}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
