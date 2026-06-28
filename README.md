# Claude Code 会话分类（cc-cat）

⚠️ **非官方社区工具**——与 Anthropic / Claude Code 官方无关。

一个 VSCode / Antigravity 扩展，给本地的 Claude Code 会话打标签、按分类可视化管理。

- **不修改原始记录**：分类信息单独存到每个项目目录下的 `categories.json`（位于 `~/.claude/projects/<项目>/`），删掉也不影响原始会话。
- **可视化**：侧边栏按分类筛选，卡片上点选添加/移除标签，支持搜索、跨项目浏览。
- **零运行依赖**：纯 JavaScript，不需要编译。

## 使用

1. 在 VSCode / Antigravity 里打开任意一个曾经用过 Claude Code 的项目。
2. `Cmd/Ctrl + Shift + P` → 运行 **Claude Code: 打开会话分类面板**。
3. 在面板里：
   - 卡片下方 `+ 分类` 输入框回车即可打标签，已有分类有自动补全；标签上的 `×` 移除；
   - 左侧按分类筛选，顶部搜索框搜标题/首条消息；勾选「所有项目」可跨项目一起管理。
4. 每张卡片底部的操作：
   - **在 Claude Code 中打开**：在官方 Claude Code for VSCode 扩展面板里恢复此会话
     （调用扩展命令 `claude-vscode.editor.open <sessionId>`，等同于 `vscode://anthropic.claude-code/open?session=<id>`）；
   - **终端恢复**：在 IDE 集成终端、于该会话原始项目目录运行 `claude --resume <id>`；
   - **打开记录**：在编辑器打开原始 `.jsonl`；
   - **删除**：弹确认框后删除原始记录文件并清理分类（不可恢复）。

> 「在 Claude Code 中打开」依赖已安装官方扩展 `anthropic.claude-code`。若未安装或命令不可用，
> 会退回到 `vscode://` URI，再不行则提示改用「终端恢复」。

## 安装（开发/侧载）

无需编译，直接打包成 `.vsix` 分发：

```bash
# 一次性安装打包工具
npm install -g @vscode/vsce

# 在本目录打包
cd cc-cat-vscode
vsce package        # 生成 cc-cat-0.1.0.vsix
```

让别人安装：把 `.vsix` 发给对方，命令行安装即可（Antigravity 同理）：

```bash
code --install-extension cc-cat-0.1.0.vsix
# Antigravity 的 CLI 名称可能不同，或在「扩展」面板右上角菜单 → Install from VSIX… 选择该文件
```

> 打包时 vsce 可能提示缺少 `repository` 字段或 LICENSE，加 `--allow-missing-repository` 跳过即可。

## 调试

用 VSCode 打开本目录，按 `F5` 启动「扩展开发主机」窗口，在新窗口里运行命令即可热调试。

## 数据格式

`categories.json` 是简单的 `sessionId → [分类]` 映射，可手动编辑或用配套的 CLI（`cc-cat.py`）混用：

```json
{
  "d300305a-cc28-4fdb-815d-348b6c06d377": ["记忆系统", "后端"]
}
```
