# Note2Red

这是 `note-to-red` 的个人定制版本，用于在 Obsidian 中将 Markdown 笔记导出为小红书风格图片。

## 来源与许可

本项目基于上游项目 [Yeban8090/note-to-red](https://github.com/Yeban8090/note-to-red) 定制。

上游项目采用 MIT License。当前仓库保留 MIT 许可证，并在此基础上记录个人定制改动。原项目版权归原作者所有，自定义修改由本仓库维护。

## 当前版本

当前插件版本见 `manifest.json`：

- 插件 ID：`obsidian-note2red`
- 插件显示名：`Note2Red`
- 当前版本：`1.5.0`

## 目录说明

- `manifest.json`：Obsidian 插件清单。
- `main.js`：当前可运行的插件主文件。
- `styles.css`：当前可运行的插件样式。
- `CHANGELOG.md`：改动记录。
- `NOTES.md`：维护笔记。
- `ROADMAP.md`：后续计划。
- `sourcecode/`：后续源码维护目录，建立后日常只改这里的源码。

## 源码构建

`sourcecode/` 已放入上游源码工程，作为后续迁移定制逻辑的基础。

```bash
cd sourcecode
npm ci
npm run build
```

普通 `npm run build` 只输出到 `sourcecode/dist/`，用于安全验证，不会覆盖 Obsidian 当前正在运行的插件。

只有确认源码已经迁移完成并测试通过后，才执行：

```bash
npm run build:runtime
```

这个命令会输出到 `.obsidian/plugins/obsidian-note2red/`，覆盖 Obsidian 实际加载的 `main.js` 和 `styles.css`。

## 维护原则

当前阶段先保存可用基线版本。后续迁移到源码维护后，外层 `main.js` 和 `styles.css` 应由构建流程生成。
