# Acceptance contract

Architecture documents describe intent. This file states what must actually be true before we call the system working.

These are product invariants, not aspirational prose.

## A. Provider invariants

- DSH remains the canonical live session.
- Every ChatGPT Web inference can be recreated from DSH-visible state.
- A provider page/conversation may be discarded without losing canonical task identity.
- `source.kind=user` and `source.kind=plugin` are never conflated.
- After Send may have occurred, the provider does not blindly resubmit.
- Final output must have positive completion evidence before being committed.

## B. Tool-loop invariants

- ChatGPT Web receives only the tools DSH explicitly exposes.
- A model-proposed tool name must exactly match an exposed DSH tool.
- Arguments are validated against the exact schema before execution.
- Malformed proposals fail closed.
- ChatGPT Web never fabricates a successful local effect.
- Tool results are written back into the same canonical DSH Session before the next inference.

## C. meow-memory invariants

- Memory snapshots are context, not human commands.
- The newest genuine human message remains the response target.
- `memory_search`, `memory_project`, `memory_read`, `memory_remember` and `memory_update` work through the normal DSH loop.
- DSH compaction does not permanently erase durable memory from the active reasoning surface.
- meow-memory entries are treated as derived memory, not original historical truth.
- A suspected bad memory can be checked against raw DSH/DVR evidence.

## D. WebCodex invariants

- WebCodex remains authoritative for local effect truth.
- Files/Git/Jobs are never reconstructed from model claims when WebCodex can report them directly.
- An ambiguous transport/effect boundary is reconciled before retry.
- Provider failure must not delete durable WebCodex work state.

## E. Continuity invariants

A valid continuity test must kill at least one transient component.

Examples:

```text
kill Web page → continue same DSH session
restart browser daemon → continue same DSH session
compact DSH context → memory reinjects
replace ChatGPT inference page → same task identity
lose provider response after possible Send → no blind duplicate
```

A test that keeps every component alive does not prove durable continuity.

## F. First end-to-end acceptance scenario

1. Start one DSH Session using the ChatGPT Web provider.
2. meow-memory injects long-term context.
3. User asks for a small fact/project-memory operation.
4. ChatGPT proposes `memory_search`.
5. DSH validates and executes it.
6. Tool result returns to the same Session.
7. ChatGPT uses the result and answers the user.
8. ChatGPT records one durable memory with `memory_remember`.
9. Start a fresh provider page/Temporary Chat.
10. Continue the same DSH Session and retrieve that memory.
11. Trigger/perform a DSH compaction and confirm reinjection.
12. Verify no step depended on a persistent ChatGPT Web conversation.

Only after this passes should WebCodex be added to the same loop.

## G. Definition of done for architecture-changing work

A change that modifies component ownership, continuity semantics or retry behavior is not done until:

- code is changed;
- focused tests exist;
- the relevant ADR/doc is updated;
- failure behavior is documented;
- actual validation status is stated truthfully;
- unexecuted tests are never described as passing.

This is how the project avoids "the code changed but the cognition stayed in an old chat".