# usage-bar

A Claude Code mod that draws a compact band above the prompt, in the app's own theme colours:

```
5h  ━━━━━━━━────  62% · 2h 14m     7d  ━━──────────  18% · 4d 6h
ctx ━━━━━━━━━━──────────────  41% · 82k / 200k   ● System prompt 3.1k  ● Messages 78.9k
```

- **5h / 7d**: your subscription's rate-limit windows, with time until reset. Turns yellow at 75%, red at 90%.
- **ctx**: how full the context window is, split by category the way `/context` splits it (system prompt, tools, memory files, messages…), each in the colour `/context` uses.

Data comes from the engine itself (pushed after each turn); the mod makes no network requests. Rows with no data stay hidden (e.g. the limits row when using an API key). Collapse the band with `[-]`.

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
