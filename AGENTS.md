# Trad web client

The browser terminal for real-money Hyperliquid trading. The backend repo
(`../trad-be-live`, worktrees under `../.worktrees/`) owns the plan ledger
(`docs/plan.md`), architecture (`docs/architecture.md`), release rules
(`docs/releasing.md`) and the networking budgets
(`docs/networking-2026-10.md`). Record owner requests there, not here.

Write C+- Vue and TypeScript (`~/Coding/AGENTS.md`, and the frontend section
of the backend's `docs/coding_style.md`): plain data, direct functions,
visible dispatch for commands and capabilities, stores that own one domain,
components split by complete interaction, files at or under 500 lines.
Design follows [PRODUCT.md](PRODUCT.md).

Product rules:
- Never clear or soften a financial warning to make the UI look healthy.
- Live P&L uses last-trade price. Taken-over trades show unknown P&L, never
  an invented number.
- No confirmation dialogs by default.
- A flagged protection (Policy A) is shown as flagged with its re-arm action;
  the client never re-places it implicitly.

Performance is a feature: users trade from phones while traveling. Respect
the budgets in the networking doc: bounded messages, work per update
proportional to the change (indexed state, incremental derivation, large
data out of deep reactivity), no long tasks, prices never waiting behind
history. Measure on the phone profile (Playwright WebKit with CPU
throttling) as well as desktop, and report browser coverage honestly.

Protocol changes ship with the backend in one release. `main` is the trunk.
Commit finished, verified chunks in focused commits; run `npm run lint`,
`npm run type-check`, `npm run test:engine-client` and the relevant
Playwright specs before calling work done.
