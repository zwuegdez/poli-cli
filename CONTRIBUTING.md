# Contributing to Poli CLI

Poli CLI is in early development. Small, reproducible fixes are welcome,
particularly around terminal input, reconnect behavior, and model transports.

## Set up

Use Node.js 18+ and npm; CI tests Node.js 22 and 24.

```bash
npm ci
npm test
npm run ui:preview
```

The tests and UI preview run without a production API key. For live integration
work, configure your own endpoint and credentials as described in the README.
Never commit those credentials or a raw production response containing secrets.

## Report a bug

Include the CLI version, Node version, operating system, terminal client, and
minimal steps to reproduce. For SSH input issues, include whether the keyboard
was open and which resize, reconnect, or app-switch action triggered the bug.
Describe expected and actual behavior. Screenshots or sanitized terminal traces
are useful; remove API keys, private code, and identifying details first.

## Submit a change

1. Create a branch for one concrete problem.
2. Use the existing JavaScript ES module style; avoid unrelated rewrites.
3. Add a regression test when the fix changes nontrivial behavior. Use local
   HTTP fixtures and temporary directories rather than production services.
4. Run `npm test`. For UI changes, also exercise `npm run ui:preview`, typing,
   pasting, cancellation, narrow windows, and the affected terminal client.
5. Open a pull request describing the trigger, resulting behavior, validation,
   and any remaining limits. Link the issue when one exists.

Do not add a dependency unless its purpose justifies the maintenance cost.
Keep CLI labels in English and preserve terminal scrollback and unsent drafts.
Maintainer review is required before merging. Contributions are made under the
repository's MIT license; retain third-party copyright and license notices.

## Security

Report suspected credential exposure or vulnerabilities privately using
[SECURITY.md](SECURITY.md). Do not post working secrets in public issues.
