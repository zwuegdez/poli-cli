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
  - **Interactive REPL**: Rich full-terminal interface with rounded cards, live spinners with timers, and slash commands.
  - **One-Shot Mode**: Run single tasks from command-line arguments: `poli "fix the failing tests"`.
- **🎨 Full Terminal UI Experience**:
  - Rounded border cards for user messages and assistant responses.
  - Dedicated tool cards showing arguments, execution status, and millisecond duration.
  - Colorized unified diffs before modifying files.
  - Interactive approvals (with `-y` / `--yes` bypass flag).
  - Live animated spinners with elapsed time counter (`[2.4s]`).
  - Markdown syntax highlighting for code blocks in terminal.
  - Live token metrics counter in prompt.
- **🔄 Multi-Model Switching**:
  - Seamlessly switch between models via `poli models <name>` or `/model <name>`.
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
| **`/model`** | `[name]` | View active model or switch to a new model |
| **`/models`** | | Browse all available frontier models from router |
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

## 📄 License

MIT © 2026 poliai (`zwuegdez`)
