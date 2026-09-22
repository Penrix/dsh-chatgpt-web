# Third-party references

Phase 1 is a clean, minimal implementation informed by public projects rather
than a wholesale source-tree import.

Important references:

- deepseek-ai/deepseek-harness — MIT — LlmAdapter / Session / persistence contracts.
- twilightt1/dsh-llm-chatgpt-web — MIT — fresh Temporary Chat per DSH inference, prompt envelope, browser completion and login patterns.
- NishiMihaeru/dsh-chatgpt-web — MIT — DSH-as-source-of-truth and post-Send uncertainty boundary.
- 2025ashore/DSH-Brain-Bridge — MIT — immutable reasoning snapshot and “model proposes, DSH executes” authority split.
- miuuyy/codex-chatgpt-web — MIT — ChatGPT Web browser transport and diagnostics.
- xicv/ego-chat — MIT — durable browser transaction / no blind resend after confirmed Send.
- jackwener/opencli — Apache-2.0 — logged-in browser automation and ChatGPT UI compatibility patterns.

If implementation code is copied or substantially derived later, add the
specific file-level copyright/license notice here and preserve the source
license as required.


## Imported Phase-1 selector code

The following files are imported/adapted from
`twilightt1/dsh-llm-chatgpt-web` under the MIT License:

- `src/chatgpt/model.ts`
- `src/chatgpt/session.ts`
- `src/chatgpt/effort.ts`
- `src/chatgpt/guards.ts`

That upstream repository notes that portions of its ChatGPT session/model
selector logic derive from `miuuyy/codex-chatgpt-web`, also MIT licensed.
The upstream copyright/license notices are preserved in the source comments.
