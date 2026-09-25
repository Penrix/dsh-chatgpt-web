# ADR-0003 — Lossless replies and operator-controlled send safety

Status: Accepted
Date: 2026-09-25

## Context

Offline review reproduced a transport bug: converting displayed JSON through
Turndown inserts Markdown escapes, rejects valid replies and can silently double
backslashes in paths. Earlier underscore/array parser tolerances did not remove
the source of corruption. Historical incidents are not all proven to share this
cause; no new live inference was used to diagnose it.

The user requires at least 30 seconds between test Sends, no parallel-window
bypass, and a stop on rate limits. Fresh-page pacing alone does not enforce a
Send interval, and an in-memory gate resets across adapters/processes.

## Decision

- Request a single fenced JSON code body, which avoids Markdown interpretation
  of string content. Extract its text directly, without HTML-to-Markdown
  conversion. Reject competing content/blocks. Plain displayed JSON remains
  compatible but cannot reconstruct characters already changed by rendering.
- Keep exact tool-name/schema validation and the existing uncertainty boundary.
  Do not broaden string-repair heuristics to cover new malformed responses.
- All updated adapter instances for one OS user share a filesystem turn lock
  and durable send state under `~/.dsh-chatgpt-web-penrix/send-safety`.
  This deliberately serializes different profiles too, because the adapter
  cannot reliably identify the signed-in account.
- Hold the lock through response completion and page cleanup. Wait at least
  30 seconds when prior Send time is unknown. Persist the next allowed time,
  counting from click settlement; retain any longer persisted wait.
- Keep the additional fresh-page 8-per-300-second gate and history cooldowns;
  raise its minimum interval to 30 seconds, not lower any existing cooldown.
- Disable host automatic retries for this provider. Persist a stop for detected
  limit/account warnings; an unresolved dispatched turn also prevents another
  Send. A crash does not automatically expire or steal the lock.
- Live evidence is reserved exclusively before effects. `ResumeM2` produces
  uniquely named evidence but still restarts M2; it is NOT a stage checkpoint.

## Consequences and recovery

This protection covers updated plugin processes on this OS user, not manual
browser use, old installed builds, other machines or other applications. It
does not guarantee that ChatGPT will not impose restrictions.

On a retained lock or stopped state, stop testing. An operator must inspect the
prior evidence and active processes, verify that the previous response is no
longer running, and resolve any delivery uncertainty before explicitly clearing
the local safety state. Never clear it automatically, change profiles to evade
it, or remove a browser profile to recover. After a confirmed reset the missing
timestamp incurs a fresh 30-second wait.

Local source/build checks are not Desktop installation or live acceptance.
Old M1 evidence remains historical evidence, not proof for changed provider
bytes. Full M2 checkpoint/resume, real same-session model-to-WebCodex acceptance
and cognitive-quality experiments remain separate unfinished work.
