# Poli CLI

[![Tests](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml/badge.svg)](https://github.com/zwuegdez/poli-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Status: Not released](https://img.shields.io/badge/status-not%20released-orange.svg)

Poli is a coding assistant that lives in your terminal. You chat with a model,
it can read and edit files in your project, run commands, and show you what it
changed before anything is written. It's built to stay usable over SSH, even on
a flaky connection.

## Heads up: not released yet

Poli isn't ready to use. If you clone this repo and run `poli` or the
installer, you'll get a "Coming soon" message and nothing else. It won't log
you in, talk to a model, or touch your files.

The code is public so people can read it, review it, and contribute while we
finish it. Setup instructions will land here when the CLI actually opens up.

Poli is an independent project. It is not affiliated with OpenAI, Anthropic, or
Google, and it doesn't come with model access. You bring your own endpoint.

## What it will do

**Chat or let it work.** Talk to a model, or switch to agent mode so it can
inspect files, search the repo, propose edits, and run shell commands.

**You stay in control.** Pick a permission level: read-only, ask before every
change, or full access. Every edit shows a diff first. Approval prompts aren't a
sandbox, though: tools run with your own user's permissions.

**Pick any model.** A searchable picker lets you switch models mid-conversation
without losing context.

**Pick up where you left off.** Sessions are saved per project. `/resume` brings
back a chat with a short summary of what was done, and the full history stays
searchable.

**Delegate.** Hand off independent tasks to up to three subagents that work in
parallel and report back.

**Decent input.** Multiline editing, visible pastes, Unicode-aware, and you can
queue a follow-up while the model is still typing. Ctrl+J inserts a newline.

## Commands you'll use

| Command | What it does |
| --- | --- |
| `/models` | Switch models |
| `/permission` | Read-only, ask first, or full access |
| `/settings` | API format, streaming, and reasoning effort per model |
| `/context` | See how much of the context window you're using |
| `/new`, `/resume <title>` | Start a fresh chat or restore an old one |
| `/rename <title>` | Give the current chat a name |
| `/export [path]` | Save the conversation as Markdown |
| `/history <search>` | Search the current conversation |
| `/recall` or Ctrl+R | Pull an earlier prompt back into the input |
| `/agents` | See or stop running subagents |
| `/run` | Run a shell command |
| `/retry` | Retry the last failed request |

Set `NO_COLOR=1` if you don't want ANSI colors.

## Your data

Whatever you type, plus any file contents and command output the model asks
for, is sent to the inference endpoint you configure. That endpoint's privacy
policy and billing apply, not ours. Credentials and chat history are stored
locally, outside this repo.

Found a security issue? See [SECURITY.md](SECURITY.md).

## Known rough edges

- Mobile SSH clients (iPad especially) still have reconnect and
  keyboard-resize glitches.
- Some models don't follow the tool-call format reliably; error handling for
  that is still being hardened.
- Windows terminal behavior and Ctrl+C handling need more testing.

## Running it from source

You need Node.js 22 or newer.

```bash
npm ci
npm test
```

Tests run fully offline with local fixtures and a headless terminal, so no API
key is needed. `npm run ui:preview` renders a static gallery of the interface
for reviewers; it isn't an interactive session.

## Contributing

Issues and pull requests are welcome. Please run `npm test` before opening a
PR, and keep the public entrypoints disabled until release.

## License

[MIT](LICENSE)
