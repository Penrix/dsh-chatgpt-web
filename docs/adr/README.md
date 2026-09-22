# Architecture Decision Records

This directory records decisions that future work must not silently reverse.

## When to write an ADR

Create a new ADR when a change affects:

- which component owns authoritative state;
- the boundary between DSH, ChatGPT Web, meow-memory, WebCodex or DVR;
- provider delivery / retry semantics;
- long-term memory semantics;
- a compatibility assumption that materially constrains implementation;
- a previously accepted architecture direction.

Do not rewrite an accepted ADR to make history look cleaner. If a decision changes, keep the old ADR, mark it superseded, create a new ADR, and explain what new evidence changed the decision.

## Status values

- Proposed
- Accepted
- Superseded
- Rejected

## Minimal template

```md
# ADR-NNNN — title

Status: Accepted
Date: YYYY-MM-DD

## Context
Why was a decision needed?

## Decision
What did we decide?

## Consequences
What becomes easier or harder?

## Rejected alternatives
What did we explicitly choose not to do, and why?
```

## Current ADRs

- [ADR-0001 — Authority split and system spine](0001-authority-split-and-system-spine.md)
- [ADR-0002 — Adopt dsh-meow-memory](0002-adopt-dsh-meow-memory.md)