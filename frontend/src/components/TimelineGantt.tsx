'use client';

import type { CSSProperties } from 'react';
import { formatDate } from '../lib/dates';
import { formatEnumLabel } from '../lib/presentation';
import type { DashboardTimeline, DashboardTimelineMilestone } from '../types';

const axisDateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric'
});

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
}

function diffDays(start: string, end: string) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  const msPerDay = 86400000;
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay);
}

function isWithinWindow(value: string | null | undefined, windowStart: string, windowEnd: string) {
  if (!value) {
    return false;
  }
  return value >= windowStart && value <= windowEnd;
}

function placementForDate(value: string, windowStart: string, totalSlots: number) {
  const offset = diffDays(windowStart, value);
  return ((offset + 0.5) / totalSlots) * 100;
}

function placementForBar(startDate: string, endDate: string, windowStart: string, windowEnd: string) {
  const totalSlots = Math.max(1, diffDays(windowStart, windowEnd) + 1);
  const visibleStart = startDate < windowStart ? windowStart : startDate;
  const visibleEnd = endDate > windowEnd ? windowEnd : endDate;
  if (visibleEnd < windowStart || visibleStart > windowEnd || visibleStart > visibleEnd) {
    return null;
  }

  const startOffset = diffDays(windowStart, visibleStart);
  const endOffset = diffDays(windowStart, visibleEnd);
  const spanDays = endOffset - startOffset + 1;
  return {
    left: (startOffset / totalSlots) * 100,
    width: (spanDays / totalSlots) * 100
  };
}

function timelineToneForMilestone(milestone: DashboardTimelineMilestone, today: string) {
  if (milestone.status !== 'completed' && milestone.due_date < today) {
    return 'overdue';
  }
  switch (milestone.status) {
    case 'completed':
      return 'completed';
    case 'active':
      return 'active';
    case 'planned':
    default:
      return 'planned';
  }
}

function tooltipForMilestone(milestone: DashboardTimelineMilestone, today: string) {
  const tone = timelineToneForMilestone(milestone, today);
  const statusLabel = tone === 'overdue' ? 'Overdue' : formatEnumLabel(milestone.status);
  return `${milestone.title}\nDue ${formatDate(milestone.due_date)}\n${statusLabel}`;
}

function barStyle(startDate: string, endDate: string, windowStart: string, windowEnd: string): CSSProperties | null {
  const placement = placementForBar(startDate, endDate, windowStart, windowEnd);
  if (!placement) {
    return null;
  }
  return {
    left: `${placement.left}%`,
    width: `max(0.95rem, ${placement.width}%)`
  };
}

export function TimelineGantt({ timeline }: { timeline: DashboardTimeline }) {
  const totalSlots = Math.max(1, diffDays(timeline.window_start, timeline.window_end) + 1);
  const tickOffsets: number[] = [];

  for (let offset = 0; offset < totalSlots; offset += 7) {
    tickOffsets.push(offset);
  }
  if (tickOffsets[tickOffsets.length - 1] !== totalSlots - 1) {
    tickOffsets.push(totalSlots - 1);
  }

  const todayLeft = isWithinWindow(timeline.today, timeline.window_start, timeline.window_end)
    ? placementForDate(timeline.today, timeline.window_start, totalSlots)
    : null;

  if (!timeline.projects.length) {
    return (
      <div className="empty-state gantt-empty-state">
        <h3>No milestones in range</h3>
        <p className="muted">Active projects with milestones due within 30 days of today will appear here.</p>
      </div>
    );
  }

  return (
    <div className="gantt-shell">
      <div className="gantt-toolbar">
        <div className="gantt-legend" aria-hidden="true">
          <span className="gantt-legend-item"><i className="gantt-swatch gantt-swatch-planned" />Not started</span>
          <span className="gantt-legend-item"><i className="gantt-swatch gantt-swatch-active" />In progress</span>
          <span className="gantt-legend-item"><i className="gantt-swatch gantt-swatch-completed" />Completed</span>
          <span className="gantt-legend-item"><i className="gantt-swatch gantt-swatch-overdue" />Overdue</span>
          <span className="gantt-legend-item"><i className="gantt-swatch gantt-swatch-target" />Target date</span>
        </div>
        <div className="muted small">
          {formatDate(timeline.window_start)} to {formatDate(timeline.window_end)}
        </div>
      </div>

      <div className="gantt-board" role="img" aria-label="Mini gantt timeline for active projects and milestones">
        <div className="gantt-axis">
          <div className="gantt-axis-label">Project</div>
          <div className="gantt-axis-track">
            {tickOffsets.map((offset) => {
              const tickDate = addDays(timeline.window_start, offset);
              const left = `${placementForDate(tickDate, timeline.window_start, totalSlots)}%`;
              return (
                <div key={tickDate} className="gantt-axis-tick" style={{ left }}>
                  <span>{axisDateFormatter.format(parseIsoDate(tickDate))}</span>
                </div>
              );
            })}
            {todayLeft !== null ? (
              <div className="gantt-today-line gantt-today-line-axis" style={{ left: `${todayLeft}%` }}>
                <span>Today</span>
              </div>
            ) : null}
          </div>
        </div>

        {timeline.projects.map((project) => {
          const targetLeft =
            project.target_date && isWithinWindow(project.target_date, timeline.window_start, timeline.window_end)
              ? placementForDate(project.target_date, timeline.window_start, totalSlots)
              : null;

          return (
            <div key={project.id} className="gantt-row">
              <div className="gantt-row-label">
                <div className="gantt-row-title">{project.name}</div>
                <div className="gantt-row-meta">
                  <span>
                    {project.milestones.length} milestone{project.milestones.length === 1 ? '' : 's'}
                  </span>
                  <span>{project.target_date ? `Target ${formatDate(project.target_date)}` : 'No target date'}</span>
                </div>
              </div>

              <div className="gantt-track">
                {tickOffsets.map((offset) => {
                  const tickDate = addDays(timeline.window_start, offset);
                  const left = `${placementForDate(tickDate, timeline.window_start, totalSlots)}%`;
                  return <div key={`${project.id}-${tickDate}`} className="gantt-grid-line" style={{ left }} aria-hidden="true" />;
                })}

                {todayLeft !== null ? <div className="gantt-today-line" style={{ left: `${todayLeft}%` }} aria-hidden="true" /> : null}

                {targetLeft !== null ? (
                  <div
                    className="gantt-target-marker"
                    style={{ left: `${targetLeft}%` }}
                    title={`Target date\n${formatDate(project.target_date)}`}
                    aria-label={`Target date ${formatDate(project.target_date)}`}
                  />
                ) : null}

                {project.milestones.map((milestone) => {
                  const tone = timelineToneForMilestone(milestone, timeline.today);
                  const style = barStyle(milestone.start_date, milestone.due_date, timeline.window_start, timeline.window_end);
                  if (!style) {
                    return null;
                  }
                  return (
                    <div
                      key={milestone.id}
                      className={`gantt-bar gantt-bar-${tone}`}
                      style={style}
                      title={tooltipForMilestone(milestone, timeline.today)}
                      aria-label={tooltipForMilestone(milestone, timeline.today)}
                    >
                      <span>{milestone.title}</span>
                    </div>
                  );
                })}

                {!project.milestones.length ? <div className="gantt-empty muted small">No milestones in this 60-day view.</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
