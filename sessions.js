"use strict";

// 读取 Claude Code 会话与分类索引。不修改原始 .jsonl，
// 分类信息单独存到每个项目目录下的 categories.json。

const fs = require("fs");
const os = require("os");
const path = require("path");

const PROJECTS_ROOT = path.join(os.homedir(), ".claude", "projects");
const INDEX_NAME = "categories.json";
const SNIPPET_LEN = 80;

// Claude Code 把项目绝对路径里的 '/' 全部换成 '-' 作为目录名。
function encodeProjectPath(p) {
  return path.resolve(p).split(path.sep).join("-");
}

function projectDirs(workspacePath, scanAll) {
  if (scanAll) {
    if (!fs.existsSync(PROJECTS_ROOT)) {
      return [];
    }
    return fs
      .readdirSync(PROJECTS_ROOT)
      .map((d) => path.join(PROJECTS_ROOT, d))
      .filter((d) => {
        try {
          return fs.statSync(d).isDirectory();
        } catch {
          return false;
        }
      });
  }
  if (!workspacePath) {
    return [];
  }
  const dir = path.join(PROJECTS_ROOT, encodeProjectPath(workspacePath));
  return fs.existsSync(dir) ? [dir] : [];
}

function userText(entry) {
  const msg = entry.message;
  if (!msg || typeof msg !== "object") {
    return "";
  }
  const content = msg.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && block.type === "text") {
        return (block.text || "").trim();
      }
    }
  }
  return "";
}

function parseSession(filePath, projDir) {
  const sid = path.basename(filePath, ".jsonl");
  const stat = fs.statSync(filePath);
  let aiTitle = "";
  let customTitle = "";
  let snippet = "";
  let cwd = "";

  const raw = fs.readFileSync(filePath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!cwd && entry.cwd) {
      cwd = entry.cwd;
    }
    if (entry.type === "ai-title") {
      aiTitle = entry.aiTitle || aiTitle;
    } else if (entry.type === "custom-title") {
      customTitle = entry.customTitle || customTitle;
    } else if (entry.type === "user" && !snippet) {
      const txt = userText(entry);
      if (txt) {
        snippet = txt.slice(0, SNIPPET_LEN).replace(/\n/g, " ");
      }
    }
  }

  const title = customTitle || aiTitle || snippet || "(无标题)";
  return { sid, path: filePath, projDir, cwd, title, snippet, mtime: stat.mtimeMs };
}

function indexPath(projDir) {
  return path.join(projDir, INDEX_NAME);
}

function loadIndex(projDir) {
  const p = indexPath(projDir);
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function saveIndex(projDir, index) {
  fs.writeFileSync(indexPath(projDir), JSON.stringify(index, null, 2), "utf-8");
}

// ── entry helper：向后兼容旧数组格式 ──────────────────────────────────────

// 读取某 sid 的 entry，旧数组格式自动规范化为新对象格式。
function getEntry(index, sid) {
  const raw = index[sid];
  if (!raw) {
    return { cats: [], note: "", star: false };
  }
  if (Array.isArray(raw)) {
    // 旧格式：直接是分类数组
    return { cats: raw, note: "", star: false };
  }
  // 新格式：确保字段齐全
  return {
    cats: Array.isArray(raw.cats) ? raw.cats : [],
    note: typeof raw.note === "string" ? raw.note : "",
    star: typeof raw.star === "boolean" ? raw.star : false,
  };
}

// 写回 entry；cats 为空且无 note 无 star 时删除该键（减少文件噪音）。
function setEntry(index, sid, entry) {
  const isEmpty =
    (!entry.cats || entry.cats.length === 0) &&
    (!entry.note || entry.note === "") &&
    !entry.star;
  if (isEmpty) {
    delete index[sid];
  } else {
    index[sid] = entry;
  }
}

// ── collect ───────────────────────────────────────────────────────────────

function collect(workspacePath, scanAll) {
  const sessions = [];
  for (const dir of projectDirs(workspacePath, scanAll)) {
    const index = loadIndex(dir);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) {
        continue;
      }
      try {
        const session = parseSession(path.join(dir, name), dir);
        const entry = getEntry(index, session.sid);
        session.cats = entry.cats;
        session.note = entry.note;
        session.star = entry.star;
        sessions.push(session);
      } catch {
        // 跳过损坏/读取失败的会话文件
      }
    }
  }
  sessions.sort((a, b) => b.mtime - a.mtime);
  return sessions;
}

// ── addTag / removeTag / deleteSession（保持原签名，改用 entry helper）─────

function addTag(sessions, sid, category) {
  const session = sessions.find((s) => s.sid === sid);
  if (!session) {
    return null;
  }
  const index = loadIndex(session.projDir);
  const entry = getEntry(index, sid);
  const clean = (category || "").trim();
  if (clean && !entry.cats.includes(clean)) {
    entry.cats = [...entry.cats, clean];
  }
  setEntry(index, sid, entry);
  saveIndex(session.projDir, index);
  return entry.cats;
}

