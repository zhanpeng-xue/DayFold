// 历史记录面板：顶部日期导航（倒序）+ 主体按天展示当天多条记录 + 当天总结
const api = window.dayfold;

let selectedDate = null; // 当前选中的日期 YYYY-MM-DD
let tagsCache = []; // 编辑时标签下拉的同步缓存
let productsCache = []; // 编辑时产品下拉的同步缓存

function esc(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtDateLabel(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-');
  return `${y}-${m}-${d}`;
}

// 渲染日期导航条
async function renderDateNav() {
  const nav = document.getElementById('date-nav');
  let dates = [];
  try {
    dates = await api.listDates(30);
  } catch (e) {
    console.error('加载日期失败:', e);
    return;
  }

  nav.innerHTML = '';
  if (dates.length === 0) {
    document.getElementById('day-view').innerHTML = '<div class="empty">还没有任何记录。用挂件记第一条吧。</div>';
    return;
  }

  // 默认选中第一个（最新，通常是今天）
  if (!selectedDate || !dates.some((d) => d.date === selectedDate)) {
    selectedDate = dates[0].date;
  }

  for (const d of dates) {
    const tab = document.createElement('div');
    tab.className = 'date-tab' + (d.date === selectedDate ? ' active' : '');
    tab.textContent = fmtDateLabel(d.date) + (d.record_count ? ` (${d.record_count})` : '');
    tab.onclick = () => {
      selectedDate = d.date;
      renderDateNav(); // 刷新高亮
      renderDay();
    };
    nav.appendChild(tab);
  }
}

// 渲染选中日期当天内容（多条记录 + 总结）
async function renderDay() {
  const view = document.getElementById('day-view');
  if (!selectedDate) return;
  view.innerHTML = '<div class="loading">加载中…</div>';

  let unit;
  try {
    unit = await api.getDayUnit(selectedDate);
  } catch (e) {
    view.innerHTML = '<div class="empty">加载失败</div>';
    return;
  }

  const card = document.createElement('div');
  card.className = 'day-card';

  // 头部：日期 + 记录条数
  const head = document.createElement('div');
  head.className = 'day-head';
  head.innerHTML = `
    <span class="day-date">${esc(fmtDateLabel(selectedDate))}</span>
    <span class="day-meta">${unit.records.length} 条记录</span>
  `;
  card.appendChild(head);

  // 记录区（多条）
  const tags = await loadTags(); // 编辑时用于标签下拉
  if (unit.records.length === 0) {
    card.innerHTML += '<div class="empty">当天没有记录</div>';
  } else {
    for (const r of unit.records) {
      const time = new Date(r.created_at);
      const hh = String(time.getHours()).padStart(2, '0');
      const mm = String(time.getMinutes()).padStart(2, '0');
      const item = document.createElement('div');
      item.className = 'record-item';

      // 默认（只读）展示
      const tagHtml = r.status ? `<span class="tag-badge">${esc(r.status)}</span>` : '';
      const proj = r.project ? `<span class="record-project">#${esc(r.project)}</span>` : '';
      const contentWrap = document.createElement('div');
      contentWrap.className = 'record-content';
      contentWrap.innerHTML = `${tagHtml}${esc(r.content)}${proj}`;

      // 图片附件缩略图
      const imgs = (r.images && r.images.length) ? r.images : [];
      if (imgs.length) {
        const imgRow = document.createElement('div');
        imgRow.className = 'record-images';
        for (const rel of imgs) {
          const img = document.createElement('img');
          img.src = 'dayfold-img://local/' + rel;
          img.className = 'record-thumb';
          img.loading = 'lazy';
          img.onclick = () => {
            const overlay = document.createElement('div');
            overlay.className = 'img-overlay';
            const big = document.createElement('img');
            big.src = img.src;
            overlay.appendChild(big);
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
          };
          imgRow.appendChild(img);
        }
        contentWrap.appendChild(imgRow);
      }

      // 编辑按钮
      const editBtn = document.createElement('button');
      editBtn.className = 'mini-btn';
      editBtn.textContent = '编辑';
      editBtn.onclick = () => startEdit(item, contentWrap, r, tags);

      // 删除按钮
      const delBtn = document.createElement('button');
      delBtn.className = 'mini-btn danger';
      delBtn.textContent = '删除';
      delBtn.onclick = async () => {
        if (!confirm(`删除这条记录？\n「${r.content}」\n此操作不可恢复。`)) return;
        await api.deleteRecord(r.id);
        renderDateNav(); // 刷新日期导航（条数可能变）
        renderDay();     // 刷新当天列表
      };

      // 时间列 + 内容 + 操作按钮（编辑/删除）
      const timeEl = document.createElement('div');
      timeEl.className = 'record-time';
      timeEl.textContent = `${hh}:${mm}`;
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'record-actions';

      item.appendChild(timeEl);
      const bodyCol = document.createElement('div');
      bodyCol.className = 'record-body';
      bodyCol.appendChild(contentWrap);
      bodyCol.appendChild(actionsWrap);
      item.appendChild(bodyCol);

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);

      card.appendChild(item);
    }
  }

  // 总结区（始终显示，含"编辑总结"按钮，手动编写当天总结）
  const sum = document.createElement('div');
  sum.className = 'summary-block';

  const sumHead = document.createElement('div');
  sumHead.className = 'summary-head';

  // 标题 + 保存时间（若有）
  const titleBox = document.createElement('span');
  titleBox.className = 'summary-title';
  titleBox.textContent = '当天总结';
  if (unit.summary && unit.summary.created_at) {
    const d = new Date(unit.summary.created_at);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    titleBox.textContent = `当天总结（更新于 ${ymd} ${hm}）`;
  }
  sumHead.appendChild(titleBox);

  const editBtn = document.createElement('button');
  editBtn.className = 'mini-btn primary';
  editBtn.textContent = unit.summary && unit.summary.content ? '编辑总结' : '写总结';
  editBtn.onclick = () => startEditSummary(sum, unit, editBtn);
  sumHead.appendChild(editBtn);
  sum.appendChild(sumHead);

  const body = document.createElement('div');
  body.className = 'summary-content';
  if (unit.summary && unit.summary.content) {
    body.innerHTML = renderMarkdownLite(unit.summary.content) || '<div class="empty">（总结为空）</div>';
  } else {
    body.innerHTML = '<div class="empty">还没有总结，点击右上角「写总结」。</div>';
  }
  sum.appendChild(body);
  card.appendChild(sum);

  view.innerHTML = '';
  view.appendChild(card);
}

