# usage-bar

A Claude Code mod that draws a compact band above the prompt, in the app's own theme colours:

```
5h  ━━━━━━━━────  62% · 2h 14m     7d  ━━──────────  18% · 4d 6h
```

- **5h / 7d**: your subscription's rate-limit windows, with time until reset. Green below 70%, yellow below 90%, red from there.

Data comes from the engine itself (pushed after each turn); the mod makes no network requests. The band stays hidden with no data (e.g. when using an API key). Collapse the band with `[-]`.

Works in the terminal and in the desktop app's Code tab.

## Install

Run in a terminal Claude Code session:

```
/plugin install usage-bar --marketplace Zwylair/claude-usage-bar
```

Answer `y` to add the marketplace, then pick the **user** scope so it loads in every session.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
