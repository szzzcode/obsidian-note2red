# Note to RED Custom

这是 `note-to-red` 的个人定制版本，用于在 Obsidian 中将 Markdown 笔记导出为小红书风格图片。

## 来源与许可

本项目基于上游项目 [Yeban8090/note-to-red](https://github.com/Yeban8090/note-to-red) 定制。

上游项目采用 MIT License。当前仓库保留 MIT 许可证，并在此基础上记录个人定制改动。原项目版权归原作者所有，自定义修改由本仓库维护。

## 当前版本

当前插件版本见 `manifest.json`：

- 插件 ID：`obsidian-note2red`
- 当前版本：`1.0.19-custom.13`

## 目录说明

- `manifest.json`：Obsidian 插件清单。
- `main.js`：当前可运行的插件主文件。
- `styles.css`：当前可运行的插件样式。
- `CHANGELOG.md`：改动记录。
- `NOTES.md`：维护笔记。
- `ROADMAP.md`：后续计划。
- `sourcecode/`：后续源码维护目录，建立后日常只改这里的源码。

## 维护原则

当前阶段先保存可用基线版本。后续迁移到源码维护后，外层 `main.js` 和 `styles.css` 应由构建流程生成。
