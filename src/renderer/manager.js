// 管理面板：业务阶段标签 + 产品分类（tab 切换）
const api = window.dayfold;

// —— Tab 切换 —— //
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.getElementById('panel-tag').style.display = name === 'tag' ? 'block' : 'none';
  document.getElementById('panel-product').style.display = name === 'product' ? 'block' : 'none';
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

// —— 通用按钮 —— //
function btn(label, onClick, title) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

// 通用重命名：把 nameEl 变成输入框，提交后回调
function startRename(nameEl, currentName, onCommit) {
  nameEl.className = 'tag-name rename';
  const input = document.createElement('input');
  input.value = currentName;
  input.maxLength = 30;
  nameEl.innerHTML = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();

  async function commit() {
    const val = input.value.trim();
    if (val && val !== currentName) {
      await onCommit(val);
    }
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') commit();
  });
  input.addEventListener('blur', commit);
}

// —— 标签 —— //
async function loadTags() {
  const listEl = document.getElementById('tag-list');
  let tags = [];
  try { tags = await api.listTags(); } catch (e) { console.error(e); }

  if (tags.length === 0) {
    listEl.innerHTML = '<li class="empty">还没有标签，在上面添加一个。</li>';
    return;
  }
  listEl.innerHTML = '';
  tags.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'tag-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'tag-name';
    nameEl.textContent = t.name;

    const upBtn = btn('▲', () => api.moveTag(t.id, 'up').then(loadTags), '上移');
    upBtn.disabled = i === 0;
    const downBtn = btn('▼', () => api.moveTag(t.id, 'down').then(loadTags), '下移');
    downBtn.disabled = i === tags.length - 1;
    const renameBtn = btn('改', () => startRename(nameEl, t.name, async (v) => { await api.renameTag(t.id, v); loadTags(); }), '重命名');
    const delBtn = btn('删', async () => {
      if (confirm(`删除标签「${t.name}」？已用此标签的历史记录不受影响。`)) {
        await api.deleteTag(t.id);
        loadTags();
      }
    }, '删除');
    delBtn.className += ' danger';

    li.appendChild(nameEl);
    li.appendChild(upBtn);
    li.appendChild(downBtn);
    li.appendChild(renameBtn);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

async function addTag() {
  const input = document.getElementById('new-tag');
  const val = input.value.trim();
  if (!val) return;
  try {
    await api.addTag(val);
    input.value = '';
    loadTags();
  } catch (e) {
    alert('添加失败：' + (e.message || '可能已存在同名标签'));
  }
}

// —— 产品分类 —— //
async function loadProducts() {
  const listEl = document.getElementById('product-list');
  let products = [];
  try { products = await api.listProducts(); } catch (e) { console.error(e); }

  if (products.length === 0) {
    listEl.innerHTML = '<li class="empty">还没有产品分类，在上面添加一个。</li>';
    return;
  }
  listEl.innerHTML = '';
  products.forEach((p) => {
    const li = document.createElement('li');
    li.className = 'tag-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'tag-name';
    nameEl.textContent = p.name;

    const renameBtn = btn('改', () => startRename(nameEl, p.name, async (v) => { await api.renameProduct(p.id, v); loadProducts(); }), '重命名');
    const delBtn = btn('删', async () => {
      if (confirm(`删除产品「${p.name}」？已用此产品的历史记录不受影响。`)) {
        await api.deleteProduct(p.id);
        loadProducts();
      }
    }, '删除');
    delBtn.className += ' danger';

    li.appendChild(nameEl);
    li.appendChild(renameBtn);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

async function addProduct() {
  const input = document.getElementById('new-product');
  const val = input.value.trim();
  if (!val) return;
  try {
    await api.addProduct(val);
    input.value = '';
    loadProducts();
  } catch (e) {
    alert('添加失败：' + (e.message || '可能已存在同名产品'));
  }
}

// —— 事件绑定 —— //
document.getElementById('add-btn').addEventListener('click', addTag);
document.getElementById('new-tag').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
});
document.getElementById('add-product-btn').addEventListener('click', addProduct);
document.getElementById('new-product').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addProduct(); }
});

// —— 初始化 —— //
loadTags();
loadProducts();