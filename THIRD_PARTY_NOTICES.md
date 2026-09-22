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


## MIT notice — twilightt1/dsh-llm-chatgpt-web

Copyright (c) 2026 dsh-llm-chatgpt-web contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## MIT notice — miuuyy/codex-chatgpt-web

Copyright (c) 2026 codex-chatgpt-web contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