function removeTag(sessions, sid, category) {
  const session = sessions.find((s) => s.sid === sid);
  if (!session) {
    return null;
  }
  const index = loadIndex(session.projDir);
  const entry = getEntry(index, sid);
  entry.cats = entry.cats.filter((c) => c !== category);
  setEntry(index, sid, entry);
  saveIndex(session.projDir, index);
  return entry.cats;
}

function deleteSession(sessions, sid) {
  const session = sessions.find((s) => s.sid === sid);
  if (!session) {
    return false;
  }
  try {
    fs.unlinkSync(session.path);
  } catch {
    return false;
  }
  const index = loadIndex(session.projDir);
  // 文件已删，连带移除其分类/备注/星标记录
  delete index[sid];
  saveIndex(session.projDir, index);
  return true;
}

// ── 新增功能 ──────────────────────────────────────────────────────────────

// 保存备注：note trim 后存；空串则清除 note。返回新 note 或 null（找不到）。
function setNote(sessions, sid, note) {
  const session = sessions.find((s) => s.sid === sid);
  if (!session) {
    return null;
  }
  const index = loadIndex(session.projDir);
  const entry = getEntry(index, sid);
  entry.note = (note || "").trim();
  setEntry(index, sid, entry);
  saveIndex(session.projDir, index);
  return entry.note;
}

// 翻转星标并持久化。返回新布尔值或 null（找不到）。
function toggleStar(sessions, sid) {
  const session = sessions.find((s) => s.sid === sid);
  if (!session) {
    return null;
  }
  const index = loadIndex(session.projDir);
  const entry = getEntry(index, sid);
  entry.star = !entry.star;
  setEntry(index, sid, entry);
  saveIndex(session.projDir, index);
  return entry.star;
}

// 批量给多个 sid 添加同一分类（去重）。
function batchAddTag(sessions, sids, category) {
  const clean = (category || "").trim();
  if (!clean) {
    return;
  }
  // 按 projDir 分组，减少 I/O 次数
  const byDir = new Map();
  for (const sid of sids) {
    const session = sessions.find((s) => s.sid === sid);
    if (!session) {
      continue;
    }
    if (!byDir.has(session.projDir)) {
      byDir.set(session.projDir, []);
    }
    byDir.get(session.projDir).push(sid);
  }
  for (const [projDir, dirSids] of byDir) {
    const index = loadIndex(projDir);
    for (const sid of dirSids) {
      const entry = getEntry(index, sid);
      if (!entry.cats.includes(clean)) {
        entry.cats = [...entry.cats, clean];
      }
      setEntry(index, sid, entry);
    }
    saveIndex(projDir, index);
  }
}

// 批量给多个 sid 移除分类。
function batchRemoveTag(sessions, sids, category) {
  const clean = (category || "").trim();
  if (!clean) {
    return;
  }
  const byDir = new Map();
  for (const sid of sids) {
    const session = sessions.find((s) => s.sid === sid);
    if (!session) {
      continue;
    }
    if (!byDir.has(session.projDir)) {
      byDir.set(session.projDir, []);
    }
    byDir.get(session.projDir).push(sid);
  }
  for (const [projDir, dirSids] of byDir) {
    const index = loadIndex(projDir);
    for (const sid of dirSids) {
      const entry = getEntry(index, sid);
      entry.cats = entry.cats.filter((c) => c !== clean);
      setEntry(index, sid, entry);
    }
    saveIndex(projDir, index);
  }
}

// 在当前范围内，将所有会话里名为 from 的分类重命名为 to。
// 若某会话同时有 from 和 to，合并去重。
function renameCategory(workspacePath, scanAll, from, to) {
  const fromClean = (from || "").trim();
  const toClean = (to || "").trim();
  if (!fromClean || !toClean || fromClean === toClean) {
    return;
  }
  for (const dir of projectDirs(workspacePath, scanAll)) {
    const index = loadIndex(dir);
    let changed = false;
    for (const sid of Object.keys(index)) {
      const entry = getEntry(index, sid);
      if (!entry.cats.includes(fromClean)) {
        continue;
      }
      // 去掉 from，加入 to（去重）
      const newCats = entry.cats.filter((c) => c !== fromClean);
      if (!newCats.includes(toClean)) {
        newCats.push(toClean);
      }
      entry.cats = newCats;
      setEntry(index, sid, entry);
      changed = true;
    }
    if (changed) {
      saveIndex(dir, index);
    }
  }
}

// 在当前范围内从所有会话移除指定分类。
function deleteCategory(workspacePath, scanAll, category) {
  const clean = (category || "").trim();
  if (!clean) {
    return;
  }
  for (const dir of projectDirs(workspacePath, scanAll)) {
    const index = loadIndex(dir);
    let changed = false;
    for (const sid of Object.keys(index)) {
      const entry = getEntry(index, sid);
      if (!entry.cats.includes(clean)) {
        continue;
      }
      entry.cats = entry.cats.filter((c) => c !== clean);
      setEntry(index, sid, entry);
      changed = true;
    }
    if (changed) {
      saveIndex(dir, index);
    }
  }
}

module.exports = {
  collect,
  addTag,
  removeTag,
  deleteSession,
  setNote,
  toggleStar,
  batchAddTag,
  batchRemoveTag,
  renameCategory,
  deleteCategory,
};
