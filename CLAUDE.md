# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An **unofficial** VS Code extension (`cc-session-manager`, publisher `ljx`) that gives a visual UI for managing local Claude Code sessions — tagging, notes, favorites, search, sort, and batch operations. It reads Claude Code's session files but never mutates them; all user metadata lives in a separate sidecar file.

## Commands

There is **no build system, no bundler, no `node_modules`, and no tests**. The extension is plain CommonJS JavaScript loaded directly by the VS Code extension host. The `vscode` API is provided by the host at runtime; the only other dependencies are Node built-ins (`fs`, `os`, `path`).

- **Run / debug**: press `F5` in VS Code → launches an Extension Development Host (launch config `运行扩展` in [.vscode/launch.json](.vscode/launch.json)). Reload the host window (`Cmd+R`) after editing.
- **Package a `.vsix`**: `npx @vscode/vsce package` → produces `cc-session-manager-<version>.vsix`. [.vscodeignore](.vscodeignore) controls what ships.
- **Install a built `.vsix`**: `code --install-extension cc-session-manager-<version>.vsix`
- **Open the panel at runtime**: command `ccCat.open` ("打开会话分类面板"), or click the folder icon in the Activity Bar.

When bumping the version, keep `version` in [package.json](package.json) and the top entry of [CHANGELOG.md](CHANGELOG.md) in sync.

## Architecture

Two processes communicating over `postMessage`:

1. **Extension host (Node backend)** — [extension.js](extension.js): activation, the `ccCat.open` command, the webview panel, the Activity Bar launcher (`WebviewView` provider), the `fs.watch` auto-refresh loop, and the message dispatcher (`handleMessage`). All VS Code API access is confined here.
2. **Data layer (pure, no `vscode` import)** — [sessions.js](sessions.js): reads/parses `.jsonl` session files, loads/saves the `categories.json` index, and holds every tag/note/star/category CRUD function. Because it has no VS Code dependency, this is where session-parsing and metadata logic belongs.
3. **Webview frontend (browser)** — [media/main.js](media/main.js) + [media/style.css](media/style.css): all rendering and UI state; sends messages back to the host. The host builds its HTML shell in `htmlContent()`.

The **message protocol** is the contract between [extension.js](extension.js) `handleMessage` and [media/main.js](media/main.js) `send(...)`. Both sides must stay aligned. Message types: `load`, `tag`, `untag`, `setNote`, `toggleStar`, `batchTag`, `batchUntag`, `renameCategory`, `deleteCategory`, `open`, `openInClaude`, `resume`, `delete`. Every mutating handler re-runs `sessions.collect(...)` and pushes a fresh `data` message back — there is no incremental update.

## Critical coupling to Claude Code's storage

- Sessions live in `~/.claude/projects/<encoded-project-path>/<session-id>.jsonl`. Claude Code encodes the project's absolute path by replacing every path separator with `-` — replicated in `encodeProjectPath()` in [sessions.js](sessions.js). If Claude Code changes this scheme, session discovery breaks here.
- Session title/snippet/cwd are derived by scanning each `.jsonl` line for entry `type`s `custom-title`, `ai-title`, and the first `user` message (`parseSession`). Title precedence: custom → AI → first-message snippet → "(无标题)".
- **User metadata is never written into the `.jsonl`.** It goes to `~/.claude/projects/<project>/categories.json`. Current shape: `{ "<sid>": { cats: string[], note: string, star: boolean } }`. The **legacy** shape was a bare array `{ "<sid>": ["CatA"] }` — `getEntry`/`setEntry` normalize on read and prune empty entries on write, so preserve that backward compatibility when touching the index format.

## Things that will bite you

- **CSP is strict and nonce-based.** The webview forbids inline script and remote resources. Any script must carry the generated `nonce`; load assets via `webview.asWebviewUri`. SVG icons are kept as static string constants (never built from user data). Search highlighting builds DOM text nodes manually (`applyHighlight`) instead of `innerHTML` — keep user-derived strings off `innerHTML` to stay XSS-safe.
- **`fs.watch({ recursive: true })` is macOS/Windows-only.** On Linux it throws and auto-refresh is silently disabled (manual scope toggle still refreshes); don't "fix" the try/catch in `startFsWatcher`.
- **Note-editing race**: while a note textarea is focused, incoming `fs.watch` data is buffered in `pendingData` and applied on blur, so auto-refresh never clobbers an in-progress edit. Preserve this when changing the data-apply path.
- **"Open in Claude Code"** depends on the official extension's commands (`claude-vscode.editor.open` / `claude-vscode.primaryEditor.open`), falling back to the `vscode://anthropic.claude-code/open?session=<sid>` URI, then a warning. These command IDs are external contracts, not ours.
- **Scope toggle**: every operation runs against either the current workspace's project dir or *all* projects under `~/.claude/projects`, driven by the `all` flag threaded through every message. `lastScopeAll` mirrors it for the watcher's refresh.

## Conventions

UI strings, code comments, commit messages, and the CHANGELOG are written in **Simplified Chinese**; code identifiers are English. This is an unofficial community tool — keep the "not affiliated with Anthropic" framing in user-facing copy.
