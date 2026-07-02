"use strict";

(function () {
  const vscode = acquireVsCodeApi();

  // ===== 语言文案 =====
  // 语言由宿主注入到 <body data-locale>；i18n.js 已在本脚本前加载并挂到 window.I18N。
  const LOCALE = document.body.dataset.locale === "zh" ? "zh" : "en";
  const L = (window.I18N && window.I18N[LOCALE]) || (window.I18N && window.I18N.en) || {};

  // ===== 常量 =====
  // UNCAT 既是过滤器内部 key 也曾作为显示文案；为支持多语言，key 保持中文常量不变
  // （仅内部使用、不展示），显示时统一用 L.uncategorized。
  const UNCAT = "(未分类)";
  const ALL = "__all__";
  const STAR = "__star__"; // 收藏过滤器特殊 key

  // 排序选项（label 随语言变化）
  const SORT_OPTS = [
    { key: "newest", label: L.sortNewest },
    { key: "oldest", label: L.sortOldest },
    { key: "star", label: L.sortStar },
    { key: "cat", label: L.sortCat },
  ];

  // ===== 状态 =====
  const state = {
    sessions: [],
    filter: ALL,
    search: "",
    scopeAll: false,
    sort: "newest",       // 排序方式
    selected: new Set(),  // 批量选择的 sid 集合
  };

  // 自动刷新缓冲：当用户正在编辑备注时，暂存后端推来的新数据
  let pendingData = null;

  const els = {
    search: document.getElementById("search"),
    scopeAll: document.getElementById("scopeAll"),
    langToggle: document.getElementById("langToggle"),
    sidebar: document.getElementById("sidebar"),
    list: document.getElementById("list"),
  };

  // ===== 通信 =====
  function send(type, extra) {
    vscode.postMessage(Object.assign({ type, all: state.scopeAll }, extra || {}));
  }

  // ===== 辅助工具 =====
  function allCategories() {
    const set = new Set();
    state.sessions.forEach((s) => (s.cats || []).forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
  }

  function countFor(cat) {
    if (cat === ALL) return state.sessions.length;
    if (cat === STAR) return state.sessions.filter((s) => s.star).length;
    if (cat === UNCAT) return state.sessions.filter((s) => !s.cats || !s.cats.length).length;
    return state.sessions.filter((s) => (s.cats || []).includes(cat)).length;
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return (
      pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes())
    );
  }

  // ===== 可见 & 排序会话 =====
  function visibleSessions() {
    const term = state.search.trim().toLowerCase();
    let list = state.sessions.filter((s) => {
      // 收藏过滤
      if (state.filter === STAR && !s.star) return false;
      // 未分类过滤
      if (state.filter === UNCAT && (s.cats || []).length) return false;
      // 具体分类过滤
      if (state.filter !== ALL && state.filter !== UNCAT && state.filter !== STAR) {
        if (!(s.cats || []).includes(state.filter)) return false;
      }
      // 搜索词过滤
      if (term) {
        const hay = (s.title + " " + (s.snippet || "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });

    // 排序
    const byMtime = (a, b) => b.mtime - a.mtime;
    if (state.sort === "newest") {
      list = list.slice().sort(byMtime);
    } else if (state.sort === "oldest") {
      list = list.slice().sort((a, b) => a.mtime - b.mtime);
    } else if (state.sort === "star") {
      list = list.slice().sort((a, b) => {
        if (!!a.star !== !!b.star) return b.star ? 1 : -1;
        return byMtime(a, b);
      });
    } else if (state.sort === "cat") {
      list = list.slice().sort((a, b) => {
        const ca = (a.cats && a.cats[0]) || "￿";
        const cb = (b.cats && b.cats[0]) || "￿";
        return ca.localeCompare(cb, "zh");
      });
    }
    return list;
  }

  // ===== 搜索高亮（安全，逐段构建 DOM）=====
  function applyHighlight(el, text, term) {
    el.textContent = "";
    if (!term) {
      el.appendChild(document.createTextNode(text));
      return;
    }
    const lowerText = text.toLowerCase();
    const lowerTerm = term.toLowerCase();
    let cursor = 0;
    let idx;
    while ((idx = lowerText.indexOf(lowerTerm, cursor)) !== -1) {
      // 普通文本段
      if (idx > cursor) {
        el.appendChild(document.createTextNode(text.slice(cursor, idx)));
      }
      // 高亮段
      const mark = document.createElement("mark");
      mark.className = "hl";
      mark.appendChild(document.createTextNode(text.slice(idx, idx + term.length)));
      el.appendChild(mark);
      cursor = idx + term.length;
    }
    // 剩余普通文本
    if (cursor < text.length) {
      el.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  // ===== 侧边栏 =====
  function makeCatItem(label, key) {
    const item = document.createElement("div");
    item.className = "cat-item" + (state.filter === key ? " active" : "");

    const left = document.createElement("span");
    left.className = "cat-item-label";
    left.textContent = label;

    const count = document.createElement("span");
    count.className = "cat-count";
    count.textContent = countFor(key);

    item.append(left, count);
    item.addEventListener("click", () => {
      state.filter = key;
      render();
    });
    return item;
  }

  // 真实分类项（带重命名/删除按钮）
  function makeCatItemReal(cat) {
    const item = document.createElement("div");
    item.className = "cat-item cat-item-real" + (state.filter === cat ? " active" : "");

    const left = document.createElement("span");
    left.className = "cat-item-label";
    left.textContent = cat;

    const count = document.createElement("span");
    count.className = "cat-count";
    count.textContent = countFor(cat);

    // 操作按钮组（hover 时显示）
    const ops = document.createElement("span");
    ops.className = "cat-ops";

    // 重命名按钮
    const renameBtn = document.createElement("button");
    renameBtn.className = "cat-op-btn";
    renameBtn.title = L.rename;
    renameBtn.textContent = "✎";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRename(item, cat, left);
    });

    // 删除按钮
    const delBtn = document.createElement("button");
    delBtn.className = "cat-op-btn cat-op-del";
    delBtn.title = L.deleteCategory;
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      send("deleteCategory", { category: cat });
    });

    ops.append(renameBtn, delBtn);
    item.append(left, ops, count);

    item.addEventListener("click", () => {
      state.filter = cat;
      render();
    });
    return item;
  }

  // 就地重命名分类
  function startRename(item, oldCat, labelEl) {
    const input = document.createElement("input");
    input.className = "cat-rename-input";
    input.value = oldCat;
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false; // 防止 Enter 提交后 blur 再次触发、或 Escape 后 blur 误提交
    function commit() {
      if (done) {
        return;
      }
      done = true;
      const newCat = input.value.trim();
      if (newCat && newCat !== oldCat) {
        send("renameCategory", { from: oldCat, to: newCat });
      } else {
        // 取消：恢复原标签
        input.replaceWith(labelEl);
      }
    }
    function cancel() {
      if (done) {
        return;
      }
      done = true;
      input.replaceWith(labelEl);
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);
  }

  function renderSidebar() {
    els.sidebar.innerHTML = "";
    els.sidebar.append(makeCatItem(L.all, ALL));
    // 收藏项（放在全部下面）
    const starItem = makeCatItem(L.starred, STAR);
    starItem.classList.add("cat-item-star");
    els.sidebar.append(starItem);
    // 真实分类（带操作按钮）
    allCategories().forEach((c) => els.sidebar.append(makeCatItemReal(c)));
    els.sidebar.append(makeCatItem(L.uncategorized, UNCAT));
  }

  // ===== 排序工具条 =====
  let sortBar = null;
  function ensureSortBar() {
    if (sortBar) return;
    sortBar = document.createElement("div");
    sortBar.className = "sort-bar";

    const label = document.createElement("span");
    label.className = "sort-label";
    label.textContent = L.sortLabel;
    sortBar.append(label);

    SORT_OPTS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "sort-btn" + (state.sort === opt.key ? " active" : "");
      btn.dataset.sortKey = opt.key;
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        state.sort = opt.key;
        // 更新按钮状态
        sortBar.querySelectorAll(".sort-btn").forEach((b) => {
          b.classList.toggle("active", b.dataset.sortKey === state.sort);
        });
        renderList();
      });
      sortBar.append(btn);
    });

    // 插入到 #list 内部顶部（#list 是 flex-column，可以容纳它）
    els.list.prepend(sortBar);
  }

  function updateSortBar() {
    if (!sortBar) return;
    sortBar.querySelectorAll(".sort-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.sortKey === state.sort);
    });
  }

  // ===== 批量操作条 =====
  let batchBar = null;
  function ensureBatchBar() {
    if (batchBar) return;
    batchBar = document.createElement("div");
    batchBar.className = "batch-bar";
    batchBar.style.display = "none";
    // 插在 sortBar 之后（#list 内，sortBar 的下一个兄弟）
    if (sortBar && sortBar.parentNode === els.list) {
      sortBar.insertAdjacentElement("afterend", batchBar);
    } else {
      els.list.prepend(batchBar);
    }
  }

  function renderBatchBar() {
    if (!batchBar) return;
    if (state.selected.size === 0) {
      batchBar.style.display = "none";
      return;
    }
    batchBar.style.display = "flex";
    batchBar.innerHTML = "";

    // 已选数量
    const info = document.createElement("span");
    info.className = "batch-info";
    info.textContent = L.batchSelected(state.selected.size);
    batchBar.append(info);

    // 批量添加分类
    const addWrap = makeBatchTagInput(L.batchAdd, (category) => {
      send("batchTag", { sids: Array.from(state.selected), category });
    });
    batchBar.append(addWrap);

    // 批量移除分类（列出选中集合里出现的分类）
    const selCats = getCatsInSelected();
    if (selCats.length) {
      const removeWrap = document.createElement("span");
      removeWrap.className = "batch-remove-wrap";
      const removeLabel = document.createElement("span");
      removeLabel.className = "batch-remove-label";
      removeLabel.textContent = L.batchRemoveLabel;
      removeWrap.append(removeLabel);
      selCats.forEach((cat) => {
        const btn = document.createElement("button");
        btn.className = "batch-remove-btn";
        btn.textContent = cat;
        btn.title = L.batchRemoveTitle(cat);
        btn.addEventListener("click", () => {
          send("batchUntag", { sids: Array.from(state.selected), category: cat });
        });
        removeWrap.append(btn);
      });
      batchBar.append(removeWrap);
    }

    // 清空选择
    const clearBtn = document.createElement("button");
    clearBtn.className = "batch-clear-btn";
    clearBtn.textContent = L.batchClear;
    clearBtn.addEventListener("click", () => {
      state.selected.clear();
      render();
    });
    batchBar.append(clearBtn);
  }

  // 返回当前所有选中会话里出现过的分类
  function getCatsInSelected() {
    const set = new Set();
    state.sessions.forEach((s) => {
      if (state.selected.has(s.sid)) {
        (s.cats || []).forEach((c) => set.add(c));
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
  }

  // 批量添加分类输入组件（类似 makeAddTag，简化版）
  function makeBatchTagInput(placeholder, onCommit) {
    const wrap = document.createElement("span");
    wrap.className = "batch-add-tag";

    const input = document.createElement("input");
    input.placeholder = placeholder;

    const menu = document.createElement("div");
    menu.className = "cat-menu";
    menu.style.display = "none";

    function hideMenu() { menu.style.display = "none"; }

    function commit(value) {
      const v = (value || "").trim();
      if (!v) return;
      onCommit(v);
      input.value = "";
      hideMenu();
    }

    function renderMenu() {
      const term = input.value.trim().toLowerCase();
      const all = allCategories();
      const opts = all.filter((c) => c.toLowerCase().includes(term));
      menu.innerHTML = "";
      if (term && !all.some((c) => c.toLowerCase() === term)) {
        const create = document.createElement("div");
        create.className = "cat-menu-item create";
        create.textContent = L.createNew(input.value.trim());
        create.addEventListener("mousedown", (e) => { e.preventDefault(); commit(input.value); });
        menu.append(create);
      }
      opts.forEach((c) => {
        const item = document.createElement("div");
        item.className = "cat-menu-item";
        item.textContent = c;
        item.addEventListener("mousedown", (e) => { e.preventDefault(); commit(c); });
        menu.append(item);
      });
      if (!menu.children.length) {
        const empty = document.createElement("div");
        empty.className = "cat-menu-empty";
        empty.textContent = L.menuEmpty;
        menu.append(empty);
      }
    }

    input.addEventListener("focus", () => { renderMenu(); menu.style.display = "block"; });
    input.addEventListener("input", () => { renderMenu(); menu.style.display = "block"; });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(input.value); }
      if (e.key === "Escape") { hideMenu(); input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(hideMenu, 120));

    wrap.append(input, menu);
    return wrap;
  }

  // ===== chips & add tag =====
  function makeChip(session, cat) {
    const chip = document.createElement("span");
    chip.className = "chip";
    const text = document.createElement("span");
    text.textContent = cat;
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.title = L.removeCategory;
    x.addEventListener("click", () =>
      send("untag", { sid: session.sid, category: cat })
    );
    chip.append(text, x);
    return chip;
  }

  function makeAddTag(session) {
    const wrap = document.createElement("span");
    wrap.className = "add-tag";
    const input = document.createElement("input");
    input.placeholder = L.addTagPlaceholder;

    const menu = document.createElement("div");
    menu.className = "cat-menu";
    menu.style.display = "none";

    function hideMenu() { menu.style.display = "none"; }

    function commit(value) {
      const v = (value || "").trim();
      if (!v) return;
      send("tag", { sid: session.sid, category: v });
      input.value = "";
      hideMenu();
    }

    function renderMenu() {
      const term = input.value.trim().toLowerCase();
      const own = new Set(session.cats || []);
      const all = allCategories();
      const opts = all.filter((c) => !own.has(c) && c.toLowerCase().includes(term));
      menu.innerHTML = "";

      if (term && !all.some((c) => c.toLowerCase() === term)) {
        const create = document.createElement("div");
        create.className = "cat-menu-item create";
        create.textContent = L.createNew(input.value.trim());
        create.addEventListener("mousedown", (e) => { e.preventDefault(); commit(input.value); });
        menu.append(create);
      }

      opts.forEach((c) => {
        const item = document.createElement("div");
        item.className = "cat-menu-item";
        item.textContent = c;
        item.addEventListener("mousedown", (e) => { e.preventDefault(); commit(c); });
        menu.append(item);
      });

      if (!menu.children.length) {
        const empty = document.createElement("div");
        empty.className = "cat-menu-empty";
        empty.textContent = L.menuEmpty;
        menu.append(empty);
      }
    }

    function showMenu() { renderMenu(); menu.style.display = "block"; }

    input.addEventListener("focus", showMenu);
    input.addEventListener("input", showMenu);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(input.value); }
      else if (e.key === "Escape") { hideMenu(); input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(hideMenu, 120));

    wrap.append(input, menu);
    return wrap;
  }

  // ===== 操作按钮 =====
  // 内联 SVG 图标（静态字符串，非用户数据，CSP 安全）
  const ICONS = {
    // Claude 橙色星芒标志
    claude:
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<g stroke="#d97757" stroke-width="2" stroke-linecap="round">' +
      '<line x1="13.5" y1="12" x2="22.5" y2="12"/>' +
      '<line x1="13.3" y1="12.75" x2="21.09" y2="17.25"/>' +
      '<line x1="12.75" y1="13.3" x2="17.25" y2="21.09"/>' +
      '<line x1="12" y1="13.5" x2="12" y2="22.5"/>' +
      '<line x1="11.25" y1="13.3" x2="6.75" y2="21.09"/>' +
      '<line x1="10.7" y1="12.75" x2="2.91" y2="17.25"/>' +
      '<line x1="10.5" y1="12" x2="1.5" y2="12"/>' +
      '<line x1="10.7" y1="11.25" x2="2.91" y2="6.75"/>' +
      '<line x1="11.25" y1="10.7" x2="6.75" y2="2.91"/>' +
      '<line x1="12" y1="10.5" x2="12" y2="1.5"/>' +
      '<line x1="12.75" y1="10.7" x2="17.25" y2="2.91"/>' +
      '<line x1="13.3" y1="11.25" x2="21.09" y2="6.75"/></g></svg>',
    // 橙色终端图标：描边窗口 + 橙色提示符
    terminal:
      '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none">' +
      '<rect x="1.4" y="2.6" width="13.2" height="10.8" rx="2.2" stroke="#d97757" stroke-width="1.4"/>' +
      '<path d="M4.1 6.3L6.3 8L4.1 9.7" stroke="#d97757" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M7.7 10H11" stroke="#d97757" stroke-width="1.4" stroke-linecap="round"/></svg>',
    // 文档图标（跟随文字色）
    doc:
      '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none">' +
      '<path d="M4 1.8h4.8L13 6v8.2a.8.8 0 0 1-.8.8H4a.8.8 0 0 1-.8-.8V2.6A.8.8 0 0 1 4 1.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M8.6 1.9v4.2H12.8" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    // 垃圾桶图标（跟随文字色）
    trash:
      '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none">' +
      '<path d="M3 4.4h10M6.3 4.4V3.1a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v1.3M4.3 4.4l.55 8.7a1.1 1.1 0 0 0 1.1 1.05h4.1a1.1 1.1 0 0 0 1.1-1.05l.55-8.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function makeActionBtn(label, title, variant, handler, iconSvg) {
    const btn = document.createElement("button");
    btn.className = "act" + (variant ? " act-" + variant : "");
    if (iconSvg) {
      const icon = document.createElement("span");
      icon.className = "act-icon";
      icon.innerHTML = iconSvg;
      btn.append(icon);
    }
    const text = document.createElement("span");
    text.textContent = label;
    btn.append(text);
    btn.title = title;
    btn.addEventListener("click", handler);
    return btn;
  }

  function makeActions(session) {
    const row = document.createElement("div");
    row.className = "actions";
    row.append(
      makeActionBtn(
        L.openInClaude,
        L.openInClaudeTitle,
        "primary",
        () => send("openInClaude", { sid: session.sid }),
        ICONS.claude
      ),
      makeActionBtn(
        L.resume,
        L.resumeTitle,
        null,
        () => send("resume", { sid: session.sid, cwd: session.cwd }),
        ICONS.terminal
      ),
      makeActionBtn(
        L.openRecord,
        L.openRecordTitle,
        null,
        () => send("open", { path: session.path }),
        ICONS.doc
      ),
      makeActionBtn(
        L.del,
        L.delTitle,
        "danger",
        () => send("delete", { sid: session.sid, title: session.title }),
        ICONS.trash
      )
    );
    return row;
  }

  // 就地重命名会话：把标题换成输入框。留空则清除自定义名、恢复原始标题。
  function startTitleEdit(titleEl, renameBtn, session) {
    const input = document.createElement("input");
    input.className = "title-edit-input";
    input.placeholder = L.renameSessionPlaceholder;
    // 预填当前自定义名；无自定义名时用原始标题（占位符则留空）
    input.value =
      session.name ||
      (session.originalTitle && session.originalTitle !== "(无标题)"
        ? session.originalTitle
        : "");

    let done = false; // 防 Enter 提交后 blur 再次触发
    function finish(save) {
      if (done) {
        return;
      }
      done = true;
      delete document.body.dataset.noteEditing;
      if (save) {
        const newName = input.value.trim();
        if (newName !== (session.name || "")) {
          pendingData = null; // 丢弃编辑期间缓冲的旧数据，等后端推新数据
          send("setName", { sid: session.sid, name: newName });
          return;
        }
      }
      // 未保存或名称未变：恢复视图并应用编辑期间缓冲的数据
      renderList();
      applyPending();
    }

    // 复用备注编辑的自动刷新守卫：编辑期间暂存后端推送，不打断输入
    input.addEventListener("focus", () => {
      document.body.dataset.noteEditing = "1";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));

    renameBtn.style.display = "none";
    titleEl.replaceWith(input);
    input.focus();
    input.select();
  }

  // ===== 备注区 =====
  function makeNoteArea(session) {
    const wrap = document.createElement("div");
    wrap.className = "note-wrap";

    const currentNote = session.note || "";

    if (currentNote) {
      // 显示备注文本，点击转为编辑
      const noteText = document.createElement("div");
      noteText.className = "note-text";
      noteText.textContent = currentNote;
      noteText.title = L.noteEditHint;
      noteText.addEventListener("click", () => {
        startNoteEdit(wrap, session, currentNote);
      });
      wrap.append(noteText);
    } else {
      // 显示低调的添加入口
      const addBtn = document.createElement("span");
      addBtn.className = "note-add";
      addBtn.textContent = L.noteAdd;
      addBtn.addEventListener("click", () => {
        startNoteEdit(wrap, session, "");
      });
      wrap.append(addBtn);
    }
    return wrap;
  }

  // 开始编辑备注
  function startNoteEdit(wrap, session, originalNote) {
    wrap.innerHTML = "";
    const textarea = document.createElement("textarea");
    textarea.className = "note-textarea";
    textarea.value = originalNote;
    textarea.rows = 2;
    textarea.placeholder = L.notePlaceholder;

    // cancelled 标志：Esc 取消时不触发保存
    let cancelled = false;

    // 标记用户正在编辑备注，阻止自动刷新
    textarea.addEventListener("focus", () => {
      document.body.dataset.noteEditing = "1";
    });

    textarea.addEventListener("blur", () => {
      delete document.body.dataset.noteEditing;
      if (!cancelled) {
        const newNote = textarea.value;
        // trim 后比较：纯空白变动视为无变化，避免无意义的 setNote
        if (newNote.trim() !== originalNote.trim()) {
          send("setNote", { sid: session.sid, note: newNote });
        } else {
          // 内容未变，直接重渲染恢复视图
          renderList();
        }
      }
      // 应用暂存的后端数据
      applyPending();
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Esc 取消：不保存。blur 监听会负责 renderList + applyPending
        cancelled = true;
        textarea.blur();
      }
    });

    wrap.append(textarea);
    textarea.focus();
  }

  // 应用暂存的后端数据
  function applyPending() {
    if (pendingData) {
      const data = pendingData;
      pendingData = null;
      applyData(data);
    }
  }

  // ===== 星标按钮 =====
  function makeStarBtn(session) {
    const btn = document.createElement("button");
    btn.className = "star-btn" + (session.star ? " starred" : "");
    btn.title = session.star ? L.unstar : L.star;
    btn.textContent = session.star ? "★" : "☆";
    btn.addEventListener("click", () => {
      send("toggleStar", { sid: session.sid });
    });
    return btn;
  }

  // ===== 卡片选择复选框 =====
  function makeSelectBox(session) {
    const label = document.createElement("label");
    label.className = "select-label";
    label.title = L.selectSession;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "select-cb";
    cb.checked = state.selected.has(session.sid);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        state.selected.add(session.sid);
      } else {
        state.selected.delete(session.sid);
      }
      renderBatchBar();
      // 更新卡片选中样式
      const card = label.closest(".card");
      if (card) card.classList.toggle("selected", cb.checked);
    });

    label.append(cb);
    return label;
  }

  // ===== 卡片 =====
  function makeCard(session) {
    const term = state.search.trim().toLowerCase();

    const card = document.createElement("div");
    card.className = "card" + (state.selected.has(session.sid) ? " selected" : "");

    // --- 卡头（星标 + 选择框 + 标题 + meta）---
    const head = document.createElement("div");
    head.className = "card-head";

    // 左侧：选择框
    const selectBox = makeSelectBox(session);

    // 星标按钮
    const starBtn = makeStarBtn(session);

    const title = document.createElement("span");
    title.className = "card-title";
    title.title = L.titleOpenHint;
    // 数据层对无标题会话返回中文占位符 "(无标题)"，展示时按语言映射。
    const displayTitle = session.title === "(无标题)" ? L.untitled : session.title;
    applyHighlight(title, displayTitle, term);
    title.addEventListener("click", () =>
      send("open", { path: session.path })
    );

    // 重命名会话按钮（hover 显示）：改名只存到 sidecar，不动原始 .jsonl。
    const renameBtn = document.createElement("button");
    renameBtn.className = "title-edit-btn";
    renameBtn.textContent = "✎";
    renameBtn.title = L.renameSession;
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startTitleEdit(title, renameBtn, session);
    });

    // 标题 + ✎ 包在一起，让重命名按钮紧贴会话名（而非被挤到最右）
    const titleWrap = document.createElement("span");
    titleWrap.className = "card-title-wrap";
    titleWrap.append(title, renameBtn);

    const meta = document.createElement("span");
    meta.className = "card-meta";
    meta.textContent = session.sid.slice(0, 8) + " · " + fmtDate(session.mtime);

    head.append(selectBox, starBtn, titleWrap, meta);

    // --- snippet（带高亮）---
    const snippet = document.createElement("div");
    snippet.className = "card-snippet";
    applyHighlight(snippet, session.snippet || "", term);

    // --- chips ---
    const chips = document.createElement("div");
    chips.className = "chips";
    (session.cats || []).forEach((c) => chips.append(makeChip(session, c)));
    chips.append(makeAddTag(session));

    // --- 备注区 ---
    const noteArea = makeNoteArea(session);

    card.append(head, snippet, chips, noteArea, makeActions(session));
    return card;
  }

  // ===== 渲染列表 =====
  function renderList() {
    // 保留 sortBar / batchBar 节点引用，清空后重新插入
    els.list.innerHTML = "";

    // 重新插入排序条
    if (sortBar) els.list.append(sortBar);
    // 重新插入批量操作条
    if (batchBar) els.list.append(batchBar);

    const visible = visibleSessions();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = L.emptyList;
      els.list.append(empty);
      return;
    }
    visible.forEach((s) => els.list.append(makeCard(s)));
  }

  // ===== 主渲染 =====
  function render() {
    renderSidebar();
    ensureSortBar();
    updateSortBar();
    ensureBatchBar();
    renderBatchBar();
    renderList();
  }

  // ===== 应用后端数据 =====
  function applyData(sessions) {
    // 记录文档滚动位置：自动刷新 / 操作回填会全量重建列表，
    // 若不恢复，正在阅读时会被拽回顶部。搜索/排序走 renderList，不在此列。
    const scrollY = window.scrollY;

    state.sessions = sessions;

    // 清理已不存在的 selected sid
    const sidSet = new Set(sessions.map((s) => s.sid));
    state.selected.forEach((sid) => {
      if (!sidSet.has(sid)) state.selected.delete(sid);
    });

    // filter 回退逻辑（STAR 始终有效）
    if (
      state.filter !== ALL &&
      state.filter !== UNCAT &&
      state.filter !== STAR &&
      !allCategories().includes(state.filter)
    ) {
      state.filter = ALL;
    }

    render();

    // 恢复滚动位置（内容变矮时浏览器会自动 clamp 到合法范围）
    window.scrollTo(0, scrollY);
  }

  // ===== 事件监听 =====
  els.search.addEventListener("input", () => {
    state.search = els.search.value;
    renderList();
  });

  els.scopeAll.addEventListener("change", () => {
    state.scopeAll = els.scopeAll.checked;
    send("load");
  });

  // 语言切换：通知宿主写入配置，宿主会重建整个 webview HTML 应用新语言。
  if (els.langToggle) {
    els.langToggle.addEventListener("click", () => {
      send("setLang", { lang: LOCALE === "zh" ? "en" : "zh" });
    });
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "data") {
      // 若用户正在编辑备注，暂存新数据不立即渲染
      if (document.body.dataset.noteEditing) {
        pendingData = msg.sessions || [];
      } else {
        applyData(msg.sessions || []);
      }
    }
  });

  send("load");
})();
