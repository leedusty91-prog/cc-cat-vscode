# 发布流程（Release & Publish）

本扩展通过 **VS Code 应用市场（Marketplace）** 分发，用户安装后由 VS Code 自动更新。
要让用户拿到新版本，核心动作是 **`vsce publish`**。

> ⚠️ 关键认知：`git push` 和打 release tag **都不会**让用户收到更新。三者相互独立：
> - `git push` → 只传源码到 GitHub
> - git tag / GitHub Release → 只是源码里程碑标记（可附 `.vsix` 供手动下载）
> - **`vsce publish` → 唯一能让市场用户自动更新的动作**

## 一次性准备

1. 工具：本项目用 `npx`，无需全局安装。
   ```bash
   npx @vscode/vsce --version
   ```
2. Publisher 与 PAT：
   - Publisher 为 `ljx`（见 `package.json`）。
   - **首次发布**：若 publisher `ljx` 尚不存在，先在 <https://marketplace.visualstudio.com/manage/createpublisher> 创建；且用于生成 PAT 的账号必须拥有该 publisher。扩展首次 `publish` 会在市场上创建它。
   - 在 <https://dev.azure.com> 用与该 publisher 关联的账号创建 Personal Access Token：
     - **Organization**：All accessible organizations
     - **Scopes**：勾选 **Marketplace → Manage**
   - 登录（只需一次，凭据会缓存）：
     ```bash
     npx @vscode/vsce login ljx   # 粘贴 PAT
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
4. **发布到市场**：
   ```bash
   npx @vscode/vsce publish
   # 或让它自动 bump 版本号：npx @vscode/vsce publish patch|minor|major
   ```
   发布后几分钟到几十分钟内市场上架；已安装用户的 VS Code 下次检查更新时自动升级。
5. **（可选）打 tag + GitHub Release**，给手动安装者一个下载点：
   ```bash
   gh release create v<version> releases/cc-session-manager-<version>.vsix \
     --title "v<version>" --generate-notes
   ```

## 用户如何更新

- **从市场安装的用户**：无需操作，VS Code 自动更新（也可在扩展面板手动点「更新」）。
- **手动装 `.vsix` 的用户**：需自行下载新 `.vsix` 重新 `code --install-extension`，不会自动更新。

## 注意事项

- `.vscodeignore` 控制打进 vsix 的文件。开发文档（`CLAUDE.md`、`RELEASING.md`）、`releases/`、`.codegraph/` 等均已排除，不应出现在发布包里。
- 市场发布**不可撤销**：只能发更高版本覆盖，或 `vsce unpublish` 整个下架。发布前务必本地验证 vsix。
- 同一版本号**不能重复发布**，每次发布必须递增。
