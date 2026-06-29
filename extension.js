"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vscode = require("vscode");

const sessions = require("./sessions");

let currentPanel;

// 记录 webview 最近一次 scope 状态，供文件监听自动刷新使用。
let lastScopeAll = false;

// 文件监听器与防抖 timer（模块级，避免泄漏）。
let fsWatcher = null;
let debounceTimer = null;

const PROJECTS_ROOT = path.join(os.homedir(), ".claude", "projects");
const DEBOUNCE_MS = 600;

function workspacePath() {
  const folders = vscode.workspace.workspaceFolders;
  return folders && folders.length ? folders[0].uri.fsPath : null;
}

function nonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function htmlContent(webview, extensionUri) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "main.js")
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "style.css")
  );
  const n = nonce();
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${n}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>会话分类</title>
</head>
<body>
  <header>
    <div class="brand">
      <svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <g stroke="#d97757" stroke-width="2" stroke-linecap="round">
          <line x1="13.5" y1="12" x2="22.5" y2="12"/>
          <line x1="13.3" y1="12.75" x2="21.09" y2="17.25"/>
          <line x1="12.75" y1="13.3" x2="17.25" y2="21.09"/>
          <line x1="12" y1="13.5" x2="12" y2="22.5"/>
          <line x1="11.25" y1="13.3" x2="6.75" y2="21.09"/>
          <line x1="10.7" y1="12.75" x2="2.91" y2="17.25"/>
          <line x1="10.5" y1="12" x2="1.5" y2="12"/>
          <line x1="10.7" y1="11.25" x2="2.91" y2="6.75"/>
          <line x1="11.25" y1="10.7" x2="6.75" y2="2.91"/>
          <line x1="12" y1="10.5" x2="12" y2="1.5"/>
          <line x1="12.75" y1="10.7" x2="17.25" y2="2.91"/>
          <line x1="13.3" y1="11.25" x2="21.09" y2="6.75"/>
        </g>
      </svg>
      Claude Code 会话
    </div>
    <input id="search" type="text" placeholder="搜索标题 / 首条消息" />
    <label class="scope"><input id="scopeAll" type="checkbox" /> 所有项目</label>
  </header>
  <main>
    <aside id="sidebar"></aside>
    <section id="list"></section>
  </main>
  <script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}

function postData(panel, all) {
  const data = sessions.collect(workspacePath(), all);
  const scope = all ? "所有项目" : workspacePath() || "（未打开工作区）";
  panel.webview.postMessage({ type: "data", sessions: data, scope });
}

function resumeCommand(sid) {
  return "claude --resume " + sid;
}

// 官方 Claude Code 扩展把 editor.open / primaryEditor.open 的第一个参数当作
// 要恢复的 session id（其 URI handler vscode://anthropic.claude-code/open?session=
// 也是这么转发的）。优先用命令，缺失时退回 URI，再不行提示改用终端恢复。
async function openInClaudeCode(sid) {
  const commands = await vscode.commands.getCommands(true);
  if (commands.includes("claude-vscode.editor.open")) {
    await vscode.commands.executeCommand("claude-vscode.editor.open", sid);
    return;
  }
  if (commands.includes("claude-vscode.primaryEditor.open")) {
    await vscode.commands.executeCommand("claude-vscode.primaryEditor.open", sid);
    return;
  }
  const opened = await vscode.env.openExternal(
    vscode.Uri.parse("vscode://anthropic.claude-code/open?session=" + sid)
  );
  if (!opened) {
    vscode.window.showWarningMessage(
      "未检测到 Claude Code 官方扩展，请改用「终端恢复」。"
    );
  }
}

async function confirmDelete(panel, all, sid, title) {
  const choice = await vscode.window.showWarningMessage(
    `删除会话「${title}」？文件将移到系统回收站，可在回收站中恢复。`,
    { modal: true },
    "删除"
  );
  if (choice !== "删除") {
    return;
  }
  const list = sessions.collect(workspacePath(), all);
  const session = list.find((s) => s.sid === sid);
  if (!session) {
    vscode.window.showErrorMessage("删除失败：找不到该会话。");
    return;
  }
  try {
    // 走系统回收站，误删可恢复（优于不可逆的 fs.unlinkSync）。
    await vscode.workspace.fs.delete(vscode.Uri.file(session.path), {
      useTrash: true,
    });
  } catch {
    vscode.window.showErrorMessage("删除失败：无法删除该会话文件。");
    return;
  }
  // 文件已删，清理该会话的索引记录与解析缓存。
  sessions.forgetSession(session.projDir, sid);
  postData(panel, all);
}

