# Claude Code Session Manager

> ⚠️ **Unofficial community extension** — not affiliated with Anthropic or Claude Code.

A VS Code extension to organize, tag, and manage your local Claude Code sessions — with notes, favorites, search, sorting, and batch operations.

## Features

- **Session Classification** — Tag sessions with custom categories. Add, remove, and filter by tags from the sidebar.
- **Notes** — Add private notes to any session. Click to edit inline.
- **Favorites / Star** — Star important sessions. Filter by starred sessions in the sidebar.
- **Search with Highlight** — Search by title or first message. Matching terms are highlighted in results.
- **Sort** — Sort by newest, oldest, favorites-first, or by category.
- **Batch Operations** — Select multiple sessions and bulk-add or bulk-remove categories.
- **Category Management** — Rename or delete categories directly from the sidebar (hover to reveal controls).
- **Auto Refresh** — File watcher detects new Claude Code sessions and updates the panel automatically (macOS / Windows).
- **Sidebar Icon** — Folder icon in the Activity Bar. Click to open the panel directly — no commands needed.

## Usage

1. Open any project in VS Code that you've used Claude Code in.
2. Click the **folder icon** in the Activity Bar (left sidebar) — the session panel opens automatically.
   - Or press `Cmd/Ctrl + Shift + P` → **Claude Code: 打开会话分类面板**
3. In the panel:
   - **Tag sessions** — use the `+ category` input on any card; existing categories auto-complete.
   - **Star sessions** — click ☆ on any card to bookmark it.
   - **Add notes** — click `+ Add note` on any card to write a memo.
   - **Search** — type in the search box at the top; matching text is highlighted.
   - **Sort** — use the sort bar above the list (Newest / Oldest / Starred first / By category).
   - **Batch select** — check the circle on multiple cards, then use the batch bar to add/remove categories.
   - **Rename / delete categories** — hover over a category in the sidebar to reveal ✎ and ✕ buttons.
   - **All projects** — check "All projects" in the header to manage sessions across all workspaces.

## Actions per Session Card

| Button | Action |
|---|---|
| **Open in Claude Code** | Resume the session in the official Claude Code extension panel |
| **Terminal Resume** | Run `claude --resume <id>` in the integrated terminal |
| **Open Log** | Open the raw `.jsonl` file in the editor |
| **Delete** | Delete the session file permanently (with confirmation) |

> **Open in Claude Code** requires the official `anthropic.claude-code` extension. If unavailable, it falls back to the `vscode://` URI handler, then prompts you to use Terminal Resume instead.

## Data Storage

All tags, notes, and star data are stored in:
```
~/.claude/projects/<project>/categories.json
```

This file is separate from Claude Code's session records — deleting it only removes your tags and notes, never the sessions themselves.

**Old format** (`{sid: ["A","B"]}`) is automatically upgraded to the new format on first read. No data is lost.

## Installation

### From Open VSX (recommended)

Search for `cc-session-manager` in the Extensions panel of VS Code, Cursor, Windsurf, or any Open VSX–compatible editor.

Or install via CLI:
```bash
code --install-extension ljx.cc-session-manager
```

### From VSIX (manual)

```bash
# Download the .vsix from GitHub Releases, then:
code --install-extension cc-session-manager-0.2.0.vsix
```

## Development

No build step required — pure JavaScript.

```bash
git clone https://github.com/leedusty91-prog/cc-cat-vscode.git
cd cc-cat-vscode
# Open in VS Code and press F5 to launch the Extension Development Host
```

## Notes

- **Linux**: `fs.watch` with `recursive: true` is not supported. Auto-refresh is silently disabled; manually toggling the scope still refreshes the list.
- **Open in Claude Code**: depends on the `anthropic.claude-code` extension being installed.

## License

MIT
