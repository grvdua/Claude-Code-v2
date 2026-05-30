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
 * Theme-aware: stroke uses the same semantic accent in both modes (they
 * have good contrast on either background); the background tint is
 * darkened in dark mode so the pastel fill doesn't blow out.
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
      <span className="text-[10px] text-slate-400 dark:text-slate-500" title="No reliability history yet">
        n/a
      </span>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const diff = last - first;
  const stroke = diff >= 3 ? '#059669' : diff <= -3 ? '#e11d48' : '#d97706';
  // Pastel background fill colour class (uses Tailwind dark: to flip).
  const fillClass =
    diff >= 3
      ? 'fill-emerald-100 dark:fill-emerald-900/40'
      : diff <= -3
      ? 'fill-rose-100 dark:fill-rose-900/40'
      : 'fill-amber-100 dark:fill-amber-900/40';

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
      <rect x={0} y={0} width={width} height={height} className={fillClass} rx={2} />
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
