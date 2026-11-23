// Electron 主进程入口：uTools 式极简挂件窗口 + 托盘 + IPC + 数据层
const { app, BrowserWindow, ipcMain, Notification, globalShortcut, clipboard, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const { IPC } = require('../shared/contracts');
const db = require('./db');
const { createTray } = require('./tray');

// Windows 通知需要 AppUserModelID，否则开发模式（未打包）下系统通知可能不显示。
// 必须尽早设置（app ready 之前）。
if (process.platform === 'win32') {
  app.setAppUserModelId('com.dayfold.app');
}

let mainWindow = null;
let managerWindow = null;
let historyWindow = null;
let tray = null;

// —— 全局错误捕获：写入日志文件，便于排错 ——
const fs = require('fs');
const logPath = path.join(__dirname, '..', '..', 'error.log');
function logError(tag, msg) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${tag}] ${msg}\n`);
  } catch (_) {}
}
process.on('uncaughtException', (err) => {
  logError('uncaughtException', (err && (err.stack || err.message)) || String(err));
});
process.on('unhandledRejection', (reason) => {
  logError('unhandledRejection', (reason && reason.stack) || String(reason));
});

// 是否由"登录自启动"拉起的（带 --autostart 参数）
function isAutostart() {
  return process.argv.includes('--autostart');
}

function hideWindow() {
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
}

function showMain() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
}

function toggleMain() {
  if (mainWindow && mainWindow.isVisible()) hideWindow();
  else showMain();
}

function quit() {
  app.isQuitting = true;
  app.quit();
}

// 打开"管理标签/产品"窗口（唯一实例）
function openManager() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show();
    managerWindow.focus();
    return;
  }
  managerWindow = new BrowserWindow({
    width: 460,
    height: 480,
    title: '分类管理',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  managerWindow.loadFile(path.join(__dirname, '..', 'renderer', 'manager.html'));
  managerWindow.on('closed', () => { managerWindow = null; });
}

// 打开"记录历史"窗口（唯一实例）
function openHistory() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.show();
    historyWindow.focus();
    return;
  }
  historyWindow = new BrowserWindow({
    width: 620,
    height: 560,
    title: '记录历史',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  historyWindow.loadFile(path.join(__dirname, '..', 'renderer', 'history.html'));
  historyWindow.on('closed', () => { historyWindow = null; });
}

// —— 图片附件：存文件、返回相对路径 —— //

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

// 保存一张图片（dataURL），返回 { ok, path }；path 为相对数据目录的路径
function saveImage(payload) {
  const data = payload && payload.dataURL;
  if (!data) return { ok: false, error: '无图片数据' };

  const m = /^data:([^;]+);base64,(.+)$/.exec(data);
  if (!m) return { ok: false, error: '图片数据格式非法' };
  const mime = m[1];
  const b64 = m[2];
  const ext = MIME_EXT[mime] || (payload && payload.ext) || 'png';
  const buf = Buffer.from(b64, 'base64');

  const dataDir = db.getDataDir();
  const now = new Date();
  const dateDir = db.formatYMD(now);
  const imgDir = path.join(dataDir, 'images', dateDir);
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const filename = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const absPath = path.join(imgDir, filename);
  fs.writeFileSync(absPath, buf);

  const relPath = path.join('images', dateDir, filename).replace(/\\/g, '/');
  return { ok: true, path: relPath };
}

// 删除一张图片文件（按相对路径），用于清理孤儿文件
function deleteImage(relPath) {
  if (!relPath) return { ok: false, error: '无图片路径' };
  const rel = String(relPath).replace(/\\/g, '/');
  if (!rel.startsWith('images/')) return { ok: false, error: '非法路径' };
  const abs = path.join(db.getDataDir(), rel);
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

// 注册 dayfold-img:// 协议，让渲染进程安全加载本地图片
function registerImageProtocol() {
  protocol.handle('dayfold-img', (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      const abs = path.join(db.getDataDir(), rel);
      return net.fetch(pathToFileURL(abs).toString());
    } catch (e) {
      return new Response('not found', { status: 404 });
    }
  });
}

// —— 开机自启动 —— //

function setAutostart(enabled) {
  const isDev = !app.isPackaged;
  const argPath = isDev ? app.getAppPath() : null;
  const args = isDev ? ['--autostart', argPath] : ['--autostart'];

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: enabled,
    args,
  });
  return getAutostart();
}

function getAutostart() {
  return app.getLoginItemSettings().openAtLogin;
}

// 登录自启动拉起时，在托盘上给一条可见提示
function notifyStartedSilently() {
  if (!Notification.isSupported()) return;
  try {
    const n = new Notification({
      title: 'Dayfold 已在后台运行',
      body: '点击托盘图标即可唤起输入挂件。',
      silent: true,
    });
    n.on('click', showMain);
    n.show();
  } catch (e) {
    // 忽略
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 260,
    minWidth: 520,
    minHeight: 160,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    title: 'Dayfold',
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 3 || (message && String(message).includes('[Dayfold]'))) {
      logError('renderer', message + ' @ ' + (sourceId || '') + ':' + line);
    }
  });
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    logError('did-fail-load', `${code} ${desc}`);
  });
  mainWindow.webContents.on('preload-error', (e, preloadPath, error) => {
    logError('preload-error', `${preloadPath} :: ${error.message}`);
  });
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    logError('render-process-gone', details.reason);
  });

  mainWindow.once('ready-to-show', () => {
    if (isAutostart()) {
      notifyStartedSilently();
    } else {
      showMain();
    }
  });

  mainWindow.on('close', (e) => {
    if (app.isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('blur', () => {
    if (app.isQuitting) return;
    setTimeout(() => {
      if (app.isQuitting) return;
      if (mainWindow && mainWindow.isFocused()) return;
      if (mainWindow && mainWindow.isVisible()) {
        mainWindow.webContents.send('widget:blur-cleanup');
        mainWindow.hide();
      }
    }, 80);
  });
}

// —— IPC 注册 —— //

function registerIpc() {
  ipcMain.handle(IPC.ADD_RECORD, (_e, payload) => db.addRecord(payload));
  ipcMain.handle(IPC.UPDATE_RECORD, (_e, id, payload) => db.updateRecord(id, payload));
  ipcMain.handle(IPC.DELETE_RECORD, (_e, id) => {
    try {
      const rec = db.getRecordById(id);
      const imgs = (rec && rec.images) || [];
      for (const rel of imgs) deleteImage(rel);
    } catch (_) {}
    return db.deleteRecord(id);
  });
  ipcMain.handle(IPC.LIST_BY_DATE, (_e, date) => db.listRecordsByDate(date));
  ipcMain.handle(IPC.SAVE_IMAGE, async (_e, payload) => {
    try {
      return saveImage(payload);
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });
  ipcMain.handle(IPC.DELETE_IMAGE, (_e, relPath) => deleteImage(relPath));
  ipcMain.handle(IPC.GET_SUMMARY, (_e, date) => db.getSummaryByDate(date));
  ipcMain.handle(IPC.UPSERT_SUMMARY, (_e, payload) => db.upsertSummary(payload));
  ipcMain.handle(IPC.GET_WEEK_RECORDS, (_e, startDate, endDate) => db.listRecordsByDateRange(startDate, endDate));
  ipcMain.handle(IPC.LIST_DATES, (_e, limit) => db.listDates(limit || 30));
  ipcMain.handle(IPC.GET_DAY_UNIT, (_e, date) => db.getDayUnit(date));
  ipcMain.on(IPC.HIDE_WINDOW, () => hideWindow());
  ipcMain.handle(IPC.COPY_TEXT, (_e, text) => {
    try {
      clipboard.writeText(String(text || ''));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  // 标签（业务阶段）
  ipcMain.handle(IPC.LIST_TAGS, () => db.listTags());
  ipcMain.handle(IPC.ADD_TAG, (_e, name) => db.addTag(name));
  ipcMain.handle(IPC.RENAME_TAG, (_e, id, name) => db.renameTag(id, name));
  ipcMain.handle(IPC.DELETE_TAG, (_e, id) => db.deleteTag(id));
  ipcMain.handle(IPC.MOVE_TAG, (_e, id, direction) => db.moveTag(id, direction));

  // 产品分类
  ipcMain.handle(IPC.LIST_PRODUCTS, () => db.listProducts());
  ipcMain.handle(IPC.ADD_PRODUCT, (_e, name) => db.addProduct(name));
  ipcMain.handle(IPC.RENAME_PRODUCT, (_e, id, name) => db.renameProduct(id, name));
  ipcMain.handle(IPC.DELETE_PRODUCT, (_e, id) => db.deleteProduct(id));

  // 自启动
  ipcMain.handle(IPC.AUTOSTART_SET, (_e, enabled) => setAutostart(enabled));
  ipcMain.handle(IPC.AUTOSTART_GET, () => getAutostart());
}

app.whenReady().then(() => {
  db.init();
  registerImageProtocol();
  registerIpc();
  createWindow();
  tray = createTray({
    showMain, hideWindow, toggleMain, openManager, openHistory,
    getAutostart, setAutostart, quit,
    getToday: () => db.formatYMD(new Date()),
  });

  // 全局快捷键：随时唤起输入挂件（Ctrl+F8）
  const HOTKEY = 'CommandOrControl+F8';
  const ok = globalShortcut.register(HOTKEY, () => {
    showMain();
    if (mainWindow) mainWindow.webContents.send('widget:focus');
  });
  if (!ok) {
    logError('hotkey', `全局快捷键 ${HOTKEY} 注册失败（可能被占用）`);
  }
});

// 注销全局快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showMain();
});

// 所有窗口关闭时，进程保持（托盘驻留）
app.on('window-all-closed', () => {
  // 刻意不退出，让应用驻留托盘
});