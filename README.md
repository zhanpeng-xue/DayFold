# Dayfold

常驻系统托盘的极简工作日志工具（Electron）。像 uTools 一样轻量：随时唤起、快速记录、手动写当天总结。

## ✨ 功能

- **快速记录**：按 `Ctrl+F8` 随时唤起悬浮输入框，多行输入，回车即存，自动收起
- **分类管理**：支持「业务阶段标签」和「产品分类」两级维度，均可自定义增删改
- **粘贴图片**：支持在记录里粘贴截图，图片随记录保存，历史面板可回看、点击放大
- **历史回看**：按日期浏览记录，可编辑、删除
- **手动总结**：每天可以手写一条工作日志总结（支持 Markdown），保存在历史里
- **开机自启动**：托盘右键可开关，登录即后台常驻

## 🖥️ 技术栈

- Electron 45（内置 Node 24）
- Node 内置 SQLite（`node:sqlite`），零原生编译依赖
- 数据本地存储，隐私安全

## 🚀 使用

### 下载安装包

在 [GitHub Releases](../../releases) 页面下载最新的 Windows 安装包（`Dayfold Setup x.x.x.exe`）。

或使用便携版（`Dayfold x.x.x.exe`），无需安装，双击即用。

### 开发运行

```bash
npm install
npm start
```

或双击 `启动Dayfold.bat`（自动安装依赖并启动）。

### 打包

```bash
npm run dist:win
```

打包产物在 `release/` 目录（NSIS 安装包 + 便携版）。

> 提示：也可以直接双击 `打包成exe.bat` 一键打包。

### CI 自动打包（GitHub Actions）

推送 `v*` 标签（如 `v0.1.0`）会自动触发 GitHub Actions 打包 Windows 安装包，并自动发布到 Releases。

```bash
git tag v0.1.0
git push origin v0.1.0
```

## ⌨️ 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+F8` | 唤起输入挂件 |
| `Enter` | 保存记录 |
| `Shift+Enter` | 换行 |
| `Esc` | 取消 / 收起 |

## 📁 数据存储

- 开发态：项目根目录外的 `data/` 文件夹
- 打包安装后：`%APPDATA%\Dayfold`（Windows 用户数据目录）

## 📷 截图

（待补充）

## License

[MIT](LICENSE)