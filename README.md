# ✦ poli-cli (`poli`)

> **Next-generation Agentic AI Coding Assistant CLI powered by `poli-proxy` router**  
> Inspired by Google Antigravity, OpenAI Codex, and Anthropic Claude Code.

---

## ⚡ Quick 1-Line Curl Install

Install **`poli-cli`** on any Linux or macOS machine with a single curl command:

```bash
curl -fsSL https://poliai.qzz.io/poli-cli/install.sh | sh
```

*(or: `curl https://poliai.qzz.io/poli-cli/install.sh | sh`)*

Once installed, the **`poli`** command is immediately available everywhere:
```bash
poli --version
poli
```

---

## 🚀 Overview

`poli-cli` (command: `poli`) is a terminal-native, fully autonomous agentic coding assistant built to write code, refactor codebases, debug errors, navigate large repositories, and run shell commands in pair-programming sessions with developers.

Backed directly by the **`poli-proxy` router** (`https://router.poliai.qzz.io/v1`), `poli-cli` provides zero-latency access to frontier models (including `gpt-6.1-sol`, `claude-fable-5-1`, `claude-opus-5-5`, `grok-4.7`, and `gpt-6-astra`), with live token streaming, agentic function calling, unified diff previews, and safe workspace tool execution. All internal provider details are kept strictly private.

---

## ✨ Features

- **⚡ Run Command: `poli`**: Simple, intuitive command accessible anywhere in your shell.
- **⌨️ Instant Codex-Style Command Menu with `/`**: Just type `/` in the prompt to immediately see the interactive command overlay with arrow key navigation (`↑`/`↓`), `Tab` autocomplete, and type-to-filter.
- **🤖 Autonomous Agent Loop**: Observes your codebase, plans multi-step solutions, executes tools, evaluates feedback, and refines until the task is complete.
- **🛠️ Built-in Tool Suite**:
  - `view_file`: Read workspace files with line numbers, slicing, and truncation protection.
  - `write_file`: Create new files or overwrite with interactive colored diff review.
  - `edit_file`: Precise search-and-replace chunk editing with unified diffs.
  - `run_command`: Run shell commands (builds, tests, git, package managers) with output capture.
  - `grep_search`: Fast regex/text search across workspace code.
  - `file_search`: Glob and substring filename search.
  - `list_dir`: Interactive directory inspection.
- **💬 Dual Execution Modes**:
  - **Interactive REPL**: Polished full-terminal interface with a live composer, streaming output, status-aware tool summaries, and slash commands.
  - **One-Shot Mode**: Run single tasks from command-line arguments: `poli "fix the failing tests"`.
- **🎨 Full Terminal UI Experience**:
  - A calm, Codex-inspired transcript: neutral reading text, restrained mint accents, and clear role markers.
  - A responsive welcome screen that surfaces workspace, branch, model, mode, and approval policy at a glance.
  - Compact, status-colored tool activity with readable action names, duration, output previews, and full details on demand.
  - Colorized unified diffs before modifying files.
  - Interactive approvals (with `-y` / `--yes` bypass flag).
  - Live animated spinners with elapsed time counter (`[2.4s]`).
  - Markdown syntax highlighting with labeled, easy-to-scan code blocks.
  - Live token metrics counter in prompt.
  - Word-aware wrapping and terminal-cell-aware layout for Unicode and narrow windows.
  - Scrollable command palette, paste support, and horizontal input scrolling.
  - Blockwise Markdown streaming that preserves terminal scrollback.
- **🔄 Multi-Model Switching**:
  - Type `/models` to open a searchable picker. Use arrow keys and Enter to switch immediately, with conversation history retained. `poli models` opens the same picker outside a session.
- **🔒 Private Providers**:
  - All internal upstream provider IDs and names are kept 100% private.
- **🔌 Powered by `router.poliai.qzz.io`**:
  - Automatic connection to `https://router.poliai.qzz.io/v1`.
  - Preconfigured authentication and credential management.

---

## 🎯 Quick Start

### 1. Launch Interactive Coding Assistant
Simply type:
```bash
poli
```

### 2. View All Commands
In the interactive prompt, type `/`:
```text
✦ poli [gpt-6.1-sol] › /
```
An interactive Codex-style menu opens immediately: use `↑`/`↓` to navigate and `Tab` or `Enter` to select!

### 3. Run a One-Shot Coding Task
```bash
# Ask Poli to perform an action directly
poli "create an Express web server in server.js on port 4000"

# Auto-approve actions with -y
poli -y "audit package.json and run npm audit"
```

### 4. Check Router Health & Configuration
```bash
poli status
```

### 5. Explore & Switch Models
```bash
# List all models available on your router
poli models

# Switch default model
poli models grok-4.7
```

---

## ⚡ REPL Slash Commands Reference

Inside the interactive `poli` session:

| Command | Arguments | Description |
|---|---|---|
| **`/`** or **`/help`** | | Display the interactive Codex-style Command Palette |
| **`/models`** | | Search and select an available model with arrows and Enter |
| **`/mode`** | | Choose Agent or Chat mode |
| **`/retry`** | | Retry a failed request or continue a stopped task |
| **`/tools`** | | List all active agent tools and parameters |
| **`/diff`** | | Display uncommitted git diff in the workspace |
| **`/run`** | `<cmd>` | Execute a shell command directly without LLM turn |
| **`/status`** | | View router health, model, and session metrics |
| **`/tokens`** | | Show detailed prompt/completion token metrics |
| **`/compact`** | | Compress and summarize context window |
| **`/history`** | | View recent conversation turn history |
| **`/clear`** | | Clear conversation context and start fresh |
| **`/config`** | `[get\|set]` | View or modify local CLI configuration |
| **`/exit`** or **`/quit`** | | Exit the Poli CLI |

