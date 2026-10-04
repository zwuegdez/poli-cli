# Codex for Open Source application draft

This is a maintainer draft, not an application submission or a claim of
acceptance. Check the current [official program page](https://developers.openai.com/community/codex-for-oss)
and linked terms before applying. Replace factual placeholders and use only
verified activity or adoption numbers.

## Project

**Name:** Poli CLI  
**Repository:** https://github.com/zwuegdez/poli-cli  
**License:** MIT  
**Maintainer:** zwuegdez (confirm the application account has write access)

## Project description

Poli CLI is an early-stage terminal coding assistant with streaming chat,
workspace file and shell tools, a searchable model picker, and resumable
conversations. The unreleased implementation supports a user-configured OpenAI-compatible
endpoint; public runtime access is currently disabled.

My main focus is reliable interaction while the assistant works: retaining
unsent drafts, queueing follow-ups, showing compact tool results, and preserving
normal terminal scrollback. Mobile SSH clients have exposed input and reconnect
bugs that I am investigating with terminal simulations and real-client reports.

## Why support would help

I would use Codex to reproduce and fix input/reconnect bugs, review the tool
execution and credential boundaries, improve provider compatibility, and build
regression tests for streaming and cancellation. The goal is a CLI that other
contributors can inspect and improve, with user-supplied endpoint credentials
when the public runtime reopens.

## Current scope and evidence

The repository includes automated tests using local HTTP fixtures and a
headless terminal. Public CLI and preview entrypoints show “Coming soon.” Tests cover
stream parsing, tool handling, session resume, model selection, Unicode editing,
and resize behavior. Contribution instructions and security reporting are
included. Public runtime access and installation are paused while release preparation continues.

The project is new. I am not claiming widespread adoption or an established
ecosystem role. My case is the concrete work and public development plan, and I
understand that this may not yet meet the program's selection priorities.

**Add before submitting:**

- Public repository URL, after credential rotation and release review.
- Your role and actual write access.
- Verified active users, contributors, stars, forks, or downstream use, if any.
  Do not invent metrics or describe your own sessions as community adoption.
- Two or three links to merged fixes and regression tests.
- A sanitized demo or reproducible terminal fixture showing the intended UI.
- Your intended use of ChatGPT Pro/Codex. Request API credits only if you have a
  specific OSS API workflow and can explain the planned usage.

## Next work to describe

1. Collect and reproduce mobile SSH reconnect cases without duplicate inputs or
   lost transcript lines.
2. Improve schema and error handling across native tool calls and the text tool
   bridge, using sanitized fixtures.
3. Validate the credential setup and document execution/data boundaries before
   reopening public installation.

A stronger application comes from demonstrated usefulness and maintenance,
not from changing the README alone. The official program encourages core
maintainers and widely used public projects, and permits other projects to
explain their ecosystem importance. Selection remains OpenAI's decision.
