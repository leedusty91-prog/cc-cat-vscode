"use strict";

// 中英文文案字典。此文件同时被两个环境加载：
//   1. 扩展宿主（Node）：`require("./media/i18n")` 拿到 { zh, en }。
//   2. Webview（浏览器）：作为 <script> 加载，挂到 `window.I18N`。
// 通过下面的 UMD 包装同时支持两种加载方式；含函数的文案（如带参数的模板）
// 也能原样保留，因为两边都是 JS 上下文、无需 JSON 序列化。
(function (root, factory) {
  const strings = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = strings;
  } else {
    root.I18N = strings;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const zh = {
    // ── 宿主：面板 / HTML 外壳 ──
    panelTitle: "Claude Code 会话分类",
    docTitle: "会话分类",
    brand: "Claude Code 会话",
    searchPlaceholder: "搜索标题 / 首条消息",
    scopeAll: "所有项目",
    noWorkspace: "（未打开工作区）",
    langName: "中文",
    langToggle: "EN", // 按钮文字：切到英文
    langToggleTitle: "Switch to English",

    // ── 宿主：原生弹窗 ──
    deleteConfirm: (title) =>
      `删除会话「${title}」？文件将移到系统回收站，可在回收站中恢复。`,
    deleteConfirmBtn: "删除",
    deleteNotFound: "删除失败：找不到该会话。",
    deleteFailed: "删除失败：无法删除该会话文件。",
    deleteCatConfirm: (cat) => `删除分类「${cat}」？将从所有会话移除该标签。`,
    noClaudeExt: "未检测到 Claude Code 官方扩展，请改用「终端恢复」。",

    // ── 宿主：活动栏启动器 ──
    launcherTitle: "Claude Code 会话管理器",
    launcherBtn: "打开会话管理器",
    launcherDesc: "为你的 Claude Code 会话打标签、备注、收藏、搜索与管理。",

    // ── Webview：排序 ──
    sortLabel: "排序：",
    sortNewest: "最新",
    sortOldest: "最旧",
    sortStar: "收藏优先",
    sortCat: "按分类",

    // ── Webview：侧边栏 ──
    all: "全部",
    starred: "★ 已收藏",
    uncategorized: "(未分类)",
    rename: "重命名",
    deleteCategory: "删除分类",

    // ── Webview：分类输入 / chips ──
    removeCategory: "移除分类",
    addTagPlaceholder: "+ 分类",
    createNew: (name) => `新建「${name}」`,
    menuEmpty: "输入名称新建分类",

    // ── Webview：批量操作 ──
    batchSelected: (n) => `已选 ${n} 项`,
    batchAdd: "添加分类",
    batchRemoveLabel: "移除分类：",
    batchRemoveTitle: (cat) => `批量移除分类「${cat}」`,
    batchClear: "取消选择",

    // ── Webview：会话操作按钮 ──
    openInClaude: "在 Claude Code 中打开",
    openInClaudeTitle: "在官方 Claude Code 扩展面板恢复此会话",
    resume: "终端恢复",
    resumeTitle: "在 IDE 终端运行 claude --resume",
    openRecord: "打开记录",
    openRecordTitle: "打开原始 .jsonl",
    del: "删除",
    delTitle: "删除会话（不可恢复）",

    // ── Webview：备注 ──
    noteEditHint: "点击编辑备注",
    noteAdd: "＋ 添加备注",
    notePlaceholder: "输入备注…",

    // ── Webview：杂项 ──
    star: "收藏",
    unstar: "取消收藏",
    selectSession: "选中此会话",
    titleOpenHint: "在编辑器中打开原始 .jsonl",
    renameSession: "重命名会话",
    renameSessionPlaceholder: "输入会话名称，留空恢复原标题",
    emptyList: "没有匹配的会话",
    untitled: "(无标题)",
  };

  const en = {
    // ── Host: panel / HTML shell ──
    panelTitle: "Claude Code Session Manager",
    docTitle: "Session Manager",
    brand: "Claude Code Sessions",
    searchPlaceholder: "Search title / first message",
    scopeAll: "All projects",
    noWorkspace: "(no workspace open)",
    langName: "English",
    langToggle: "中", // button label: switch to Chinese
    langToggleTitle: "切换为中文",

    // ── Host: native dialogs ──
    deleteConfirm: (title) =>
      `Delete session "${title}"? The file moves to the system trash and can be restored from there.`,
    deleteConfirmBtn: "Delete",
    deleteNotFound: "Delete failed: session not found.",
    deleteFailed: "Delete failed: could not remove the session file.",
    deleteCatConfirm: (cat) =>
      `Delete category "${cat}"? It will be removed from all sessions.`,
    noClaudeExt:
      "Official Claude Code extension not detected — use “Resume in terminal” instead.",

    // ── Host: Activity Bar launcher ──
    launcherTitle: "Claude Code Session Manager",
    launcherBtn: "Open Session Manager",
    launcherDesc:
      "Tag, note, favorite, search & manage your Claude Code sessions.",

    // ── Webview: sort ──
    sortLabel: "Sort:",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    sortStar: "Favorites",
    sortCat: "Category",

    // ── Webview: sidebar ──
    all: "All",
    starred: "★ Favorites",
    uncategorized: "(Uncategorized)",
    rename: "Rename",
    deleteCategory: "Delete category",

    // ── Webview: category input / chips ──
    removeCategory: "Remove category",
    addTagPlaceholder: "+ Category",
    createNew: (name) => `Create "${name}"`,
    menuEmpty: "Type a name to create a category",

    // ── Webview: batch operations ──
    batchSelected: (n) => `${n} selected`,
    batchAdd: "Add category",
    batchRemoveLabel: "Remove category:",
    batchRemoveTitle: (cat) => `Remove category "${cat}" from selected`,
    batchClear: "Clear selection",

    // ── Webview: session action buttons ──
    openInClaude: "Open in Claude Code",
    openInClaudeTitle: "Resume this session in the official Claude Code extension",
    resume: "Resume in terminal",
    resumeTitle: "Run claude --resume in the IDE terminal",
    openRecord: "Open record",
    openRecordTitle: "Open the raw .jsonl",
    del: "Delete",
    delTitle: "Delete session (moves to trash)",

    // ── Webview: notes ──
    noteEditHint: "Click to edit note",
    noteAdd: "＋ Add note",
    notePlaceholder: "Type a note…",

    // ── Webview: misc ──
    star: "Favorite",
    unstar: "Remove from favorites",
    selectSession: "Select this session",
    titleOpenHint: "Open the raw .jsonl in the editor",
    renameSession: "Rename session",
    renameSessionPlaceholder: "Session name — leave empty to restore original",
    emptyList: "No matching sessions",
    untitled: "(Untitled)",
  };

  return { zh, en };
});
