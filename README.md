# trad-web-client

This project is a Vue 3 + Vite client for the trading platform. It now includes an initial Trading Terminal layout inspired by the reference screenshot.

## Trading Terminal UI

Navigate to `http://localhost:5173/terminal` (root `/` redirects there) to view the terminal.

Current panels (placeholder data):

- Log (`TerminalLogPanel`)
- Price Chart (`TerminalChartPanel`)
- Order/Device Execution Tree (`TerminalOrderTree`)
- Trailing / Entry Devices Table (`TerminalEntriesPanel`)
- Device Details (`TerminalDeviceDetails`)
- Command Input (`TerminalCommandInput`)

Layout is implemented with CSS Grid in `views/TradingTerminal.vue` and styled via dark theme variables in `src/assets/main.css`.

### Next Steps / Ideas

- Replace placeholder reactive arrays with Pinia stores fed by a WebSocket to the trading server.
- Implement real-time chart (e.g. lightweight-charts or custom canvas) with execution markers.
- Add selection & focus state: clicking rows updates `DeviceDetails` panel.
- Add contextual actions in a right-hand panel slot (currently placeholder).
- Persist command history and support keyboard shortcuts (ArrowUp / ArrowDown).
- Add theming (high-contrast, light) via CSS variable toggles.

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
bun install
```

### Compile and Hot-Reload for Development

```sh
bun dev
```

### Type-Check, Compile and Minify for Production

```sh
bun run build
```

### Lint with ESLint

```sh
bun lint
```
