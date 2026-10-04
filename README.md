# Poli CLI

[![Tests](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml/badge.svg)](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A terminal coding assistant with streaming chat, local workspace tools, and a
searchable model picker. Poli CLI focuses on keeping the conversation readable
and the input usable while a model replies or runs tools, including over SSH.

**Status: early development. Public downloads are coming soon.** The hosted
installer currently prints “Coming soon” and makes no changes. Source checkout
is available for development once this repository is public. Existing installed
copies continue to run.

## What it does

- **Chat or work on code.** Chat mode sends conversation messages without
  workspace tools. Agent mode can read and search files, propose edits, and run
  shell commands.
- **Choose a model interactively.** `/models` searches your endpoint's catalog
  and selects a model without discarding the current conversation.
- **Keep typing during a response.** Draft a follow-up while output streams;
  Enter queues it and Esc stops the current turn.
- **Review local actions.** File changes show diffs and request approval.
  Commands classified as reads can run without a prompt; other commands request
  approval. `--yes` enables automatic approval.
- **Inspect and resume.** Compact tool summaries expand with Ctrl+T or
  `/details`. `/resume` restores a saved conversation for the current workspace.
- **Use your endpoint.** Configure an OpenAI-compatible chat-completions API.
  Native function calling is supported; a validated text tool bridge handles
  models that do not support native tool calls.

Poli CLI is an independent project. It is not an official OpenAI, Anthropic, or
Google product. API and model access come from the endpoint you configure, not
from this repository.

## Try the interface without an API key

Use Node.js 18 or newer and npm. CI exercises Node.js 22 and 24. Git is needed
for the source checkout.

```bash
git clone https://github.com/zwuegdez/poli-cli.git
cd poli-cli
npm ci
npm run ui:preview
```

The preview uses local example output. It does not contact a model or require a
paid account. Try typing, pasting, `/`, arrow keys, and Tab; Enter closes it.
Use `NO_COLOR=1` for plain terminal output.

## Run from source

Supply your own API key for the chosen endpoint. Keys are read from
`POLIAI_API_KEY`, then `POLI_API_KEY`, then supported local credential files.
There is no bundled shared key. `poli login` stores a key locally when using an
installed copy; from the checkout, use `node bin/poli.js login`.

```bash
# Configure your endpoint; include its /v1 prefix when required.
node bin/poli.js config set baseUrl https://your-endpoint.example/v1

# Read the key without adding its value to shell history (bash).
read -rsp 'API key: ' POLI_API_KEY; printf '\n'
export POLI_API_KEY

# Browse the endpoint's models and select one.
node bin/poli.js models

# Start with chat only, or enable workspace tools.
node bin/poli.js --chat
node bin/poli.js --agent
```

The default endpoint is `https://router.poliai.qzz.io/v1`; it requires your own
credentials and does not provide free model access. For a single task:

```bash
node bin/poli.js --model YOUR_MODEL "explain the failing tests"
```

Endpoint compatibility, availability, costs, and model tool reliability vary.
Changing the CLI's endpoint does not make incompatible provider APIs compatible.

## Keyboard and commands

| Key | Action |
| --- | --- |
| Enter | Send, or queue a follow-up during work |
| Ctrl+J | Insert a newline |
| Up / Down | Recall input history; navigate a menu when open |
| Tab | Fill a slash command |
| Esc | Close a menu or stop the running turn |
| Ctrl+T | Inspect the latest completed tool result |
| Ctrl+C | Clear an idle draft; exit when it is empty |

Multiline paste retains line breaks and indentation. Long drafts scroll within
the editable row. Chat output uses normal terminal scrollback; scrolling controls
are provided by your terminal client.

| Command | Purpose |
| --- | --- |
| `/help` | List slash commands and shortcuts |
| `/models` | Search and select a model |
| `/mode` | Choose Chat or Agent |
| `/retry` | Retry or continue the last task |
| `/tools` | List tool names and argument schemas |
| `/details [number]` | Inspect a recent completed tool result |
| `/resume [id]` | Resume a saved conversation in this workspace |
| `/diff` | Show uncommitted workspace changes |
| `/run <command>` | Run a shell command |
| `/status`, `/tokens` | Inspect connection and token information |
| `/compact`, `/history`, `/clear` | Manage conversation context |
| `/config` | Inspect or change configuration |
| `/exit` | Exit |

Configuration, credentials, sessions, and input history are stored under
`~/.poli-code/`. Set `POLI_CODE_HOME` to choose a separate location. Session files
and history can contain prompts, code, and tool output; keep them private.
`/compact` reduces retained context; it is not a model-generated summary.

## Local execution and data

Workspace tools run with your operating-system permissions. Approval prompts
are not a filesystem or process sandbox: absolute paths and shell commands can
access resources outside the current directory. Inspect proposed actions and
use a disposable checkout or container for untrusted tasks. `--yes` removes
interactive approval prompts.

Prompts, requested file contents, and tool results are sent to your configured
inference endpoint. Its operator's data policies and billing apply. Do not feed
secrets into a conversation or share credential/session files in an issue.
There is no fixed agent step limit; use Esc to stop an ongoing task. Requests
have a configurable timeout (`requestTimeoutMs`, 120 seconds by default).

## Development and validation

```bash
npm ci
npm test
npm run ui:preview
```

The tests use local HTTP fixtures and a headless terminal. They cover fragmented
streaming responses, tool dispatch and errors, approval/cancellation behavior,
conversation resume, Unicode input, model selection, and resize/reconnect
rendering. They do not need production credentials or a live model endpoint.
Passing terminal simulations does not establish compatibility with every SSH
client; real-client reports are still needed.

| Location | Responsibility |
| --- | --- |
| `src/cli.js`, `src/commands/` | CLI arguments and interactive commands |
| `src/client.js` | Chat-completions transport and streaming |
| `src/agent.js`, `src/tool-bridge.js` | Agent turns and tool-call fallback |
| `src/tools/` | Local filesystem and shell operations |
| `src/ui/` | Input editing, terminal layout, Markdown, diffs, and activity |
| `src/session.js`, `src/config.js`, `src/auth.js` | Local state and configuration |
| `tests/` | Automated regression tests |

## Known limitations and next work

- **Mobile SSH rendering:** reconnect and keyboard resize bugs have been
  reported. Regression coverage is growing, but real iPad/SSH-client validation
  is still in progress.
- **Provider compatibility:** text tool requests depend on the model following
  the schema. A model may produce invalid requests or unsupported responses.
- **Platform coverage:** cross-platform behavior, especially Windows shell
  cancellation and terminal handling, needs more validation.
- **Release readiness:** public installers are paused while documentation,
  credential handling, and the launch process are prepared.

Useful contributions include reproducible terminal bug reports, provider fixture
cases with secrets removed, accessibility improvements, and focused fixes with
regression coverage. See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE). Third-party model services are separate from this license.
