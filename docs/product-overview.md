# Product Overview

## Positioning

`trace_itself` is a self-hosted personal execution intelligence system for multi-track learning, research, project delivery, and self-observation.

It is intentionally positioned above a generic to-do app and below a heavy enterprise planning suite:

- more operational than a note-taking tool
- more personal and lightweight than enterprise work management software
- more actionable than a passive analytics dashboard

## The Problem

Most personal productivity systems fail in one of three ways:

- they become task graveyards
- they optimize for capture instead of execution
- they report activity without helping the operator decide what to do next

`trace_itself` is built to answer the operational questions that matter in under a minute:

- What am I working on right now?
- What is overdue?
- Which important track is drifting?
- What did I actually do recently?
- What should I do next?
- Where is time going?
- Which long-term missions are moving versus stalling?

## Product Thesis

The system should feel like a control room for personal execution.

That means:

- clarity over visual novelty
- signal over decoration
- actionability over passive reporting
- fast scanning over dense reading
- pragmatic architecture over overbuilt abstraction

## Core Product Modules

### 1. Mission Control Dashboard

The dashboard is the command center. It surfaces:

- ranked next actions
- drift and stagnation alerts
- a read-only mission timeline
- recent execution flow
- project health radar
- reality-gap metrics between planning and actual execution
- a weekly command review

### 2. Project Tracer

Structured execution model:

- projects
- milestones
- tasks
- daily logs

This is the operational core that feeds the dashboard.

### 3. Daily Accountability Layer

Daily logs give the system behavioral memory:

- summary of what moved
- blockers
- declared next step
- focus-hours signal

### 4. Audio Workspace

The audio side extends the system beyond manual tracking:

- local ASR
- transcript storage
- meeting notes
- summaries and action items
- live capture that can keep running while users browse other app pages

That makes the repo broader than a simple task manager while still keeping execution as the primary theme.

## Why This Is Useful

Personally useful:

- reduces scanning cost every morning
- makes overdue work visible
- helps restart stalled tracks
- turns daily logs into a working memory system

Portfolio useful:

- shows product thinking, not just CRUD
- demonstrates full-stack API and UI composition
- creates room for systems-design discussion
- is easy to explain in interviews and demos

## Non-Goals

This project is intentionally not trying to be:

- a team collaboration platform
- a generic enterprise PM suite
- a drag-and-drop gantt editor
- a notification platform
- an AI gimmick app

## Why MVP Matters Here

The product is strongest when the architecture stays understandable.

Current MVP choices:

- single-user execution intelligence, even if auth supports multiple accounts
- no heavy event-sourcing pipeline yet
- no drag-and-drop timeline editing
- no complex forecasting engine
- no unnecessary AI in core dashboard logic

That constraint is deliberate. The goal is a sharp, demo-worthy execution OS, not an overbuilt planning platform.
