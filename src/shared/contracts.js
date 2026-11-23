// 主进程与渲染进程共享的 IPC 通道名与数据结构定义

// IPC 通道名
const IPC = {
  // 记录
  ADD_RECORD: 'record:add', // 新增一条记录
  UPDATE_RECORD: 'record:update', // 更新一条记录
  DELETE_RECORD: 'record:delete', // 删除一条记录
  LIST_BY_DATE: 'record:listByDate', // 按天取记录（多条）
  SAVE_IMAGE: 'record:saveImage', // 保存一张图片二进制，返回相对路径
  DELETE_IMAGE: 'record:deleteImage', // 删除一张图片文件（清理孤儿文件）
  // 总结
  GET_SUMMARY: 'summary:getByDate', // 取某天总结
  UPSERT_SUMMARY: 'summary:upsert', // 手动保存/更新某天总结
  // 历史回看
  LIST_DATES: 'history:listDates', // 列出有记录的日期（倒序），供按天回看
  GET_DAY_UNIT: 'day:getDayUnit', // 取某一天完整数据单元（多条记录 + 当天总结）
  // 窗口
  HIDE_WINDOW: 'window:hide', // 保存后自动隐藏挂件窗口（驻留托盘）
  // 标签（业务阶段）
  LIST_TAGS: 'tag:list', // 列出全部标签（按顺序）
  ADD_TAG: 'tag:add', // 新增标签
  RENAME_TAG: 'tag:rename', // 重命名标签
  DELETE_TAG: 'tag:delete', // 删除标签
  MOVE_TAG: 'tag:move', // 调整标签顺序
  // 产品分类
  LIST_PRODUCTS: 'product:list', // 列出全部产品（按顺序）
  ADD_PRODUCT: 'product:add', // 新增产品
  RENAME_PRODUCT: 'product:rename', // 重命名产品
  DELETE_PRODUCT: 'product:delete', // 删除产品
  // 开机自启动
  AUTOSTART_SET: 'autostart:set', // 设置开机自启动开/关
  AUTOSTART_GET: 'autostart:get', // 查询当前自启动状态
};

// status 可选值
const STATUS = ['done', 'wip', 'blocked', 'todo'];

// 一天的完整数据单元：当天多条记录 + 当天总结（0 或 1 条）
// 渲染进程据此渲染"按天回看"界面
const STATUS_LABEL = {
  done: '✔完成',
  wip: '⏳进行中',
  blocked: '⚠阻塞',
  todo: '➡待办',
};

module.exports = { IPC, STATUS, STATUS_LABEL };