# Future Roadmap

## v2: Better Execution Memory

The next serious upgrade should deepen signal quality without bloating the product.

### Candidate improvements

- add a lightweight `activity_events` table for durable execution history
- add task reschedule / postponement count
- add explicit milestone `start_date`
- store `project.last_activity_at`
- add `daily_log.energy_level`
- add `daily_log.focus_quality`
- add filters on mission-control panels
- add click-through drilldowns from every dashboard card
- add true real-time live speaker diarization once the saved-audio diarization path has proved stable enough to justify streaming speaker-state complexity

### Product outcome

This would make drift detection sharper and improve the trustworthiness of the execution feed.

## v3: Planning Versus Reality Engine

This phase should move from descriptive intelligence to operational guidance.

### Candidate improvements

- weekly plan capture and review workflow
- mission-level forecasting
- expected finish date projection
- completion trend forecasting per track
- schedule slip risk scoring
- more explicit “recovery path” suggestions

### Product outcome

The system becomes not just a mirror of execution, but a tool for steering it.

## v4: Deep Personal Intelligence Layer

Only pursue this if the earlier versions become genuinely useful in daily life.

### Candidate improvements

- correlation between focus quality and task outcomes
- blocker-pattern analysis
- learning-track velocity analysis
- retrospective summaries over monthly or quarterly windows
- optional AI-generated weekly briefings using private execution data

### Product outcome

The product evolves from a dashboard into a true personal execution intelligence layer.

## Explicit Non-Goals

Even in later versions, avoid drifting into:

- generic team SaaS
- noisy notification systems
- heavy workflow builders
- decorative analytics with no action path
- AI-generated fluff that obscures real execution state

## Strategic Principle

Every version should preserve the original standard:

`trace_itself` should remain a high-signal, self-hosted execution operating system that is personally useful and technically impressive without becoming bloated.
