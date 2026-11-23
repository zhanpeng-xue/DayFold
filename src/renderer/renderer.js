// 渲染进程：输入挂件 —— 多行输入 + 选标签 + 粘贴图片，回车即存后自动隐藏
const api = window.dayfold;

let selectedTag = null; // 当前选中的业务阶段标签
let pendingImages = []; // 已粘贴、待随记录保存的图片相对路径
let selectedProduct = null; // 当前选中的产品分类（name 或 null）

// 渲染标签行
async function renderTags() {
  const row = document.getElementById('tag-row');
  row.innerHTML = '';
  let tags = [];
  try {
    tags = await api.listTags();
  } catch (e) {
    console.error('加载标签失败:', e);
    return;
  }
  if (tags.length === 0) return; // 无标签则不显示标签行

  for (const t of tags) {
    const chip = document.createElement('div');
    chip.className = 'tag-chip' + (selectedTag && selectedTag.id === t.id ? ' active' : '');
    chip.textContent = t.name;
    chip.onclick = () => {
      // 再点一次取消选中
      selectedTag = selectedTag && selectedTag.id === t.id ? null : t;
      renderTags();
      document.getElementById('record-input').focus();
    };
    row.appendChild(chip);
  }
}

// 渲染产品分类下拉
async function renderProducts() {
  const select = document.getElementById('product-select');
  const prev = selectedProduct || select.value;
  let products = [];
  try {
    products = await api.listProducts();
  } catch (e) {
    console.error('加载产品失败:', e);
    return;
  }
  const row = document.getElementById('product-row');
  if (products.length === 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';

  select.innerHTML = '<option value="">（未选择）</option>';
  for (const p of products) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === prev) opt.selected = true;
    select.appendChild(opt);
  }
  selectedProduct = prev || null;
}

// 渲染已粘贴图片的缩略图预览
function renderImagePreview() {
  const box = document.getElementById('image-preview');
  box.innerHTML = '';
  if (pendingImages.length === 0) return;
  for (const rel of pendingImages) {
    const img = document.createElement('img');
    img.src = 'dayfold-img://local/' + rel;
    img.className = 'preview-thumb';
    img.title = '点击移除';
    img.onclick = () => {
      pendingImages = pendingImages.filter((x) => x !== rel);
      api.deleteImage(rel); // 同时删除磁盘上的孤儿文件
      renderImagePreview();
    };
    box.appendChild(img);
  }
}

// 清空所有待提交图片（并删除对应磁盘文件），用于取消/下次唤起时清理
async function clearPendingImages() {
  for (const rel of pendingImages) {
    try { await api.deleteImage(rel); } catch (_) {}
  }
  pendingImages = [];
  renderImagePreview();
}

// 处理粘贴：如果是图片，保存并加入待提交列表
async function handlePaste(e) {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) {
    if (it.type && it.type.startsWith('image/')) {
      console.log('[Dayfold] 检测到粘贴图片, type=' + it.type);
      const file = it.getAsFile();
      if (!file) continue;
      const dataURL = await fileToDataURL(file);
      const res = await api.saveImage({ dataURL, mime: it.type });
      console.log('[Dayfold] saveImage 返回:', JSON.stringify(res));
      if (res && res.ok) {
        pendingImages.push(res.path);
        renderImagePreview();
      } else {
        console.error('保存图片失败:', res && res.error);
      }
    }
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// 保存并自动隐藏挂件（携带选中的标签与图片）
async function saveAndClose() {
  const input = document.getElementById('record-input');
  const content = input.value.trim();
  if (!content && pendingImages.length === 0) return; // 空内容不保存、不关闭

  console.log('[Dayfold] 保存记录: content="' + content + '" images=' + JSON.stringify(pendingImages) + ' product=' + (selectedProduct || ''));
  try {
    await api.addRecord({
      content: content || '(图片)',
      tag: selectedTag ? selectedTag.name : null,
      project: selectedProduct || null,
      images: pendingImages.length ? pendingImages : null,
    });
  } catch (e) {
    console.error('保存失败:', e);
    return;
  }

  api.hideWindow();
}

function init() {
  const input = document.getElementById('record-input');
  const productSelect = document.getElementById('product-select');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveAndClose();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearPendingImages(); // 取消时清理已保存的图片文件
      api.hideWindow();
    }
  });
  input.addEventListener('paste', handlePaste);
  productSelect.addEventListener('change', () => {
    selectedProduct = productSelect.value || null;
  });
  // 全局快捷键唤起挂件时，重新聚焦并清空（每次都等于是新记一条）
  api.onShowFocus(() => {
    input.value = '';
    selectedTag = null;
    selectedProduct = null;
    clearPendingImages(); // 清理上一次残留的待提交图片
    renderTags();
    renderProducts();
    input.focus();
  });
  // 挂件失焦收起前，清理待提交图片（避免孤儿文件）
  api.onBlurCleanup(() => {
    clearPendingImages();
  });
  renderTags();
  renderProducts();
  renderImagePreview();
  input.focus();
}

init();