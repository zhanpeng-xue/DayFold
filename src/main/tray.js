// 系统托盘：一键唤起主窗口 + 右键菜单（含开机自启动）
const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let tray = null;

function createTray({
  showMain, hideWindow, toggleMain, openManager, openHistory,
  getAutostart, setAutostart, quit,
  getToday,
}) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'tray.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
  }

  tray = new Tray(icon);

  function buildMenu() {
    const autostartOn = !!getAutostart();

    return Menu.buildFromTemplate([
      { label: '显示记录挂件', click: showMain },
      { label: '隐藏挂件', click: hideWindow },
      { type: 'separator' },
      { label: '查看记录 / 历史', click: openHistory },
      { label: '管理标签 / 产品', click: openManager },
      { type: 'separator' },
      {
        label: '开机自启动',
        type: 'checkbox',
        checked: autostartOn,
        click: (item) => {
          setAutostart(item.checked);
          tray.setContextMenu(buildMenu()); // 重建刷新勾选
        },
      },
      { type: 'separator' },
      { label: '退出 Dayfold', click: quit },
    ]);
  }

  tray.setToolTip('Dayfold · 工作日志');
  tray.setContextMenu(buildMenu());
  tray.on('click', toggleMain || showMain); // 左键切换显示/隐藏挂件

  return tray;
}

module.exports = { createTray };