async function confirmDeleteCategory(panel, all, category) {
  const choice = await vscode.window.showWarningMessage(
    `删除分类「${category}」？将从所有会话移除该标签。`,
    { modal: true },
    "删除"
  );
  if (choice !== "删除") {
    return;
  }
  sessions.deleteCategory(workspacePath(), all, category);
  postData(panel, all);
}

function handleMessage(panel, msg) {
  // 更新最近 scope 状态，供文件监听自动刷新使用
  lastScopeAll = !!msg.all;
  const all = lastScopeAll;

  if (msg.type === "load") {
    postData(panel, all);
  } else if (msg.type === "tag") {
    const list = sessions.collect(workspacePath(), all);
    sessions.addTag(list, msg.sid, msg.category);
    postData(panel, all);
  } else if (msg.type === "untag") {
    const list = sessions.collect(workspacePath(), all);
    sessions.removeTag(list, msg.sid, msg.category);
    postData(panel, all);
  } else if (msg.type === "setNote") {
    const list = sessions.collect(workspacePath(), all);
    sessions.setNote(list, msg.sid, msg.note);
    postData(panel, all);
  } else if (msg.type === "toggleStar") {
    const list = sessions.collect(workspacePath(), all);
    sessions.toggleStar(list, msg.sid);
    postData(panel, all);
  } else if (msg.type === "batchTag") {
    const list = sessions.collect(workspacePath(), all);
    sessions.batchAddTag(list, msg.sids, msg.category);
    postData(panel, all);
  } else if (msg.type === "batchUntag") {
    const list = sessions.collect(workspacePath(), all);
    sessions.batchRemoveTag(list, msg.sids, msg.category);
    postData(panel, all);
  } else if (msg.type === "renameCategory") {
    sessions.renameCategory(workspacePath(), all, msg.from, msg.to);
    postData(panel, all);
  } else if (msg.type === "deleteCategory") {
    confirmDeleteCategory(panel, all, msg.category);
  } else if (msg.type === "open" && msg.path && fs.existsSync(msg.path)) {
    vscode.window.showTextDocument(vscode.Uri.file(msg.path), {
      preview: true,
    });
  } else if (msg.type === "openInClaude") {
    openInClaudeCode(msg.sid);
  } else if (msg.type === "resume") {
    const cwd = msg.cwd && fs.existsSync(msg.cwd) ? msg.cwd : workspacePath();
    const terminal = vscode.window.createTerminal({
      name: "Claude · " + msg.sid.slice(0, 8),
      cwd: cwd || undefined,
    });
    terminal.show();
    terminal.sendText(resumeCommand(msg.sid));
  } else if (msg.type === "delete") {
    confirmDelete(panel, all, msg.sid, msg.title || msg.sid.slice(0, 8));
  }
}

// 启动对 ~/.claude/projects 的文件监听，变化防抖 600ms 后自动刷新 webview。
function startFsWatcher() {
  if (fsWatcher) {
    return;
  }
  try {
    // recursive 仅 macOS / Windows 原生支持；Linux 上会抛错并走下方 catch，
    // 自动刷新静默禁用（不影响其它功能，手动切换范围仍可刷新）。
    fsWatcher = fs.watch(PROJECTS_ROOT, { recursive: true }, (eventType, filename) => {
      // 只响应 .jsonl 和 categories.json 的变化
      if (!filename) {
        return;
      }
      const isRelevant =
        filename.endsWith(".jsonl") || filename.endsWith("categories.json");
      if (!isRelevant) {
        return;
      }
      // 防抖：重置 timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (currentPanel) {
          postData(currentPanel, lastScopeAll);
        }
      }, DEBOUNCE_MS);
    });
  } catch {
    // 目录不存在或平台不支持 recursive 时静默降级，不崩溃
    fsWatcher = null;
  }
}

