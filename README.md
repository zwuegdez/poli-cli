# Poli CLI

[![Tests](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml/badge.svg)](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Status: Not released](https://img.shields.io/badge/status-not%20released-orange.svg)

A terminal coding assistant with streaming chat, local workspace tools, and a
searchable model picker. Poli focuses on readable conversation output and
reliable input while the model replies and tools run, including over SSH.

> **Status: under development, not ready for release.**
> Public command entrypoints (including those in a source checkout) and the
> installer currently print **"Coming soon"** and exit. They do not
> authenticate, connect to models, run workspace tools, or start an interactive
> session. `npm run ui:preview` only renders a static gallery of interface
> surfaces for reviewers. Setup and usage instructions will be published when
> CLI access opens.

This repository contains the implementation for review and contribution while
the release is prepared. Poli CLI is an independent project, not an official
OpenAI, Anthropic, or Google product. Model services and API access are
separate from this repository.

## Contents

- [Planned features](#planned-features)
- [Slash commands](#slash-commands)
- [Development](#development)
- [Project layout](#project-layout)
- [Security and data boundaries](#security-and-data-boundaries)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [License](#license)

## Planned features

These describe the unreleased implementation. The public launchers remain
paused.

### Conversation and input

- **Chat and Agent modes:** plain conversation, or file inspection, search,
  proposed edits, and shell operations.
- **Responsive input:** a frameless multiline editor with light green activity
  cues, visible pasted lines, Unicode-aware editing, and queued follow-ups
  during streaming. Up/Down edits multiline drafts; Ctrl+J inserts a newline.
- **Resume:** sessions are saved per workspace. `/resume` restores a chat with a
  compact work log (original task, confirmed file changes, command outcomes,
  pending actions). Full records stay searchable, and saves use atomic
  replacement.

### Models

- **Searchable picker:** search by display name or API ID. `/models My Custom
  Name` or `poli models "My Custom Name"` selects by name; requests and saved
  settings always use the original API ID.
- **Context continuity:** switching models keeps the conversation, using a
  factual handoff of earlier requests and recorded tool results.
  `search_history` can recover compacted turns.
- **Catalog fallback:** if Poliai refuses `/v1/models` because of host routing,
  `/models` uses the public catalog at `https://router.poliai.qzz.io/v1/catalog`.
  Inference still uses the configured proxy URL, and account restrictions still
  apply. Automatic lookups use a 30-second cache; `/models` always refreshes.
- **Retries:** HTTP 502, 503, 504, and empty model responses share up to 10
  attempts within the request timeout. `/retry` starts a fresh sequence. An
  active stream is never replayed.

### Tools and safety

- **Permissions:** `/permission` selects Read-only, Ask before changes, or Full
  access (`/permision` and `/permissions` are aliases). The choice is saved.
  Read-only blocks edits, patches, and shell commands.
- **Action review:** diff previews, approval prompts, and expandable tool
  results. File tools, search, shell commands, Git diff, and validated unified
  patches run real workspace operations. `/run` follows the selected
  permissions.
- **Subagents:** delegate independent tasks to up to three concurrent agents.
  Explorers and reviewers are read-only; workers inherit the current
  permissions. Agents share the workspace but keep separate conversations, and
  return reports alongside actual tool outcomes. Cancellation stops delegated
  work, approval prompts are serialized, and full transcripts persist with the
  session.

### Context management

- The estimated size of the current request is shown near the input.
- `/new` starts a separate chat and saves the previous one for `/resume`.
- Long requests keep the current instruction and complete recent tool rounds;
  original records remain searchable locally.
- `/context` shows provider-reported usage, model limits, and archived-message
  counts. `/context 128k` sets a per-model budget when metadata is missing;
  `/context auto` restores metadata detection.

### Transport and model settings

- **Transport:** OpenAI-compatible chat completions with native function
  calling, plus a validated text tool bridge for models with unreliable native
  tool metadata. Equivalent native and text requests in one response execute
  once.
- **API format:** `/settings` selects OpenAI-compatible Chat Completions or
  Anthropic-compatible Messages through your configured proxy. The choice is
  saved per model and applies to its next request. `/settings openai` and
  `/settings anthropic` select directly; use `/retry` to retry a failed request
  with the new format. New models default to Chat Completions.
- **Streaming:** `/settings stream` forces native streaming, `/settings auto`
  streams with an empty-stream fallback, and `/settings buffered` waits for the
  full reply. Native streaming requires the provider to send text or tool
  deltas.
- **Empty-stream fallback:** if an Anthropic stream completes with no answer or
  tool call, the CLI retries once with `stream: false` on the same endpoint and
  remembers the working buffered mode for one hour, including across restarts.
  Changing `/settings` clears that memory and retries streaming.
- **Reasoning:** `/settings reasoning auto|off|low|medium|high`, saved per
  model. Auto sends no override. OpenAI-compatible requests use
  `reasoning_effort`; Anthropic-compatible requests use adaptive thinking and
  `output_config.effort`. Support depends on the model and proxy; use Auto if an
  upstream rejects overrides.

## Slash commands

| Command | Purpose |
| --- | --- |
| `/models` | Open the model picker, or select by name or ID |
| `/settings` | API format, streaming, and reasoning per model |
| `/permission` | Set Read-only, Ask before changes, or Full access |
| `/context` | Show usage and limits, or set a local budget |
| `/new`, `/resume <title>` | Start a chat, or restore a saved one |
| `/rename <title>` | Name a chat so it is searchable |
| `/export [path]` | Save user and assistant text as Markdown |
| `/history <search>` | Filter the current conversation |
| `/recall` or Ctrl+R | Search earlier prompts into the composer |
| `/agents [id]`, `/agents stop <id>` | List, inspect, or stop subagents |
| `/run` | Run a command under the selected permissions |
| `/retry` | Retry a failed request |

Notes:

- `/resume` accepts a title or a unique ID prefix of at least four characters.
- `/export` excludes system instructions and tool payloads, never overwrites an
  existing file, and writes to the private `exports` directory in the CLI home
  when no path is given.
- `poli settings` configures a model without opening a chat, using the same
  arguments as `/settings`.
- Selectors search names, descriptions, and IDs, support Home/End, and use a
  compact layout in short terminals. `FORCE_COLOR=0` and `NO_COLOR` disable
  ANSI colors.

These controls exist in the internal runtime only; public entrypoints keep
their release status.

## Development

Requires Node.js 22 or newer and npm. CI runs Node.js 22 and 24.

```bash
npm ci
npm test
```

Tests use local HTTP fixtures and a headless terminal, so they need no
production credentials or live model endpoint. They cover streaming, tool
dispatch and errors, approval and cancellation, session resume, model selection
and handoff, archived-history recovery, subagent permissions, Unicode input,
and resize/reconnect rendering. Separate regression tests verify that the
public launchers stay disabled.

Passing terminal simulations does not establish compatibility with every SSH
client; real-client validation is still needed before release.

## Project layout

| Location | Responsibility |
| --- | --- |
| `bin/poli.js`, `src/cli.js`, `src/index.js` | Paused public entrypoints |
| `src/cli-runtime.js`, `src/commands/` | Unreleased command implementation |
| `src/client.js` | Chat-completions transport and streaming |
| `src/agent.js`, `src/tool-bridge.js` | Agent turns and tool-call fallback |
| `src/subagents.js`, `src/context-handoff.js` | Delegated tasks and model continuity |
| `src/tools/` | Filesystem and shell operations |
| `src/ui/` | Input editing, layout, Markdown, diffs, activity |
| `src/session.js`, `src/config.js`, `src/auth.js` | Local state and configuration |
| `tests/` | Automated regression tests |

## Security and data boundaries

- Tools run with your operating-system permissions. Approval prompts are not a
  sandbox.
- Prompts, requested file contents, and tool results are sent to the configured
  inference endpoint. The operator's data policies and billing apply.
- Credentials, sessions, and history belong outside the source repository. The
  current source includes no shared API key.
- Previously committed credentials must be rotated before the repository is
  published. Removing a key from the latest source does not remove it from Git
  history.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Known limitations

- **Mobile SSH rendering:** reconnect and keyboard-resize bugs have been
  reported. Regression coverage is growing; real iPad and SSH-client validation
  is still in progress.
- **Provider compatibility:** text tool requests depend on the model following
  the schema. Invalid requests and unsupported responses need more robust
  handling.
- **Platform coverage:** Windows shell cancellation and terminal behavior need
  further validation.
- **Release readiness:** access and installation stay paused while credential
  handling, documentation, and the launch process are reviewed.

## Contributing

Helpful areas include terminal regression coverage, provider fixtures,
accessibility, and focused bug fixes. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Third-party model services are separate from this license.