---

## Preview the UI locally

No API key or router connection is needed:

```bash
npm run ui:preview
```

The preview shows the welcome screen, conversation, tool result, and code block.
In a terminal, try `/`, arrow keys, Tab, or pasting text. Enter closes the preview.
Use `FORCE_COLOR=1` to force ANSI color, or `NO_COLOR=1` for plain output.

Input shortcuts: Home / Ctrl+A, End / Ctrl+E, Ctrl+U to clear before the cursor,
and Ctrl+K to clear after it. Ctrl+C clears the draft; on an empty draft it exits.
Multiline paste is combined into one task. Enter on a command with required arguments
fills the command first. `/models` opens the model picker without typing a model name.

### Conversation and agent execution

Agent mode supports ordinary conversation and optional workspace tools. For models
without native function calling, poli uses dedicated `poli-tool` JSON blocks to request
local tools; these requests are validated and use the same approval flow. Native tool
models use the router's function-calling protocol. The picker describes both modes.
Availability and tool reliability still depend on the upstream model.

Use `/mode` to choose Chat for conversation without tools, or start with `poli --chat`.
The agent has no fixed step limit. Ctrl+C / Esc stops a running request or shell command
and returns to the prompt; `/retry` continues afterwards. While poli works, the composer
stays available directly below the chat: type a follow-up and press Enter to queue
it. Queued messages are processed after the current response or tool batch completes.
Unsent drafts and submitted messages survive cancellation. The composer pauses for
explicit tool approvals. Shell output appears as complete lines. Chat and tool results stay
unframed; fenced code gets a concise language label and a light left gutter. The working
indicator is a small animated dot.
Output uses normal terminal scrollback; use your terminal’s scrollbar, mouse wheel, or
Shift+PageUp / Shift+PageDown to browse earlier messages.
The adaptive welcome screen groups workspace, branch, model, mode, and approval state, then offers a clear first step. User messages
appear once with a `›` prompt; assistant replies use the Poli mark. Tool results use compact status-colored action summaries
(for example, `✓ Read src/app.js · 68 lines · 12ms`), with extra detail for failures. The model
picker marks the active choice with a check. Input shortcuts appear beside a draft
when the terminal has enough room.
The chat keeps one blank line between messages. Model and mode stay in the welcome
screen; `/status` and `/tokens` show details on demand. Reading text follows the terminal's default foreground, while color highlights
navigation, status, and syntax. The input stays separate from the animated action status,
with a reply indicator during chat and an action label during tool execution. The input uses a thin cursor, restored
to the terminal default when poli releases the keyboard.
CLI labels and status messages are in English (`Replying…`, `Preparing action…`).
Activity rows use compact `✓`, `×`, and `!` status marks with indented results. File changes include numbered
red/green previews. Commands show a short output preview after completion; Ctrl+T or
`/details` shows the latest completed tool result without submitting it to the model.
Ctrl+T preserves the current draft, both during work and at the idle prompt.
Use `/details 2` to inspect the second most recent tool result; `/details` and Ctrl+T
show the latest result. Markdown tables align their columns on wide terminals and
become labeled rows on narrow ones.

### Resume a conversation

`/resume` opens a searchable list of saved conversations for the current workspace.
Use `/resume <id>` or `poli resume <id>` to choose one directly. Without an interactive
terminal, `poli resume` lists the available IDs. Context and token usage are restored;
the current model, mode, and approval settings still apply. Damaged session files and
sessions from other workspaces are excluded. An interrupted tool batch gets explicit
stopped results for unfinished calls; resuming never silently executes those calls.

### Input and status
Chat mode uses conversational welcome and input hints. While typing a long follow-up,
the activity indicator contracts to a dot to leave more room for the message.
Without an interactive terminal, changes requiring approval are declined unless `-y`
is supplied. Requests time out after 120 seconds by default; configure
`requestTimeoutMs` if your model needs more time. Shell commands default to 120 seconds;
a tool may request `timeout_seconds: 0` for no command timeout.

---

## ⚙️ Configuration & Auth

`poli-cli` stores configuration in `~/.poli-code/config.json`.

```bash
# View configuration
poli config

# Change custom router base URL
poli config set baseUrl https://router.poliai.qzz.io/v1

# Change default model
poli config set model gpt-6.1-sol

# Login with API key
poli login
```

---

## 🛠️ Troubleshooting

### `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'marked'`

The installed copy's `node_modules` is missing or out of sync with the code
(this can happen if the dependency install step was interrupted, or the
installation was updated with `git pull` without reinstalling). Fix it with:

```bash
cd ~/.poli-cli && npm install
```

or re-run the installer:

```bash
curl -fsSL https://poliai.qzz.io/poli-cli/install.sh | sh
```

Recent versions of `poli` detect this situation and try to repair it
automatically; the commands above are the manual equivalent.

---

## 📄 License

MIT © 2026 poliai (`zwuegdez`)
