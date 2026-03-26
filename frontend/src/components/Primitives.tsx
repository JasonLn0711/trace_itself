import type { ReactNode } from 'react';
import { formatDate } from '../lib/dates';
import type { Tone } from '../lib/presentation';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

export function Badge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={`btn btn-${variant}`} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function SectionHeader({
  title,
  description,
  action
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  aside
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="page-intro card">
      <div className="page-intro-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
        {actions ? <div className="hero-actions">{actions}</div> : null}
      </div>
      {aside ? <div className="page-intro-aside">{aside}</div> : null}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </Card>
  );
}

export function MetricPill({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: string | number;
  tone?: Tone;
}) {
  return (
    <div className={`metric-pill metric-pill-${tone}`}>
      <span className="metric-pill-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Callout({
  title,
  description,
  tone = 'info',
  action
}: {
  title: string;
  description: string;
  tone?: Tone;
  action?: ReactNode;
}) {
  return (
    <div className={`callout callout-${tone}`}>
      <div className="callout-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action ? <div className="callout-action">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({
  label,
  value,
  max = 100,
  caption,
  tone = 'info'
}: {
  label: string;
  value: number;
  max?: number;
  caption?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}) {
  const percent = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="progress-block">
      <div className="progress-head">
        <span className="progress-label">{label}</span>
        <strong>{Math.round(percent)}%</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className={`progress-fill progress-${tone}`} style={{ width: `${percent}%` }} />
      </div>
      {caption ? <div className="muted small">{caption}</div> : null}
    </div>
  );
}

export function MiniBarChart({
  values,
  labels,
  height = 90
}: {
  values: number[];
  labels?: string[];
  height?: number;
}) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const width = safeValues.length * 28 + (safeValues.length - 1) * 12;

  return (
    <div className="mini-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Simple bar chart">
        {safeValues.map((value, index) => {
          const barHeight = Math.max(6, (value / max) * (height - 18));
          const x = index * 40;
          const y = height - barHeight;
          return (
            <g key={`${labels?.[index] ?? index}-${value}`}>
              <rect x={x} y={y} width="28" height={barHeight} rx="8" className="mini-chart-bar" />
              {labels?.[index] ? <text x={x + 14} y={height - 2} textAnchor="middle" className="mini-chart-label">{labels[index]}</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Sparkline({
  values,
  colorClass = 'info'
}: {
  values: number[];
  colorClass?: 'info' | 'success' | 'warning' | 'danger';
}) {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const width = Math.max(160, safeValues.length * 28);
  const height = 72;
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? width / 2 : (index / (safeValues.length - 1)) * (width - 10) + 5;
      const y = height - 8 - ((value - min) / Math.max(max - min, 1)) * 48;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`sparkline sparkline-${colorClass}`} role="img" aria-label="Trend line chart">
      <polyline points={points} fill="none" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Notice({
  title,
  description,
  tone = 'info'
}: {
  title: string;
  description?: string;
  tone?: Tone;
}) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="muted small">{hint}</span> : null}
    </label>
  );
}

export function SegmentedControl({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string; count?: number }>;
}) {
  return (
    <div className="segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`segment ${value === option.value ? 'active' : ''}`.trim()}
          type="button"
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {option.count !== undefined ? <strong>{option.count}</strong> : null}
        </button>
      ))}
    </div>
  );
}

export function DateLine({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="date-line">
      <span className="muted small">{label}</span>
      <strong>{formatDate(value ?? null)}</strong>
    </div>
  );
}
