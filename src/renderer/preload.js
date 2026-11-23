// Preload：通过 contextBridge 暴露安全的 API 给渲染进程
// 注意：Electron preload 沙箱中 require 只用内置 electron 模块，不能跨目录 require 本地文件。
// 因此这里直接内联 IPC 通道名（与 src/shared/contracts.js 保持一致）。
const { contextBridge, ipcRenderer } = require('electron');

const IPC = {
  ADD_RECORD: 'record:add',
  UPDATE_RECORD: 'record:update',
  DELETE_RECORD: 'record:delete',
  SAVE_IMAGE: 'record:saveImage',
  DELETE_IMAGE: 'record:deleteImage',
  HIDE_WINDOW: 'window:hide',
  COPY_TEXT: 'clipboard:copyText',
  LIST_TAGS: 'tag:list',
  ADD_TAG: 'tag:add',
  RENAME_TAG: 'tag:rename',
  DELETE_TAG: 'tag:delete',
  MOVE_TAG: 'tag:move',
  LIST_PRODUCTS: 'product:list',
  ADD_PRODUCT: 'product:add',
  RENAME_PRODUCT: 'product:rename',
  DELETE_PRODUCT: 'product:delete',
  AUTOSTART_SET: 'autostart:set',
  AUTOSTART_GET: 'autostart:get',
  LIST_DATES: 'history:listDates',
  GET_DAY_UNIT: 'day:getDayUnit',
  UPSERT_SUMMARY: 'summary:upsert',
  GET_WEEK_RECORDS: 'summary:weekRecords',
};

contextBridge.exposeInMainWorld('dayfold', {
  // 记录
  addRecord: (payload) => ipcRenderer.invoke(IPC.ADD_RECORD, payload),
  updateRecord: (id, payload) => ipcRenderer.invoke(IPC.UPDATE_RECORD, id, payload),
  deleteRecord: (id) => ipcRenderer.invoke(IPC.DELETE_RECORD, id),
  saveImage: (payload) => ipcRenderer.invoke(IPC.SAVE_IMAGE, payload),
  deleteImage: (relPath) => ipcRenderer.invoke(IPC.DELETE_IMAGE, relPath),
  // 历史回看
  listDates: (limit) => ipcRenderer.invoke(IPC.LIST_DATES, limit),
  getDayUnit: (date) => ipcRenderer.invoke(IPC.GET_DAY_UNIT, date),
  // 窗口：保存后自动隐藏挂件
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  copyText: (text) => ipcRenderer.invoke(IPC.COPY_TEXT, text),
  // 标签（业务阶段）
  listTags: () => ipcRenderer.invoke(IPC.LIST_TAGS),
  addTag: (name) => ipcRenderer.invoke(IPC.ADD_TAG, name),
  renameTag: (id, name) => ipcRenderer.invoke(IPC.RENAME_TAG, id, name),
  deleteTag: (id) => ipcRenderer.invoke(IPC.DELETE_TAG, id),
  moveTag: (id, direction) => ipcRenderer.invoke(IPC.MOVE_TAG, id, direction),
  // 产品分类
  listProducts: () => ipcRenderer.invoke(IPC.LIST_PRODUCTS),
  addProduct: (name) => ipcRenderer.invoke(IPC.ADD_PRODUCT, name),
  renameProduct: (id, name) => ipcRenderer.invoke(IPC.RENAME_PRODUCT, id, name),
  deleteProduct: (id) => ipcRenderer.invoke(IPC.DELETE_PRODUCT, id),
  // 开机自启动
  setAutostart: (enabled) => ipcRenderer.invoke(IPC.AUTOSTART_SET, enabled),
  getAutostart: () => ipcRenderer.invoke(IPC.AUTOSTART_GET),
  // 手动总结
  upsertSummary: (payload) => ipcRenderer.invoke(IPC.UPSERT_SUMMARY, payload),
  // 周报
  getWeekRecords: (startDate, endDate) => ipcRenderer.invoke(IPC.GET_WEEK_RECORDS, startDate, endDate),
  // 主进程 -> 渲染进程：挂件被全局快捷键唤起时，聚焦输入框
  onShowFocus: (cb) => {
    ipcRenderer.on('widget:focus', () => cb && cb());
  },
  // 主进程 -> 渲染进程：挂件失焦收起前，通知清理待提交图片
  onBlurCleanup: (cb) => {
    ipcRenderer.on('widget:blur-cleanup', () => cb && cb());
  },
});