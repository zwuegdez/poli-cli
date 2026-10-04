# Poli CLI

[![Tests](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml/badge.svg)](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A terminal coding assistant under development, with streaming chat, local
workspace tools, and a searchable model picker. The project focuses on readable
conversation output and reliable input during model replies and tool execution,
including over SSH.

## Coming soon

**CLI access is temporarily disabled.** Public command entrypoints, including
those in a source checkout, show **“Coming soon”** and exit. The installer and UI
preview also show “Coming soon.” They do not authenticate, connect to models, run
workspace tools, or start an interactive session.

This repository contains the implementation for review and contribution while
the release is prepared. Public setup and usage instructions will be added when
CLI access reopens.

Poli CLI is an independent project, not an official OpenAI, Anthropic, or Google
product. Model services and API access are separate from this repository.

## Features under development

- **Chat and Agent modes:** conversation without tools, or file inspection,
  search, proposed edits, and shell operations.
- **Model selection:** a searchable catalog picker that retains conversation
  context when switching models, with a factual handoff of earlier requests and
  recorded tool results. `search_history` can recover compacted turns.
- **Responsive input:** drafts and queued follow-ups during streaming, multiline
  paste, Unicode-aware editing, and cancellation.
- **Permissions:** `/permission` selects Read-only, Ask before changes, or
  Full access; `/permision` and `/permissions` are aliases. The choice is saved
  for future sessions. Read-only blocks edits, patches, and shell commands.
- **Action review:** diff previews, approval prompts, and expandable tool
  results. File tools, search, shell commands, Git diff, and validated unified
  patches execute real workspace operations. `/run` follows the selected
  permissions.
- **Conversation resume:** saved sessions associated with a workspace.
  Compacted records remain searchable; session saves use an atomic replacement.
- **Context window:** estimated current request size near the input, plus
  `/context` for provider-reported usage, model limits, and archived-message
  counts. `/context 128k` sets a per-model local budget when metadata is missing;
  `/context auto` restores metadata detection. Older turns compact near a known
  budget, while `search_history` retains access to their full records.
- **Subagents:** delegate independent tasks to up to three concurrent agents.
  Explorers and reviewers are read-only; workers inherit the current permissions.
  Agents share the workspace, use separate conversations, and return reports
  alongside actual tool outcomes. `/agents` shows their status. Cancellation stops
  delegated work, and approval prompts are serialized. Full delegated transcripts
  persist with the session and remain searchable with attributed results.
- **Transport compatibility:** OpenAI-compatible chat completions with native
  function calling and a validated text tool bridge.
  The bridge also handles models with unreliable native-tool metadata. Equivalent
  native and text requests in one response execute once.

These describe the unreleased implementation; the public launchers remain
paused.

## Development and validation

Use Node.js 18+ and npm. CI exercises Node.js 22 and 24.

```bash
npm ci
npm test
```

The tests use local HTTP fixtures and a headless terminal. They cover streaming,
tool dispatch and errors, approval/cancellation behavior, session resume, model
selection and handoff, archived-history recovery, subagent permissions and
cancellation, Unicode input, and resize/reconnect rendering. Separate regression
tests verify that public launchers remain disabled. Tests do not need production
credentials or a live model endpoint.

Passing terminal simulations does not establish compatibility with every SSH
client. Real-client validation is still needed before release.

| Location | Responsibility |
| --- | --- |
| `bin/poli.js`, `src/cli.js`, `src/index.js` | Paused public entrypoints |
| `src/cli-runtime.js`, `src/commands/` | Unreleased command implementation |
| `src/client.js` | Chat-completions transport and streaming |
| `src/agent.js`, `src/tool-bridge.js` | Agent turns and tool-call fallback |
| `src/subagents.js`, `src/context-handoff.js` | Delegated tasks and model continuity |
| `src/tools/` | Filesystem and shell operations |
| `src/ui/` | Input editing, layout, Markdown, diffs, and activity |
| `src/session.js`, `src/config.js`, `src/auth.js` | Local state and configuration |
| `tests/` | Automated regression tests |

## Execution and data boundaries

The unreleased implementation runs tools with the user's operating-system
permissions; approval prompts are not a sandbox. Prompts, requested file
contents, and tool results are sent to the configured inference endpoint when
the implementation is used. Its operator's data policies and billing apply.

Credentials, sessions, and history belong outside the source repository. The
current source does not include a shared API key. Previously committed
credentials must be rotated before repository publication; removing a key from
the latest source does not remove it from Git history.

## Known limitations and next work

- **Mobile SSH rendering:** reconnect and keyboard resize bugs have been
  reported. Regression coverage is growing; real iPad/SSH-client validation
  remains in progress.
- **Provider compatibility:** text tool requests depend on the model following
  the schema. Invalid requests and unsupported responses need robust handling.
- **Platform coverage:** Windows shell cancellation and terminal behavior need
  further validation.
- **Release preparation:** runtime access and installation remain paused while
  credential handling, documentation, and the launch process are reviewed.

Contributions can improve terminal regression coverage, provider fixtures,
accessibility, and focused bug fixes. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party model services are separate from this license.