function stopFsWatcher() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (fsWatcher) {
    try {
      fsWatcher.close();
    } catch {
      // 忽略关闭错误
    }
    fsWatcher = null;
  }
}

function openPanel(context) {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    "ccCat",
    "Claude Code 会话分类",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
      retainContextWhenHidden: true,
    }
  );
  currentPanel = panel;
  panel.webview.html = htmlContent(panel.webview, context.extensionUri);
  panel.webview.onDidReceiveMessage(
    (msg) => handleMessage(panel, msg),
    undefined,
    context.subscriptions
  );
  panel.onDidDispose(
    () => {
      currentPanel = undefined;
      stopFsWatcher();
    },
    undefined,
    context.subscriptions
  );

  // 建立文件监听，panel 存活期间自动刷新
  startFsWatcher();
}

// 活动栏侧边视图里的启动器 HTML：品牌星芒 + 打开按钮。
function launcherHtml() {
  const n = nonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';" />
  <style nonce="${n}">
    body { margin: 0; padding: 20px 14px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    .wrap { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
    .title { font-size: 13px; font-weight: 600; letter-spacing: 0.2px; }
    .desc { font-size: 11.5px; opacity: 0.62; line-height: 1.55; }
    .open-btn {
      width: 100%;
      padding: 9px 12px;
      border: none;
      border-radius: 6px;
      background: #d97757;
      color: #fff;
      font-weight: 600;
      font-size: 12.5px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.12s ease;
    }
    .open-btn:hover { background: #c96442; }
  </style>
</head>
<body>
  <div class="wrap">
    <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true">
      <g stroke="#d97757" stroke-width="2" stroke-linecap="round">
        <line x1="13.5" y1="12" x2="22.5" y2="12"/>
        <line x1="13.3" y1="12.75" x2="21.09" y2="17.25"/>
        <line x1="12.75" y1="13.3" x2="17.25" y2="21.09"/>
        <line x1="12" y1="13.5" x2="12" y2="22.5"/>
        <line x1="11.25" y1="13.3" x2="6.75" y2="21.09"/>
        <line x1="10.7" y1="12.75" x2="2.91" y2="17.25"/>
        <line x1="10.5" y1="12" x2="1.5" y2="12"/>
        <line x1="10.7" y1="11.25" x2="2.91" y2="6.75"/>
        <line x1="11.25" y1="10.7" x2="6.75" y2="2.91"/>
        <line x1="12" y1="10.5" x2="12" y2="1.5"/>
        <line x1="12.75" y1="10.7" x2="17.25" y2="2.91"/>
        <line x1="13.3" y1="11.25" x2="21.09" y2="6.75"/>
      </g>
    </svg>
    <div class="title">Claude Code Session Manager</div>
    <button class="open-btn" id="open">Open Session Manager</button>
    <div class="desc">Tag, note, favorite, search &amp; manage your Claude Code sessions.</div>
  </div>
  <script nonce="${n}">
    const vscode = acquireVsCodeApi();
    document.getElementById("open").addEventListener("click", () => {
      vscode.postMessage({ type: "open" });
    });
  </script>
</body>
</html>`;
}

function activate(context) {
  // 命令：打开主面板
  context.subscriptions.push(
    vscode.commands.registerCommand("ccCat.open", () => openPanel(context))
  );

  // 活动栏侧边视图：WebviewView 启动器。点击活动栏图标即打开主面板，
  // 关闭后仍可通过侧栏按钮随时重开。
  const provider = {
    resolveWebviewView(webviewView) {
      webviewView.webview.options = { enableScripts: true };
      webviewView.webview.html = launcherHtml();
      webviewView.webview.onDidReceiveMessage(
        (msg) => {
          if (msg && msg.type === "open") {
            openPanel(context);
          }
        },
        undefined,
        context.subscriptions
      );
      // 点击活动栏图标 → 视图首次解析 → 直接打开主面板
      openPanel(context);
      // 视图再次变为可见时（重新点击图标）也确保面板打开/聚焦
      webviewView.onDidChangeVisibility(
        () => {
          if (webviewView.visible) {
            openPanel(context);
          }
        },
        undefined,
        context.subscriptions
      );
    },
  };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("ccSessionManagerView", provider)
  );
}

function deactivate() {
  stopFsWatcher();
}

module.exports = { activate, deactivate };
