# Changelog

## [0.5.0] - 2026-07-01

### Features
- **Bilingual UI (English / 中文)**: every user-facing string — the panel, sidebar, sort bar, batch tools, session actions, notes, native dialogs, and the Activity Bar launcher — is now available in both English and Chinese. A one-click toggle in the header switches languages, or set `ccCat.language` (`auto` / `zh` / `en`) in Settings. `auto` follows the VS Code display language.

### Design Rationale
- Strings live in a single `media/i18n.js` dictionary loaded by both the extension host (`require`) and the webview (`<script>`) via a small UMD wrapper, so the two processes never drift.
- Manifest-contributed titles (command, view, activity bar) are localized through `package.nls.json` / `package.nls.zh-cn.json`, the only mechanism VS Code offers for static contribution strings.
- Switching language rewrites the webview HTML from the host on the `ccCat.language` config change, keeping the shell, the webview UI, and native dialogs in sync.

### Notes & Caveats
- The internal filter key for uncategorized sessions stays a stable constant; only its displayed label is localized, so existing `categories.json` data is unaffected.

## [0.4.1] - 2026-06-29

### Fixes
- Fixed the opaque background on the robot icon: 0.4.0 shipped a source image with a baked-in gray-and-white checkerboard (fake transparency); replaced it with a genuinely transparent source and re-cropped it centered.

## [0.4.0] - 2026-06-29

### UI
- Updated the brand image to a cartoon robot: the panel header brand icon and the orange starburst in the sidebar launcher were both replaced with `media/robot.png`.
- Added `img-src ${webview.cspSource}` to the webview CSP so local images load; added `localResourceRoots` to the launcher view.

## [0.3.3] - 2026-06-29

### Performance
- **Session parse cache**: `collect()` caches parse results per file `mtime` and only re-reads changed `.jsonl` files. Measured on 84 sessions: 160ms cold scan → 1ms warm scan. Previously every tag/note/auto-refresh re-parsed all sessions from scratch (including multi-MB files), which was especially costly when the file watcher fired frequently during a long, active conversation.

### Safety
- **Delete goes to the system trash**: session deletion changed from the irreversible `fs.unlinkSync` to `vscode.workspace.fs.delete({ useTrash: true })`, so accidental deletes can be recovered from the system trash.
- **Atomic `categories.json` writes**: switched to writing a temp file + `rename` to avoid corrupting the index JSON if a write is interrupted mid-way.

### UI
- The top "All projects" checkbox now matches the glass-style round checkbox used by the card selectors (it was previously a native square checkbox).

### UX
- **Preserve scroll position**: when the file watcher auto-refreshes or a tag/note/star action refills the data, the list is fully rebuilt but the scroll position is restored, so you no longer jump back to the top.

### Notes
- `sessions.deleteSession` was renamed to `forgetSession` (it only clears the index and parse cache); physical deletion moved to the extension host, keeping the `sessions.js` data layer free of any vscode dependency.

## [0.3.2] - 2026-06-29

### Changes
- Switched to a 3D folder store icon.
- Trimmed the README: removed Usage, kept the feature descriptions.

## [0.3.0] - 2026-06-29

### Fixes
- **Fixed the sidebar being unable to reopen the panel**: the previous TreeView hack only fired on first expansion, so clicking the icon after closing did nothing. Replaced it with a WebviewView launcher.
- **Fixed the blank sidebar**: the Activity Bar view now shows a themed launcher (starburst icon + "Open Session Manager" button + description).

### Changes
- Clicking the Activity Bar icon now opens the main panel automatically; after closing, it can be reopened anytime from the sidebar button.

## [0.2.0] - 2026-06-28

### Features
- Added a folder icon to the Activity Bar (sidebar) that opens the panel directly, without typing a command.

## [0.1.0] - 2026-06-28

### Features
- **Session notes**: add, edit, and view a note on each session, persisted to disk.
- **Favorites / stars**: star important sessions with one click; added a "★ Favorites" quick filter to the sidebar.
- **Search highlight**: matched terms are highlighted while searching, across both title and snippet.
- **Sort options**: sort by newest, oldest, favorites-first, or category.
- **Batch operations**: select multiple sessions to bulk add/remove categories or clear the selection.
- **Category management**: sidebar category items support inline rename and delete (with a modal confirmation).
- **File-watch auto refresh**: new Claude Code sessions appear automatically, no manual refresh needed.
- **Claude Code theme**: full coral accent color, glass-style UI, and VS Code light/dark theme adaptation.

### Data Model
- Category index upgraded from the simple array `{sid: ["A"]}` to the full object `{sid: {cats, note, star}}`, fully backward compatible with old data.
- The session object gained `note` (string) and `star` (boolean) fields.

### UI Improvements
- Replaced the top-left brand icon with the Anthropic orange starburst mark.
- The "Open in Claude Code" button carries a starburst icon.
- Checkboxes changed to glass-style circles.
- Overall polish to match the Claude Code visual language.

### Backend
- File watching (`fs.watch` recursive + 600ms debounce) pushes new sessions to the webview in real time.
- Cross-project scope: the same operation applies automatically to the current project or all projects.
- Complete message protocol with zero overlap between front and back ends; 13 message types aligned on both sides.

### Notes
- ⚠️ Unofficial tool, not affiliated with Anthropic / Claude Code.
- Linux users: `fs.watch` recursive is not yet supported, so auto refresh is disabled; manually toggling the scope still refreshes.
- All category/note/star data is stored in `~/.claude/projects/<project>/categories.json`, safely isolated and never modifying the original session records.

---

**First release**: full feature overview, complete and production-ready.
