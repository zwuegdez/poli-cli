# Security

Poli CLI is pre-release software, and public runtime access is currently paused.
The execution boundaries below describe its unreleased implementation. Security fixes currently target the latest
version on `main`; older versions do not have a separate support branch.

## Report privately

Email **support@poliai.qzz.io** with the affected version, a description of the
issue, and reproduction steps using dummy credentials. Include the potential
impact and a suggested fix if available. Do not put secrets or exploit details
in a public issue. Response time is not currently guaranteed.

## Execution and privacy boundaries

- Workspace tools run with the user's OS permissions. They are not sandboxed.
  Approval prompts do not enforce isolation from files outside the workspace.
- `--yes` automatically approves actions. Use it only in an environment where
  the model's filesystem and shell access is acceptable.
- Conversation content and tool results are sent to the configured endpoint.
  Its operator controls inference processing and applicable data policies.
- Local credentials, sessions, and history belong outside the source repository.
  Private credential files are written with owner-only permissions on POSIX
  systems. Protect backups and do not share these files in bug reports.
- A text tool bridge validates request structure and tool names; it does not
  make model-generated commands safe or prevent prompt injection.

## Maintainer checklist before a public release

Remove embedded credentials from the published source and revoke or rotate any
credential that was previously committed. Removing a secret from the current
file does not remove it from Git history. Check the history and release artifacts
before changing repository visibility. Never distribute a shared production key
as a default for new users.
