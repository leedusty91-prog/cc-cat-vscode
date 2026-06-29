# 发布流程（Release & Publish）

本扩展通过 **Open VSX 注册表**（<https://open-vsx.org>）分发，面向 Antigravity / Cursor / VSCodium 等基于 Open VSX 的编辑器。要让用户拿到新版本，核心动作是 **`ovsx publish`**。

> ⚠️ 关键认知：`git push` 和打 release tag **都不会**让用户收到更新。三者相互独立：
> - `git push` → 只传源码到 GitHub
> - git tag / GitHub Release → 只是源码里程碑标记（可附 `.vsix` 供手动下载）
> - **`ovsx publish` → 唯一能让 Open VSX 用户更新的动作**

## 一次性准备

1. 工具：本项目用 `npx`，无需全局安装。
   ```bash
   npx @vscode/vsce --version   # 打包工具
   npx ovsx --version           # Open VSX 发布工具
   ```
2. Publisher（namespace）与 Token：
   - Publisher 为 `ljx`（见 `package.json`）。
   - 在 <https://open-vsx.org> 用 GitHub 账号登录，生成 Access Token（User Settings → Access Tokens）。
   - **首次发布**：若 namespace `ljx` 尚不存在，先创建：
     ```bash
     npx ovsx create-namespace ljx -p <OPEN_VSX_TOKEN>
     ```

## 每次发布

1. **改版本号**（两处保持同步）：
   - `package.json` 的 `version`
   - `CHANGELOG.md` 顶部新增对应条目（日期 + Features/Fixes/… 分节）
2. **打包并本地验证**：
   ```bash
   npx @vscode/vsce package --out releases/
   code --install-extension releases/cc-session-manager-<version>.vsix
   ```
   打开面板确认功能正常后再继续。
3. **提交并推送源码**（conventional commits）：
   ```bash
   git add -A
   git commit -m "chore(release): <version>"
   git push origin master
   ```
4. **发布到 Open VSX**：
   ```bash
   npx ovsx publish releases/cc-session-manager-<version>.vsix -p <OPEN_VSX_TOKEN>
   ```
   发布后几分钟内上架：<https://open-vsx.org/extension/ljx/cc-session-manager>。
5. **（可选）打 tag + GitHub Release**，给手动安装者一个下载点：
   ```bash
   gh release create v<version> releases/cc-session-manager-<version>.vsix \
     --title "v<version>" --generate-notes
   ```

## 用户如何更新

- **从 Open VSX 安装的用户**（Antigravity / Cursor / VSCodium）：编辑器检查更新时自动升级，也可在扩展面板手动点「更新」。
- **手动装 `.vsix` 的用户**：需自行下载新 `.vsix` 重新 `code --install-extension`，不会自动更新。

## 注意事项

- `.vscodeignore` 控制打进 vsix 的文件。开发文档（`CLAUDE.md`、`RELEASING.md`）、`releases/`、`.codegraph/` 等均已排除，不应出现在发布包里。
- Open VSX 发布**不可撤销**：只能发更高版本覆盖，或 `ovsx` 下架整个扩展。发布前务必本地验证 vsix。
- 同一版本号**不能重复发布**，每次发布必须递增。
- Token 不要写进仓库或提交记录；用环境变量或临时粘贴。