// 进入总结编辑态：把总结区换成 textarea，保存/取消
function startEditSummary(sum, unit, editBtn) {
  const curContent = (unit.summary && unit.summary.content) || '';
  const body = sum.querySelector('.summary-content');
  body.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.className = 'summary-edit';
  ta.value = curContent;
  ta.rows = 8;
  ta.placeholder = '写点今天的工作总结…（支持 markdown）';
  body.appendChild(ta);

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'mini-btn primary';
  saveBtn.textContent = '保存总结';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mini-btn';
  cancelBtn.textContent = '取消';
  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);
  body.appendChild(btnRow);

  const exit = () => renderDay();

  saveBtn.onclick = async () => {
    const content = ta.value.trim();
    if (!content) {
      alert('总结内容不能为空');
      return;
    }
    await api.upsertSummary({ date: selectedDate, content, used_skills: null });
    renderDay();
  };
  cancelBtn.onclick = exit;
  ta.focus();
}

// 极简 markdown 渲染（三栏标题 + 列表）
function renderMarkdownLite(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h4>${esc(line.replace(/^#+\s*/, ''))}</h4>`;
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${esc(line.replace(/^[-*]\s*/, ''))}</li>`;
    } else if (line.trim()) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${esc(line)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

// 加载标签列表，供编辑下拉使用
async function loadTags() {
  try {
    return await api.listTags();
  } catch (e) {
    console.error('加载标签失败:', e);
    return [];
  }
}

// 加载产品分类列表，供编辑下拉使用
async function loadProducts() {
  try {
    return await api.listProducts();
  } catch (e) {
    console.error('加载产品失败:', e);
    return [];
  }
}

function buildTagSelect(current) {
  const select = document.createElement('select');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '无标签';
  select.appendChild(noneOpt);
  (tagsCache || []).forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = t.name;
    if (t.name === current) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

function buildProductSelect(current) {
  const select = document.createElement('select');
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '无产品';
  select.appendChild(noneOpt);
  (productsCache || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === current) opt.selected = true;
    select.appendChild(opt);
  });
  return select;
}

// 进入编辑态：把记录行变成"内容输入框 + 标签下拉 + 产品下拉 + 保存/取消"
async function startEdit(item, contentWrap, record, tags) {
  tagsCache = tags;
  productsCache = await loadProducts();
  const curContent = record.content;
  const curTag = record.status || '';
  const curProduct = record.project || '';

  contentWrap.innerHTML = '';
  const editPanel = document.createElement('div');
  editPanel.className = 'edit-panel';

  const contentInput = document.createElement('input');
  contentInput.type = 'text';
  contentInput.value = curContent;
  contentInput.className = 'edit-input';

  const tagSelect = buildTagSelect(curTag);
  const productSelect = buildProductSelect(curProduct);

  // 标签 / 产品 两个下拉各带小标题，排在一行
  const selectRow = document.createElement('div');
  selectRow.className = 'edit-selects';
  const tagWrap = document.createElement('div');
  tagWrap.className = 'edit-select-group';
  tagWrap.innerHTML = '<span>标签</span>';
  tagWrap.appendChild(tagSelect);
  const prodWrap = document.createElement('div');
  prodWrap.className = 'edit-select-group';
  prodWrap.innerHTML = '<span>产品</span>';
  prodWrap.appendChild(productSelect);
  selectRow.appendChild(tagWrap);
  selectRow.appendChild(prodWrap);

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'mini-btn primary';
  saveBtn.textContent = '保存';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mini-btn';
  cancelBtn.textContent = '取消';

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  editPanel.appendChild(contentInput);
  editPanel.appendChild(selectRow);
  editPanel.appendChild(btnRow);
  contentWrap.appendChild(editPanel);

  const exitEdit = () => renderDay();

  saveBtn.onclick = async () => {
    const newContent = contentInput.value.trim();
    if (!newContent) return;
    const newTag = tagSelect.value || null;
    const newProject = productSelect.value || null;
    await api.updateRecord(record.id, { content: newContent, tag: newTag, project: newProject });
    exitEdit(); // 重新渲染
  };
  cancelBtn.onclick = exitEdit;
}

// —— 周报 —— //

let currentView = 'day'; // 当前视图：day | week
let weeklyCache = { weekKey: '', draft: '' }; // 周报草稿缓存

// 计算本周（周一到周日）的起止日期
function getThisWeek() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

// 把记录按「产品」分组，生成周报草稿（markdown）
function buildWeeklyDraft(records) {
  if (!records || records.length === 0) return '';
  const groups = {};
  const groupsOrder = [];
  for (const r of records) {
    const proj = r.project || '（未分类）';
    if (!groups[proj]) { groups[proj] = []; groupsOrder.push(proj); }
    groups[proj].push(r);
  }
  let md = '';
  for (const proj of groupsOrder) {
    md += `### ${proj}\n`;
    const sorted = groups[proj].slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    let curDate = '';
    for (const r of sorted) {
      const d = r.date || '';
      if (d !== curDate) {
        curDate = d;
        md += `- **${d}**\n`;
      }
      const tag = r.status ? ` [${r.status}]` : '';
      md += `  - ${r.content}${tag}\n`;
    }
  }
  return md;
}

// 渲染周报视图（结构化汇总 + 复制，无 AI）
async function renderWeek() {
  const view = document.getElementById('day-view');
  const { start, end } = getThisWeek();
  const weekKey = `${start}_${end}`;

  if (weeklyCache.weekKey === weekKey && weeklyCache.draft !== '') {
    drawWeekView(view, start, end, weeklyCache.draft);
    return;
  }

  view.innerHTML = `<div class="loading">正在生成本周周报…</div>`;

  let records = [];
  try {
    records = await api.getWeekRecords(start, end);
  } catch (e) {
    view.innerHTML = '<div class="empty">周报加载失败</div>';
    return;
  }

  const draft = buildWeeklyDraft(records);
  weeklyCache = { weekKey, draft };
  drawWeekView(view, start, end, draft);
}

function drawWeekView(view, start, end, draft) {
  const title = `本周周报（${start} ~ ${end}）`;

  const card = document.createElement('div');
  card.className = 'day-card';

  const head = document.createElement('div');
  head.className = 'weekly-head';
  head.innerHTML = `<span class="weekly-title">${esc(title)}</span>`;
  const btnRow = document.createElement('div');
  btnRow.className = 'weekly-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'mini-btn';
  copyBtn.textContent = '复制周报';
  copyBtn.onclick = async () => {
    await api.copyText(draft);
    copyBtn.textContent = '已复制';
    setTimeout(() => { copyBtn.textContent = '复制周报'; }, 1500);
  };

  btnRow.appendChild(copyBtn);
  head.appendChild(btnRow);
  card.appendChild(head);

  const contentBox = document.createElement('div');
  contentBox.className = 'weekly-content';
  if (draft) {
    contentBox.innerHTML = renderMarkdownLite(draft) || '<div class="empty">（空）</div>';
  } else {
    contentBox.innerHTML = '<div class="empty">本周还没有任何记录。用挂件记几条吧。</div>';
  }
  card.appendChild(contentBox);

  view.innerHTML = '';
  view.appendChild(card);
}

// 切换视图
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });
  document.getElementById('date-nav').style.display = (view === 'day') ? 'flex' : 'none';
  if (view === 'week') {
    renderWeek();
  } else {
    renderDay();
  }
}

// 启动
(async function init() {
  document.querySelectorAll('.view-tab').forEach((t) => {
    t.addEventListener('click', () => switchView(t.dataset.view));
  });
  await renderDateNav();
  await renderDay();
})();