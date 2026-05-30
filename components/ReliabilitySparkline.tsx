'use client';

interface ReliabilitySparklineProps {
  data: number[];
  labels?: string[];
  width?: number;
  height?: number;
}

/**
 * Tiny inline SVG sparkline (no deps). Used to show 6-month vendor
 * reliability composite score next to quote rows / vendor lists.
 *
 * Colour:
 *   - emerald when trending up (last > first by >= 3pts)
 *   - rose when trending down (first > last by >= 3pts)
 *   - amber when flat
 *
 * Tooltips: each point gets a <title> with month/score (native hover).
 */
export function ReliabilitySparkline({
  data,
  labels,
  width = 60,
  height = 20,
}: ReliabilitySparklineProps) {
  if (data.length === 0) {
    return (
      <span className="text-[10px] text-slate-400" title="No reliability history yet">
        n/a
      </span>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const diff = last - first;
  const stroke = diff >= 3 ? '#059669' : diff <= -3 ? '#e11d48' : '#d97706';
  const fillBg = diff >= 3 ? '#d1fae5' : diff <= -3 ? '#ffe4e6' : '#fef3c7';

  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const span = max - min || 1;

  const padX = 2;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const xOf = (i: number) =>
    data.length === 1
      ? padX + innerW / 2
      : padX + (i / (data.length - 1)) * innerW;
  const yOf = (v: number) => padY + innerH - ((v - min) / span) * innerH;

  const path = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Reliability trend"
    >
      <rect x={0} y={0} width={width} height={height} fill={fillBg} rx={2} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} />
      {data.map((v, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(v)} r={1.2} fill={stroke}>
          <title>
            {labels && labels[i] ? `${labels[i]}: ${v}` : `Month ${i + 1}: ${v}`}
          </title>
        </circle>
      ))}
    </svg>
  );
}
