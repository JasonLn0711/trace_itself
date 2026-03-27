# Dashboard Architecture

## Goal

The dashboard is designed as a mission-control surface for personal execution.

It is optimized to answer:

- what needs attention now
- where execution is drifting
- what recently moved
- which missions are progressing
- where planned work diverges from actual execution

## Information Architecture

### Top Bar

- product identity
- current date
- quick actions
- compact execution signals

### Left Column: Decision Support

- `Now`
  Ranked next actions from the next-action engine
- `Alerts`
  Drift, stagnation, milestone-risk, and backlog-pressure signals

### Center Column: Situational Awareness

- `Mission Timeline`
  Read-only strategic timeline of active projects and milestones
- `Execution Flow`
  Recent completions, daily logs, milestone progress, and project activity

### Right Column: Operational Analytics

- `Project Radar`
  Track-level health, last activity, progress, and open-work pressure
- `Reality Gap`
  Planned versus completed work, hours variance, delay rate, and overdue ratio

### Bottom Section

- `Weekly Command Review`
  A compact weekly execution summary with progress, blockers, focus signal, and inactive tracks

## Backend Endpoints

The dashboard is intentionally decomposed into focused endpoints rather than one oversized payload.

### `GET /dashboard/summary`

Baseline execution snapshot used for:

- overdue count
- due-today count
- daily-log context
- focus-hours sparkline

### `GET /dashboard/next-actions`

Ranks execution candidates using heuristics such as:

- overdue tasks
- blocked tasks
- due-soon work
- milestone urgency
- recovery actions for stagnant projects

### `GET /dashboard/stagnation`

Returns:

- drift alerts
- milestone risk alerts
- backlog-pressure alerts
- project health rows for the radar panel

### `GET /dashboard/reality-gap`

Returns:

- planned tasks this week
- completed tasks this week
- weekly completion rate
- estimated versus actual hours
- overdue ratio
- delay rate
- a small weekly trend series

### `GET /dashboard/weekly-review`

Returns:

- completed tasks this week
- overdue count
- most active project
- inactive projects
- total focus hours
- biggest progress
- biggest blocker
- summary text

### `GET /dashboard/activity-feed`

Builds a recent execution feed from:

- daily log updates
- task completions
- task blockers / in-progress changes
- milestone progress / completion
- project updates

### `GET /dashboard/timeline`

Returns the read-only mission timeline payload:

- active projects
- milestones in a fixed date window
- inferred milestone start dates
- window boundaries and today marker reference

## Timeline Positioning Logic

The mission timeline uses a fixed window of `today +/- 30 days`.

Each milestone bar is rendered as:

- `left`
  days from `window_start` to milestone `start_date`
- `width`
  visible duration between `start_date` and `due_date`, clipped to the dashboard window

Today and target-date markers are rendered at the center of their calendar day.

## Heuristic Design

### Next-Action Engine

Prioritization order:

1. overdue tasks
2. blocked tasks on active projects
3. due-soon tasks
4. due-soon or overdue milestones
5. recovery actions for stagnant projects

### Stagnation Detector

Current signals:

- no meaningful project activity for 7+ days
- milestone due soon with low progress
- too many open tasks and no recent completion
- target-date slip with unfinished work

Not yet tracked:

- explicit reschedule counts
- repeated postponement patterns across task edits

### Reality Gap Analyzer

Current weekly metrics use:

- task due dates as planning signal
- task `updated_at` when status is `done` as completion signal
- estimated hours from scheduled work
- actual hours from completed work

This is pragmatic and explainable, but not yet a full planning ledger.

## Data Model Tradeoffs

The current dashboard deliberately reuses existing relational data:

- `projects`
- `milestones`
- `tasks`
- `daily_logs`

This avoids a premature event-sourcing layer.

Future improvements can add:

- explicit activity events
- task reschedule counts
- explicit milestone `start_date`
- project `last_activity_at`

## Frontend Composition

The frontend mirrors the backend decomposition:

- each mission-control panel maps to one focused response shape
- data loads in parallel
- panels can degrade independently if one endpoint fails
- the visual system stays dense but readable

That architecture keeps the dashboard fast to iterate on without turning the UI into a monolith.
