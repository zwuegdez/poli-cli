# ✦ poli-code (`poli`)

> **Next-generation Agentic AI Coding Assistant CLI powered by `poli-proxy`**  
> Inspired by Google Antigravity, OpenAI Codex, and Anthropic Claude Code.

---

## ⚡ Quick 1-Line Curl Install

Install `poli-code` on any Linux or macOS machine with a single curl command:

```bash
curl -fsSL https://poliai.qzz.io/install.sh | sh
```

*(or via the codex-style path: `curl -fsSL https://poliai.qzz.io/codex/install.sh | sh`)*

Once installed, the `poli` command is immediately available everywhere:
```bash
poli --version
poli
```

---

## 🚀 Overview

`poli-code` (command: `poli`) is a terminal-native, fully autonomous agentic coding assistant built to write code, refactor codebases, debug errors, navigate large repositories, and run shell commands in pair-programming sessions with developers.

Backed directly by **`poli-proxy`**, `poli-code` provides zero-latency access to frontier models (including `gpt-6.1-sol`, `claude-fable-5-1`, `claude-opus-5-5`, `grok-4.7`, and `gpt-6-astra`), with live token streaming, agentic function calling, unified diff previews, and safe workspace tool execution.

---

## ✨ Features

- **⚡ Run Command: `poli`**: Simple, intuitive command accessible anywhere in your shell.
- **⌨️ Instant Command Palette with `/`**: Just type `/` or `/help` in the chat to see all commands, categories, and shortcuts.
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
  - **Interactive REPL**: Rich terminal interface with rounded cards, live spinners with timers, and slash commands.
  - **One-Shot Mode**: Run single tasks from command-line arguments: `poli "fix the failing tests"`.
- **🎨 Enhanced Terminal UI**:
  - Rounded border cards for assistant and tool executions.
  - Colorized unified diffs before modifying files.
  - Interactive approvals (with `-y` / `--yes` bypass flag).
  - Live animated spinners with elapsed time counter (`[2.4s]`).
  - Markdown syntax highlighting for code blocks in terminal.
  - Live token metrics counter in prompt.
- **🔄 Multi-Model Switching**:
  - Seamlessly switch between models via `poli models <name>` or `/model <name>`.
- **🔌 Powered by `poli-proxy`**:
  - Automatic detection of local `poli-proxy` (`http://127.0.0.1:8000/v1`) or remote endpoint (`https://api.poliai.qzz.io/v1`).
  - Preconfigured authentication and credential management.

---

## 🎯 Quick Start

### 1. Launch Interactive Coding Assistant
Simply type:
```bash
poli
```

### 2. View All Commands
In the interactive prompt, type `/` or press `Tab`:
```text
✦ poli [gpt-6.1-sol] › /
```
This instantly renders the full categorized Command Palette!

### 3. Run a One-Shot Coding Task
```bash
# Ask Poli to perform an action directly
poli "create an Express web server in server.js on port 4000"

# Auto-approve actions with -y
poli -y "audit package.json and run npm audit"
```

### 4. Check Proxy Health & Configuration
```bash
poli status
```

### 5. Explore & Switch Models
```bash
# List all models available on your proxy
poli models

# Switch default model
poli models grok-4.7
```

---

## ⚡ REPL Slash Commands Reference

Inside the interactive `poli` session, you can use these commands:

| Command | Arguments | Description |
|---|---|---|
| **`/`** or **`/help`** | | Display the full interactive Command Palette |
| **`/model`** | `[name]` | View active model or switch to a new model |
| **`/models`** | | Browse all available models from `poli-proxy` |
| **`/tools`** | | List all active agent tools and parameters |
| **`/diff`** | | Display uncommitted git diff in the workspace |
| **`/run`** | `<cmd>` | Execute a shell command directly without LLM turn |
| **`/status`** | | View proxy health, model, and session metrics |
| **`/tokens`** | | Show detailed prompt/completion token metrics |
| **`/compact`** | | Compress and summarize context window |
| **`/history`** | | View recent conversation turn history |
| **`/clear`** | | Clear conversation context and start fresh |
| **`/config`** | `[get\|set]` | View or modify local CLI configuration |
| **`/exit`** or **`/quit`** | | Exit the Poli-code CLI |

> **Tip**: End any prompt line with a trailing backslash `\` to write multi-line prompts before sending!

---

## ⚙️ Configuration & Auth

`poli-code` stores configuration in `~/.poli-code/config.json`.

```bash
# View configuration
poli config

# Change custom proxy base URL
poli config set baseUrl http://127.0.0.1:8000/v1

# Change default model
poli config set model gpt-6.1-sol

# Login with API key
poli login
```

### Environment Variables
You can also configure `poli-code` via environment variables:
- `POLIAI_API_KEY`: API key for authentication.
- `POLIAI_BASE_URL`: Base inference URL (e.g. `http://127.0.0.1:8000/v1`).
- `POLI_CODE_HOME`: Custom home directory (default: `~/.poli-code`).

---

## 🏗️ Project Architecture

```
poli-cli/
├── install.sh             # Standalone curl installer
├── bin/
│   └── poli.js            # Executable entrypoint (#!/usr/bin/env node)
├── src/
│   ├── index.js           # Public programmatic API
│   ├── cli.js             # CLI argument parser & dispatcher
│   ├── config.js          # Config file and proxy auto-discovery
│   ├── auth.js            # Auth & credential persistence
│   ├── client.js          # Poli-proxy SSE streaming client
│   ├── agent.js           # Multi-step agentic loop orchestrator
│   ├── session.js         # Conversation history & token tracking
│   ├── system-prompt.js   # Workspace-aware system prompt
│   ├── commands/          # Subcommand handlers
│   │   ├── chat.js        # Interactive REPL & one-shot agent
│   │   ├── login.js       # Authentication command
│   │   ├── logout.js      # Clear credentials
│   │   ├── status.js      # Health and status overview
│   │   ├── models.js      # Model catalog and switcher
│   │   └── config.js      # Config getter/setter
│   ├── tools/             # Agent tools
│   │   ├── index.js       # Tool registry
│   │   ├── view_file.js   # File reader with line slicing
│   │   ├── write_file.js  # File writer with diff preview
│   │   ├── edit_file.js   # Search & replace chunk editor
│   │   ├── run_command.js # Safe bash execution
│   │   ├── grep_search.js # Codebase grep search
│   │   ├── file_search.js # Glob file search
│   │   └── list_dir.js    # Directory tree walker
│   └── ui/                # Terminal user interface
│       ├── theme.js       # ANSI styles, symbols, badges, banner, cards
│       ├── prompt.js      # Readline manager with auto-complete & / palette
│       ├── spinner.js     # Animated spinner with elapsed timer
│       ├── diff.js        # Unified diff colorizer
│       └── markdown.js    # Markdown syntax highlighter
├── package.json
├── LICENSE
└── README.md
```

---

## 📄 License

MIT © 2026 poliai (`zwuegdez`)
