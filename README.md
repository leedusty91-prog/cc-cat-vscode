# Claude Code Session Manager

> ⚠️ **Unofficial community extension** — not affiliated with Anthropic or Claude Code.

Organize, tag, and manage your local Claude Code sessions — visually.

## Features

- **Session Classification** — Tag sessions with custom categories; filter by tag from the sidebar.
- **Notes** — Add private notes to any session, edited inline.
- **Favorites** — Star important sessions and filter to just the starred ones.
- **Search with Highlight** — Search by title or first message, with matches highlighted.
- **Sort** — By newest, oldest, favorites-first, or category.
- **Batch Operations** — Select multiple sessions to bulk add/remove categories.
- **Category Management** — Rename or delete categories from the sidebar.
- **Auto Refresh** — New sessions appear automatically (macOS / Windows).
- **One-Click Sidebar** — Folder icon in the Activity Bar opens the panel directly.

## Session Actions

Open in Claude Code · Resume in terminal · Open raw `.jsonl` · Delete.

## Storage

Tags, notes, and stars are stored in `~/.claude/projects/<project>/categories.json` — separate from Claude Code's records. Deleting it removes only your metadata, never the sessions.

## Install

Search `cc-session-manager` in the Extensions panel, or:

```bash
code --install-extension ljx.cc-session-manager
```

## License

MIT
