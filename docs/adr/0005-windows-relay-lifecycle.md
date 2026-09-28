# ADR-0005 — Windows relay lifecycle belongs to Codex Web GPT Launcher

Status: Superseded by ADR-0006
Date: 2026-09-28

## Context

ADR-0004 delegates the hard ChatGPT Web browser transport to `codex-chatgpt-web`.
The first Windows M1 relay acceptance then failed before any model Send with
`ECONNREFUSED 127.0.0.1:17841`.

That failure exposed an implicit lifecycle assumption: installation/configuration
of `codex-chatgpt-web` had been treated as if it implied that its Responses
daemon was continuously available.

Current upstream source shows that assumption is false on Windows.

The production Codex Web GPT Launcher:

- configures the runtime with `--browser-host-descriptor`;
- that setup stores `browserHost: "launcher"`;
- rejects terminal-only managed-Chrome setup on Windows/Linux;
- starts the configured Responses runtime through
  `runtimeSupervisor.startIfConfigured()` when the Launcher starts;
- shuts the runtime down when the Launcher explicitly quits.

The Launcher defaults also express the intended desktop lifecycle:

- `autoStart: true`;
- `keepRunningOnClose: true`.

Closing the window can therefore leave the Launcher/runtime alive in the tray,
while explicitly quitting Codex Web GPT intentionally tears the transport down.

A foreground `codex-chatgpt-web serve` process is not a general substitute for
this production ownership model: a launcher-owned browser config still depends
on the Launcher's browser descriptor/control surface.

## Decision

On Windows, treat **Codex Web GPT Launcher as the owner of the ChatGPT Web
transport process and browser host**.

The intended steady state is:

```text
Windows login
→ Codex Web GPT auto-starts
→ Launcher remains running in tray
→ Launcher starts/supervises browser-only Responses runtime
→ 127.0.0.1:17841
→ dsh-chatgpt-web uses it as an external local transport
```

Rules:

1. DSH and `dsh-chatgpt-web` do not spawn, restart, supervise, or kill the
   Launcher/runtime as part of ordinary inference.
2. DSH must not create a second Windows service for this transport.
3. DSH must not silently fall back to its old direct-browser path when an
   explicitly configured relay is unavailable.
4. A missing relay is an environment/lifecycle error. Surface it clearly and
   tell the operator that the Launcher/runtime owner is absent.
5. Closing the Codex Web GPT window is compatible with continued transport only
   when the Launcher remains in the tray.
6. Explicitly quitting Codex Web GPT is treated as an intentional transport
   shutdown; DSH does not automatically resurrect it.
7. Do not run a separate model probe merely to test lifecycle. Process/config/
   log/loopback evidence is sufficient for lifecycle diagnosis.
8. Real model quota is reserved for an end-to-end acceptance that proves a
   useful product chain, not for checking whether port 17841 is listening.

## Consequences

Positive:

- one process owns the Launcher browser surface and Responses runtime;
- DSH remains a client instead of becoming another desktop process manager;
- browser authentication/profile ownership stays with the component that
  already owns it;
- no duplicate Windows service, daemon registry, retry supervisor or startup
  state machine is added;
- closing the visible window need not interrupt DSH when tray residency is
  enabled.

Cost:

- Windows DSH-to-ChatGPT-Web depends on Codex Web GPT being alive in the tray;
- an explicit Launcher exit intentionally makes the provider unavailable;
- deployment now has a documented external-process prerequisite.

Operationally, the normal fix for an absent relay is to restore the Launcher
runtime, not to modify DSH provider code or send another model prompt.

## Rejected alternatives

### DSH starts `codex-chatgpt-web serve` on demand

Rejected because the Windows production setup is Launcher-owned and may depend
on the Launcher's browser descriptor/control surface. It would also give DSH
process-lifecycle authority that belongs to the specialized transport component.

### Create a separate Windows Service for the relay

Rejected as unnecessary duplicate lifecycle infrastructure. The Launcher
already supports auto-start, tray residency, browser ownership and runtime
supervision.

### Reconfigure Windows to terminal-only managed Chrome

Rejected because current upstream explicitly supports that terminal-only mode
only on macOS. Reconfiguring would also split browser/login ownership from the
existing Launcher without a product need.

### Automatically restart the Launcher when DSH sees connection refused

Rejected. A user may have explicitly quit Codex Web GPT. Automatically
resurrecting an external desktop application would override that intent and add
a new process-management state machine.
