# Beta validation — v1.4.0

Validated on 2026-10-04. The VPS runtime is enabled; public launchers and
installation remain paused during release preparation.

## Changes

- Model switches retain the conversation and add a factual handoff. Compacted
  turns and full delegated transcripts remain searchable.
- Native calls and dedicated text tool blocks both work in Agent mode. Equivalent
  representations in one response execute once. Ordinary JSON examples do not
  execute as tools.
- Up to three subagents can run concurrently. Explorers/reviewers are read-only;
  workers inherit permissions. Reports include actual tool outcomes. Pending
  approvals are serialized, and parent streaming output waits while a question
  is open.
- Context usage appears near the input. `/context` distinguishes estimates from
  reported usage and exposes provider or locally configured model limits.
  Context recovery preserves original session records.
- Searches support files, directories, globs, literal queries, cancellation,
  and bounded output. Text searches execute argument arrays without a shell.
- Session saves replace files atomically with private permissions. File edits
  awaiting approval reject stale contents rather than overwriting another change.

## Evidence

`npm test`: **147 passed, 0 failed**. Coverage includes local HTTP/SSE fixtures,
headless terminal resizing/reconnection, input while streaming, tool pairing,
model handoff, subagent cancellation/permissions, concurrent approvals, context
recovery, session persistence, and paused public launchers.

Live requests through the configured router with `kimi-k3` read a synthetic
marker file through the text bridge. A delegated explorer independently read
that file and returned a real `view_file` result, which the parent integrated.
A separate model-switch request correctly identified that a failed previous
provider response had performed no file read.

## Remaining limits

Provider availability and response time remain external dependencies. A live
`glm-5.3` request returned an unavailable-service placeholder; this is now treated
as a failure rather than a successful answer. Models still need to follow the
provided tool protocol. Context estimates use request byte size rather than a
model tokenizer, and no model limit is guessed when metadata is absent.

Headless terminal tests do not replace validation in the user's exact mobile SSH
client. Concurrent workers should receive distinct files. Approval levels are
execution policy, not an operating-system sandbox.
