// SQLite 数据层：使用 Node 内置的 node:sqlite（同步、零原生编译）
// records / summaries 两表 + 按天存取/回看
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

let db = null;

// 日期工具：把任意 Date 规整成 YYYY-MM-DD（本地时区）
function formatYMD(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 决定数据库文件的存放目录：
 * - 未打包（开发态 / 沙箱调试）：放 workspace 根目录下的 data/ 文件夹
 *   （即项目 dayfold-app 的上一级），便于在受限环境下由应用进程直接读写；
 * - 已打包（正式发布）：放系统用户数据目录 userData。
 */
function resolveDbDir() {
  if (!app.isPackaged) {
    // app.getAppPath() 开发态指向 dayfold-app 目录，往上一级即 workspace 根
    const dir = path.resolve(app.getAppPath(), '..', 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 供主进程获取数据目录（图片等附件也存这里）
function getDataDir() {
  return resolveDbDir();
}

// 初始化数据库
function init() {
  const dir = resolveDbDir();
  const dbPath = path.join(dir, 'dayfold.sqlite');

  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT    NOT NULL,
      status     TEXT,
      project    TEXT,
      created_at TEXT    NOT NULL,
      date       TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);

    CREATE TABLE IF NOT EXISTS summaries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      date        TEXT    NOT NULL UNIQUE,
      content     TEXT    NOT NULL,
      used_skills TEXT,
      created_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_date ON summaries(date);

    CREATE TABLE IF NOT EXISTS tags (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL UNIQUE,   -- 标签名
      sort     INTEGER NOT NULL DEFAULT 0 -- 显示顺序
    );

    CREATE TABLE IF NOT EXISTS products (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT    NOT NULL UNIQUE,   -- 产品/项目名
      sort     INTEGER NOT NULL DEFAULT 0
    );
  `);

  // —— 轻量迁移：为已存在的旧库 records 表补 images 列 ——
  const cols = getDb().prepare('PRAGMA table_info(records)').all().map((c) => c.name);
  if (!cols.includes('images')) {
    getDb().exec("ALTER TABLE records ADD COLUMN images TEXT"); // JSON 数组字符串，存图片相对路径
  }

  return dbPath;
}

function getDb() {
  if (!db) throw new Error('数据库尚未初始化，请先调用 init()');
  return db;
}

// —— 记录 —— //

/**
 * 新增一条记录。
 * 支持两种可选维度：
 *   - status：旧的状态标记（done/wip/blocked/todo）
 *   - tag：业务阶段标签，存入 status 列（TEXT）
 * 二者互斥传入，tag 优先。
 *   - images：图片相对路径数组（可空），存为 JSON 字符串
 */
function addRecord({ content, status = null, project = null, tag = null, images = null }) {
  const d = new Date();
  const statusVal = tag || status;
  const imagesVal = (images && images.length) ? JSON.stringify(images) : null;
  const info = getDb()
    .prepare('INSERT INTO records (content, status, project, images, created_at, date) VALUES (?, ?, ?, ?, ?, ?)')
    .run(content, statusVal, project, imagesVal, d.toISOString(), formatYMD(d));
  return getRecordById(Number(info.lastInsertRowid));
}

function getRecordById(id) {
  return normalizeRecord(getDb().prepare('SELECT * FROM records WHERE id = ?').get(id));
}

// 把记录行里的 images（JSON 字符串）解析为数组，供渲染进程直接使用
function normalizeRecord(row) {
  if (!row) return row;
  if (row.images) {
    try {
      row.images = JSON.parse(row.images);
    } catch (_) {
      row.images = [];
    }
  } else {
    row.images = [];
  }
  return row;
}

/**
 * 更新一条记录：支持改内容 + 标签 + 产品。
 * - `tag` 显式传入（含 null/''）时以其为准：null 表示清空标签；
 * - 仅当 `tag` 为 undefined（未传）时才回退到 `status`，再回退到保留旧值。
 * - `project` 显式传入（含 null/''）时以其为准：null 表示清空产品；
 *   仅当 `project` 为 undefined（未传）时保留旧值。
 * 返回更新后的记录。
 */
function updateRecord(id, { content, status = null, tag, project }) {
  const cur = getRecordById(id);
  if (!cur) return null;
  const newContent = (content !== undefined && content !== null) ? content : cur.content;
  let statusVal;
  if (tag !== undefined) {
    // 显式传入 tag：null/'' 都视为"清空标签"
    statusVal = tag || null;
  } else if (status !== undefined && status !== null) {
    statusVal = status;
  } else {
    statusVal = cur.status;
  }
  // project：显式传入才更新，否则保留旧值
  const newProject = (project !== undefined) ? (project || null) : cur.project;
  getDb()
    .prepare('UPDATE records SET content = ?, status = ?, project = ? WHERE id = ?')
    .run(newContent, statusVal, newProject, id);
  return getRecordById(id);
}

/** 删除一条记录。返回是否删除成功 */
function deleteRecord(id) {
  const info = getDb().prepare('DELETE FROM records WHERE id = ?').run(id);
  return info.changes > 0;
}

/** 按天取当天全部记录，时间倒序（最新在前） */
function listRecordsByDate(date) {
  return getDb()
    .prepare('SELECT * FROM records WHERE date = ? ORDER BY created_at DESC')
    .all(date)
    .map(normalizeRecord);
}

/** 按日期范围取记录（含首尾），时间正序（用于周报汇总） */
function listRecordsByDateRange(startDate, endDate) {
  return getDb()
    .prepare('SELECT * FROM records WHERE date >= ? AND date <= ? ORDER BY date ASC, created_at ASC')
    .all(startDate, endDate)
    .map(normalizeRecord);
}

// —— 总结 —— //

function getSummaryByDate(date) {
  return getDb().prepare('SELECT * FROM summaries WHERE date = ?').get(date);
}

function upsertSummary({ date, content, used_skills }) {
  const d = new Date().toISOString();
  const existing = getSummaryByDate(date);
  if (existing) {
    getDb()
      .prepare('UPDATE summaries SET content = ?, used_skills = ?, created_at = ? WHERE date = ?')
      .run(content, used_skills, d, date);
    return getSummaryByDate(date);
  }
  const info = getDb()
    .prepare('INSERT INTO summaries (date, content, used_skills, created_at) VALUES (?, ?, ?, ?)')
    .run(date, content, used_skills, d);
  return { id: Number(info.lastInsertRowid), date, content, used_skills, created_at: d };
}

// —— 历史回看 —— //

function listDates(limit = 30) {
  return getDb()
    .prepare(`
      SELECT d.date,
             (SELECT COUNT(*) FROM records r WHERE r.date = d.date) AS record_count,
             EXISTS(SELECT 1 FROM summaries s WHERE s.date = d.date) AS has_summary
      FROM (
        SELECT date FROM records
        UNION
        SELECT date FROM summaries
      ) d
      ORDER BY d.date DESC
      LIMIT ?
    `)
    .all(limit);
}

function getDayUnit(date) {
  return {
    date,
    records: listRecordsByDate(date),
    summary: getSummaryByDate(date) || null,
  };
}

// —— 标签（业务阶段）—— //

/** 列出全部标签，按 sort 排序 */
function listTags() {
  return getDb().prepare('SELECT * FROM tags ORDER BY sort ASC, id ASC').all();
}

/** 新增标签；name 重复时抛错（由 IPC 捕获返回） */
function addTag(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('标签名不能为空');
  const max = getDb().prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM tags').get().m;
  const info = getDb()
    .prepare('INSERT INTO tags (name, sort) VALUES (?, ?)')
    .run(trimmed, Number(max) + 1);
  return { id: Number(info.lastInsertRowid), name: trimmed };
}

/** 重命名标签 */
function renameTag(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('标签名不能为空');
  getDb().prepare('UPDATE tags SET name = ? WHERE id = ?').run(trimmed, id);
  return getDb().prepare('SELECT * FROM tags WHERE id = ?').get(id) || null;
}

/** 删除标签 */
function deleteTag(id) {
  const info = getDb().prepare('DELETE FROM tags WHERE id = ?').run(id);
  return info.changes > 0;
}

/** 调整标签顺序：上移/下移一行（direction: 'up' | 'down'） */
function moveTag(id, direction) {
  const tag = getDb().prepare('SELECT * FROM tags WHERE id = ?').get(id);
  if (!tag) return false;
  const step = direction === 'up' ? -1 : 1;
  const swap = getDb()
    .prepare('SELECT * FROM tags WHERE sort = ? AND id != ?')
    .get(tag.sort + step);
  if (!swap) return false; // 已在边界
  // 直接交换二者 sort（无唯一约束，幂等）
  getDb().prepare('UPDATE tags SET sort = ? WHERE id = ?').run(swap.sort, tag.id);
  getDb().prepare('UPDATE tags SET sort = ? WHERE id = ?').run(tag.sort, swap.id);
  return true;
}

// —— 产品分类 —— //

/** 列出全部产品，按 sort 排序 */
function listProducts() {
  return getDb().prepare('SELECT * FROM products ORDER BY sort ASC, id ASC').all();
}

/** 新增产品；name 重复时抛错 */
function addProduct(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('产品名不能为空');
  const max = getDb().prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM products').get().m;
  const info = getDb()
    .prepare('INSERT INTO products (name, sort) VALUES (?, ?)')
    .run(trimmed, Number(max) + 1);
  return { id: Number(info.lastInsertRowid), name: trimmed };
}

/** 重命名产品 */
function renameProduct(id, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('产品名不能为空');
  getDb().prepare('UPDATE products SET name = ? WHERE id = ?').run(trimmed, id);
  return getDb().prepare('SELECT * FROM products WHERE id = ?').get(id) || null;
}

/** 删除产品 */
function deleteProduct(id) {
  const info = getDb().prepare('DELETE FROM products WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = {
  init,
  getDb,
  getDataDir,
  formatYMD,
  addRecord,
  updateRecord,
  deleteRecord,
  getRecordById,
  listRecordsByDate,
  listRecordsByDateRange,
  getSummaryByDate,
  upsertSummary,
  listDates,
  getDayUnit,
  listTags,
  addTag,
  renameTag,
  deleteTag,
  moveTag,
  listProducts,
  addProduct,
  renameProduct,
  deleteProduct,
};