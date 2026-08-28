/* ============================================================
 * nsos - builtin-apps.js (P5 · 全功能应用矩阵)
 * 内置应用 manifest 注册：全部图标清单 + 真实应用挂载。
 *   settings / terminal  复用现有 Web Component
 *   clock                现代化时钟（世界时钟/秒表/计时器）
 *   calculator           全功能计算器
 *   weather              天气（模拟数据 + 精美 UI）
 *   notes                备忘录（localStorage CRUD）
 *   browser              简易浏览器
 *   music                音乐播放器（模拟）
 *   photos               相册（网格画廊）
 *   phone / messages     Dock 应用（现代化 UI）
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  /* ============================================================
   * 真实应用 1：设置（全功能现代化 · 多层级设置中心）
   * ============================================================ */
  OS.apps.register({
    id: 'settings',
    name: '设置',
    icon: 'settings',
    cls: 'ic-red',
    version: '2.0.0',
    description: '系统设置中心',
    mount(host) {
      let currentSection = 'main';
      let brightness = parseInt(OS.storage.get('cc:brightness', '100'), 10);
      let volume = parseInt(OS.storage.get('cc:volume', '60'), 10);
      let theme = OS.storage.get('cc:dark', true) ? 'dark' : 'light';
      let wallpaperIdx = parseInt(OS.storage.get('wallpaper', '0'), 10);

      const wallpapers = [
        { name: '深空', css: 'radial-gradient(ellipse at 30% 20%, #1a2a5e, #050608 70%)' },
        { name: '琥珀之夜', css: 'radial-gradient(ellipse at 50% 40%, #2a1a08, #050608 70%)' },
        { name: '极光', css: 'linear-gradient(180deg, #0a0e2e, #1a4a3e, #0a0e2e)' },
        { name: '暮光', css: 'linear-gradient(180deg, #1a0830, #2a1050, #050608)' },
        { name: '深海', css: 'radial-gradient(ellipse at 60% 60%, #0a2a4e, #050608 70%)' },
        { name: '紫罗兰', css: 'linear-gradient(135deg, #1a0b3e, #3b1466, #0a0210)' },
        { name: '日出', css: 'linear-gradient(180deg, #1a0820, #4a1a3e, #8a3a1a, #1a0820)' },
        { name: '薄荷', css: 'linear-gradient(135deg, #0a2e2a, #1a5e4e, #0a1e18)' },
        { name: '银河', css: 'radial-gradient(ellipse at 40% 30%, #2a1a5e 0%, #1a0a3e 40%, #050608 80%), radial-gradient(ellipse at 70% 70%, #5e1a3e 0%, transparent 50%)' },
        { name: '星空', css: 'radial-gradient(ellipse at 20% 50%, #0a1a3e 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #1a0a3e 0%, transparent 50%), linear-gradient(180deg, #050608, #0a0e1e)' },
        { name: '日落', css: 'linear-gradient(180deg, #1a0820 0%, #4a2010 25%, #8a4a20 50%, #4a2010 75%, #1a0820 100%)' },
        { name: '霓虹', css: 'linear-gradient(135deg, #0a0a2e, #2a0a4e, #4a0a3e, #0a0a2e)' },
      ];

      const renderMain = () => {
        const d = (OS.device && OS.device.info) || {};
        const v = OS.version || {};
        const verTxt = (v.major != null) ? 'b' + v.major + '.' + v.minor + '.' + v.build : '—';
        const wallpaperName = wallpapers[wallpaperIdx] ? wallpapers[wallpaperIdx].name : '深空';

        host.innerHTML = `
          <div class="app-settings">
            <div class="st-hero">
              <div class="st-hero-icon"><os-icon name="settings" size="28"></os-icon></div>
              <div class="st-hero-info">
                <div class="st-hero-name">nsos</div>
                <div class="st-hero-ver">${verTxt}</div>
              </div>
            </div>
            <div class="st-section">
              <div class="st-row-item" data-sec="display">
                <div class="st-row-ic ic-blue"><os-icon name="brightness" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">显示与亮度</span><span class="st-row-val">${theme === 'dark' ? '深色' : '浅色'}</span></div>
              </div>
              <div class="st-row-item" data-sec="sound">
                <div class="st-row-ic ic-purple"><os-icon name="volume" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">声音与触感</span><span class="st-row-val">音量 ${volume}</span></div>
              </div>
              <div class="st-row-item" data-sec="wallpaper">
                <div class="st-row-ic ic-cyan"><os-icon name="photos" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">壁纸</span><span class="st-row-val">${wallpaperName}</span></div>
              </div>
            </div>
            <div class="st-section">
              <div class="st-row-item" data-sec="wifi">
                <div class="st-row-ic ic-blue"><os-icon name="wifi" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">Wi-Fi</span><span class="st-row-val">${OS.storage.get('cc:wifi', true) ? '已连接' : '关闭'}</span></div>
              </div>
              <div class="st-row-item" data-sec="bluetooth">
                <div class="st-row-ic ic-blue"><os-icon name="bluetooth" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">蓝牙</span><span class="st-row-val">${OS.storage.get('cc:bluetooth', false) ? '已开启' : '关闭'}</span></div>
              </div>
            </div>
            <div class="st-section">
              <div class="st-row-item" data-sec="general">
                <div class="st-row-ic ic-orange"><os-icon name="settings" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">通用</span><span class="st-row-val">关于本机 · 更新</span></div>
              </div>
            </div>
            <div class="st-section">
              <div class="st-row-item" data-sec="battery">
                <div class="st-row-ic ic-green"><os-icon name="battery" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">电池</span><span class="st-row-val">${d.battery || '—'}</span></div>
              </div>
              <div class="st-row-item" data-sec="storage">
                <div class="st-row-ic ic-red"><os-icon name="save" size="16"></os-icon></div>
                <div class="st-row-body"><span class="st-row-label">存储空间</span><span class="st-row-val">${d.storage || '—'}</span></div>
              </div>
            </div>
          </div>`;

        host.querySelectorAll('.st-row-item').forEach(item => {
          item.addEventListener('click', () => {
            currentSection = item.dataset.sec;
            renderSection();
          });
        });
      };

      const renderSection = () => {
        let html = '';
        const backBtn = `<div class="st-section-header"><button class="st-back-btn" id="st-back">‹ 设置</button><span class="st-section-title">${getSectionTitle(currentSection)}</span></div>`;

        switch (currentSection) {
          case 'display':
            html = backBtn + renderDisplaySection();
            break;
          case 'sound':
            html = backBtn + renderSoundSection();
            break;
          case 'wallpaper':
            html = backBtn + renderWallpaperSection();
            break;
          case 'wifi':
            html = backBtn + renderWifiSection();
            break;
          case 'bluetooth':
            html = backBtn + renderBluetoothSection();
            break;
          case 'general':
            html = backBtn + renderGeneralSection();
            break;
          case 'battery':
            html = backBtn + renderBatterySection();
            break;
          case 'storage':
            html = backBtn + renderStorageSection();
            break;
          default:
            renderMain();
            return;
        }
        host.innerHTML = html;
        bindSectionEvents();
      };

      const getSectionTitle = (sec) => {
        const titles = { display: '显示与亮度', sound: '声音与触感', wallpaper: '壁纸', wifi: 'Wi-Fi', bluetooth: '蓝牙', general: '通用', battery: '电池', storage: '存储空间' };
        return titles[sec] || '';
      };

      const renderDisplaySection = () => {
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-card-title">外观</div>
              <div class="st-theme-row">
                <button class="st-theme-opt ${theme === 'dark' ? 'active' : ''}" data-theme="dark">
                  <div class="st-theme-preview dark-preview"></div>
                  <span>深色</span>
                </button>
                <button class="st-theme-opt ${theme === 'light' ? 'active' : ''}" data-theme="light">
                  <div class="st-theme-preview light-preview"></div>
                  <span>浅色</span>
                </button>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">亮度</div>
              <div class="st-slider-row">
                <os-icon name="brightness" size="18"></os-icon>
                <input type="range" class="st-slider" id="st-brightness" min="20" max="100" value="${brightness}">
                <os-icon name="brightness" size="24"></os-icon>
              </div>
              <div class="st-toggle-row">
                <span>自动亮度</span>
                <os-switch data-key="settings:autobrightness" ${OS.storage.get('settings:autobrightness', false) ? 'checked' : ''}></os-switch>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">文字大小</div>
              <div class="st-slider-row">
                <span style="font-size:12px">A</span>
                <input type="range" class="st-slider" id="st-textsize" min="80" max="120" value="100">
                <span style="font-size:20px">A</span>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">状态栏</div>
              <div class="st-toggle-row">
                <span>显示电池百分比</span>
                <os-switch data-key="settings:batpct" ${OS.storage.get('settings:batpct', true) ? 'checked' : ''}></os-switch>
              </div>
              <div class="st-toggle-row">
                <span>显示秒数</span>
                <os-switch data-key="settings:showsec" ${OS.storage.get('settings:showsec', false) ? 'checked' : ''}></os-switch>
              </div>
            </div>
          </div>`;
      };

      const renderSoundSection = () => {
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-card-title">音量</div>
              <div class="st-slider-row">
                <os-icon name="volume" size="18"></os-icon>
                <input type="range" class="st-slider" id="st-volume" min="0" max="100" value="${volume}">
                <os-icon name="volume" size="24"></os-icon>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">铃声与提醒</div>
              <div class="st-toggle-row">
                <span>静音模式</span>
                <os-switch data-key="cc:mute" ${OS.storage.get('cc:mute', false) ? 'checked' : ''}></os-switch>
              </div>
              <div class="st-toggle-row">
                <span>免打扰</span>
                <os-switch data-key="cc:doze" ${OS.storage.get('cc:doze', false) ? 'checked' : ''}></os-switch>
              </div>
            </div>
          </div>`;
      };

      const renderWallpaperSection = () => {
        return `
          <div class="app-settings">
            <div class="st-wallpaper-grid">
              ${wallpapers.map((w, i) => `
                <div class="st-wp-item ${i === wallpaperIdx ? 'active' : ''}" data-idx="${i}">
                  <div class="st-wp-preview" style="background:${w.css}"></div>
                  <span class="st-wp-name">${w.name}</span>
                </div>
              `).join('')}
            </div>
          </div>`;
      };

      const renderWifiSection = () => {
        const on = OS.storage.get('cc:wifi', true);
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-toggle-row">
                <span>Wi-Fi</span>
                <os-switch data-key="cc:wifi" ${on ? 'checked' : ''}></os-switch>
              </div>
            </div>
            ${on ? `
            <div class="st-card">
              <div class="st-card-title">可用网络</div>
              <div class="st-net-item">
                <div class="st-net-info"><span class="st-net-name">nsos-5G</span><span class="st-net-sec">🔒 WPA2</span></div>
                <span class="st-net-signal">●●●●</span>
              </div>
              <div class="st-net-item">
                <div class="st-net-info"><span class="st-net-name">Guest-Network</span><span class="st-net-sec">🔓 开放</span></div>
                <span class="st-net-signal">●●●○</span>
              </div>
              <div class="st-net-item">
                <div class="st-net-info"><span class="st-net-name">Office_5F</span><span class="st-net-sec">🔒 WPA2</span></div>
                <span class="st-net-signal">●●○○</span>
              </div>
            </div>` : '<div class="st-empty-hint">Wi-Fi 已关闭</div>'}
          </div>`;
      };

      const renderBluetoothSection = () => {
        const on = OS.storage.get('cc:bluetooth', false);
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-toggle-row">
                <span>蓝牙</span>
                <os-switch data-key="cc:bluetooth" ${on ? 'checked' : ''}></os-switch>
              </div>
            </div>
            ${on ? `
            <div class="st-card">
              <div class="st-card-title">我的设备</div>
              <div class="st-bt-item"><div class="st-bt-ic"><os-icon name="bluetooth" size="18"></os-icon></div><div class="st-bt-info"><span>AirPods Pro</span><span class="st-bt-state">已连接</span></div></div>
              <div class="st-bt-item"><div class="st-bt-ic"><os-icon name="bluetooth" size="18"></os-icon></div><div class="st-bt-info"><span>Watch S9</span><span class="st-bt-state">已配对</span></div></div>
            </div>` : '<div class="st-empty-hint">蓝牙已关闭</div>'}
          </div>`;
      };

      const renderGeneralSection = () => {
        const d = (OS.device && OS.device.info) || {};
        const v = OS.version || {};
        const verTxt = (v.major != null) ? 'b' + v.major + '.' + v.minor + '.' + v.build : '—';
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-card-title">关于本机</div>
              <div class="st-info-row"><span>系统版本</span><b>${verTxt} "${v.codename || ''}"</b></div>
              <div class="st-info-row"><span>型号</span><b>${d.model || '—'}</b></div>
              <div class="st-info-row"><span>平台</span><b>${d.platform || '—'}</b></div>
              <div class="st-info-row"><span>CPU 核心</span><b>${d.cores || '—'}</b></div>
              <div class="st-info-row"><span>内存</span><b>${d.memory || '—'}</b></div>
              <div class="st-info-row"><span>屏幕</span><b>${d.screen || '—'}</b></div>
              <div class="st-info-row"><span>语言</span><b>${d.language || '—'}</b></div>
            </div>
            <div class="st-card">
              <div class="st-card-title">系统更新</div>
              <div class="st-info-row"><span>当前版本</span><b>${verTxt} "${v.codename || ''}"</b></div>
              <div id="st-ota-status" class="st-ota-status">
                <span class="st-ota-state">点击检查更新</span>
              </div>
              <button class="st-action-btn" id="st-check-update">检查更新</button>
              <div id="st-ota-list" class="st-ota-list" style="display:none"></div>
            </div>
            <div class="st-card">
              <div class="st-toggle-row">
                <span>飞行模式</span>
                <os-switch data-key="cc:airplane" ${OS.storage.get('cc:airplane', false) ? 'checked' : ''}></os-switch>
              </div>
              <div class="st-toggle-row">
                <span>省电模式</span>
                <os-switch data-key="cc:save" ${OS.storage.get('cc:save', false) ? 'checked' : ''}></os-switch>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">自动锁屏</div>
              <div class="st-autolock-options">
                ${[
                  { val: 15, label: '15 秒' },
                  { val: 30, label: '30 秒' },
                  { val: 60, label: '1 分钟' },
                  { val: 120, label: '2 分钟' },
                  { val: 300, label: '5 分钟' },
                  { val: 0, label: '永不' },
                ].map(opt => `
                  <div class="st-autolock-opt ${OS.storage.get('settings:autolock', 60) === opt.val ? 'active' : ''}" data-val="${opt.val}">
                    <span>${opt.label}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>`;
      };

      const renderBatterySection = () => {
        const d = (OS.device && OS.device.info) || {};
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-card-title">电池状态</div>
              <div class="st-battery-display">
                <div class="st-bat-icon">${d.battery || '—'}</div>
                <div class="st-bat-info">
                  <span class="st-bat-val">${d.battery || '—'}</span>
                  <span class="st-bat-state">${d.charging || '未充电'}</span>
                </div>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">省电模式</div>
              <div class="st-toggle-row">
                <span>低电量模式</span>
                <os-switch data-key="cc:save" ${OS.storage.get('cc:save', false) ? 'checked' : ''}></os-switch>
              </div>
              <div class="st-hint-text">开启后将降低性能以延长续航</div>
            </div>
          </div>`;
      };

      const renderStorageSection = () => {
        const d = (OS.device && OS.device.info) || {};
        return `
          <div class="app-settings">
            <div class="st-card">
              <div class="st-card-title">存储</div>
              <div class="st-storage-bar">
                <div class="st-storage-used" style="width:38%"></div>
              </div>
              <div class="st-storage-info">
                <span>已用 38%</span>
                <span>${d.storage || '—'}</span>
              </div>
            </div>
            <div class="st-card">
              <div class="st-card-title">占用空间</div>
              <div class="st-storage-item"><span><os-icon name="settings" size="14"></os-icon> 系统</span><b>2.4 GB</b></div>
              <div class="st-storage-item"><span><os-icon name="apps" size="14"></os-icon> 应用</span><b>1.8 GB</b></div>
              <div class="st-storage-item"><span><os-icon name="photos" size="14"></os-icon> 媒体</span><b>3.2 GB</b></div>
              <div class="st-storage-item"><span><os-icon name="save" size="14"></os-icon> 缓存</span><b>0.6 GB</b></div>
            </div>
          </div>`;
      };

      const bindSectionEvents = () => {
        const back = host.querySelector('#st-back');
        if (back) back.addEventListener('click', () => { currentSection = 'main'; renderMain(); });

        // Theme buttons
        host.querySelectorAll('.st-theme-opt').forEach(btn => {
          btn.addEventListener('click', () => {
            theme = btn.dataset.theme;
            const isDark = theme === 'dark';
            OS.storage.set('cc:dark', isDark);
            const root = document.getElementById('os-root');
            if (root) root.classList.toggle('os-theme-light', !isDark);
            renderSection();
          });
        });

        // Brightness slider
        const brightSlider = host.querySelector('#st-brightness');
        if (brightSlider) {
          brightSlider.addEventListener('input', () => {
            brightness = parseInt(brightSlider.value, 10);
            OS.storage.set('cc:brightness', brightness);
            const root = document.getElementById('os-root');
            if (root) root.style.filter = `brightness(${brightness}%)`;
          });
        }

        // Volume slider
        const volSlider = host.querySelector('#st-volume');
        if (volSlider) {
          volSlider.addEventListener('input', () => {
            volume = parseInt(volSlider.value, 10);
            OS.storage.set('cc:volume', volume);
          });
        }

        // Wallpaper selection
        host.querySelectorAll('.st-wp-item').forEach(item => {
          item.addEventListener('click', () => {
            wallpaperIdx = parseInt(item.dataset.idx, 10);
            OS.storage.set('wallpaper', wallpaperIdx);
            const wp = wallpapers[wallpaperIdx];
            const home = document.querySelector('#layer-home .launcher');
            if (home) home.style.background = wp.css;
            host.querySelectorAll('.st-wp-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            if (OS.ui && OS.ui.toast) OS.ui.toast('壁纸已更换', { ms: 800 });
          });
        });

        // Check update button - 真正从线上 ota/manifest.json 获取
        const checkBtn = host.querySelector('#st-check-update');
        const otaStatus = host.querySelector('#st-ota-status');
        const otaList = host.querySelector('#st-ota-list');
        if (checkBtn) {
          checkBtn.addEventListener('click', async () => {
            checkBtn.textContent = '检查中…';
            checkBtn.disabled = true;
            if (otaStatus) {
              otaStatus.innerHTML = '<span class="st-ota-state st-ota-checking">正在连接更新服务器…</span>';
            }
            try {
              const ota = OS.ota && OS.ota.local;
              if (!ota) throw new Error('OTA 模块未就绪');
              const result = await ota.fetchLatest();
              const all = result.all || [];
              const newer = result.newer || [];
              const cur = OS.version;
              const curVer = 'b' + cur.major + '.' + cur.minor + '.' + cur.build;

              if (otaStatus) {
                if (newer.length > 0) {
                  otaStatus.innerHTML = `<span class="st-ota-state st-ota-new">发现 ${newer.length} 个更新可用</span>`;
                } else if (all.length > 0) {
                  otaStatus.innerHTML = `<span class="st-ota-state st-ota-ok">已是最新版本</span>`;
                } else {
                  otaStatus.innerHTML = `<span class="st-ota-state">暂无更新包</span>`;
                }
              }

              if (otaList && all.length > 0) {
                otaList.style.display = 'block';
                otaList.innerHTML = all.map(pkg => {
                  const pv = ota.parseVer(pkg.name);
                  const isNewer = pv && ota.cmpVer(pv, cur) > 0;
                  const isCurrent = pv && ota.cmpVer(pv, cur) === 0;
                  const versionLabel = pkg.version || (pv ? pv.major + '.' + pv.minor + '.' + pv.build : '?');
                  const codename = pkg.codename ? ` "${pkg.codename}"` : '';
                  const badge = isNewer ? '<span class="st-ota-badge new">可更新</span>' :
                                isCurrent ? '<span class="st-ota-badge current">当前版本</span>' :
                                '<span class="st-ota-badge old">历史版本</span>';
                  const changelogHtml = (pkg.changelog && pkg.changelog.length)
                    ? `<div class="st-ota-changelog">
                         <div class="st-ota-cl-title">更新内容：</div>
                         <ul>${pkg.changelog.slice(0, 6).map(c => `<li>${c}</li>`).join('')}
                             ${pkg.changelog.length > 6 ? `<li class="st-ota-cl-more">…等 ${pkg.changelog.length} 项更新</li>` : ''}
                         </ul>
                       </div>`
                    : '';
                  return `
                    <div class="st-ota-item ${isNewer ? 'is-newer' : ''} ${isCurrent ? 'is-current' : ''}">
                      <div class="st-ota-header">
                        <div class="st-ota-ver">
                          <b>v${versionLabel}</b>${codename}
                          ${badge}
                        </div>
                        <div class="st-ota-meta">
                          <span>${pkg.size_text || pkg.size ? (pkg.size_text || (Math.round(pkg.size / 1024) + ' KB')) : '—'}</span>
                          <span>${pkg.released || '—'}</span>
                        </div>
                      </div>
                      ${changelogHtml}
                      <div class="st-ota-actions">
                        <button class="st-ota-install-btn" data-pkg="${pkg.name}" ${isCurrent ? 'disabled' : ''}>
                          ${isCurrent ? '当前版本' : (isNewer ? '下载并安装' : '安装此版本')}
                        </button>
                      </div>
                    </div>`;
                }).join('');

                // 绑定安装按钮
                otaList.querySelectorAll('.st-ota-install-btn').forEach(btn => {
                  btn.addEventListener('click', () => {
                    const pkgName = btn.dataset.pkg;
                    const base = ota.getSourceBase ? ota.getSourceBase() : 'ota/';
                    const url = base + pkgName + '?t=' + Date.now();
                    _installOta(url, pkgName, btn, otaStatus);
                  });
                });
              } else if (otaList) {
                otaList.style.display = 'none';
              }
            } catch (err) {
              if (otaStatus) {
                otaStatus.innerHTML = `<span class="st-ota-state st-ota-err">检查失败：${err.message || err}</span>`;
              }
              if (OS.ui && OS.ui.toast) OS.ui.toast('检查更新失败', { ms: 2000 });
            } finally {
              checkBtn.textContent = '重新检查';
              checkBtn.disabled = false;
            }
          });
        }

        // 安装 OTA 更新包
        function _installOta(url, pkgName, btn, statusEl) {
          const ota = OS.ota && OS.ota.local;
          if (!ota) return;
          btn.disabled = true;
          btn.textContent = '下载中…';
          if (statusEl) {
            statusEl.innerHTML = '<span class="st-ota-state st-ota-checking">正在下载更新包…</span>';
          }
          ota.applyFromUrl(url).then((r) => {
            btn.textContent = '安装完成';
            if (statusEl) {
              statusEl.innerHTML = `<span class="st-ota-state st-ota-ok">✓ ${r.ver} 安装成功，共 ${r.fileCount} 个文件</span>`;
            }
            if (OS.ui && OS.ui.toast) OS.ui.toast('更新成功，刷新页面生效', { ms: 3000 });
            if (OS.notify) {
              OS.notify.post({ icon: 'update', title: '系统更新完成', text: r.ver + ' 已安装，刷新页面以应用更新', app: 'settings' });
            }
            // 3 秒后提示刷新
            setTimeout(() => {
              if (confirm('更新已安装完成。是否立即刷新页面以应用更新？')) {
                location.reload();
              }
            }, 1500);
          }).catch((err) => {
            btn.disabled = false;
            btn.textContent = '重试';
            if (statusEl) {
              statusEl.innerHTML = `<span class="st-ota-state st-ota-err">安装失败：${err.message || err}</span>`;
            }
            if (OS.ui && OS.ui.toast) OS.ui.toast('更新失败：' + (err.message || err), { ms: 3000 });
          });
        }

        // os-switch toggles
        host.querySelectorAll('os-switch').forEach(sw => {
          sw.addEventListener('change', () => {
            const key = sw.dataset.key;
            if (key) OS.storage.set(key, sw.checked);
            if (key === 'cc:wifi' || key === 'cc:bluetooth') {
              setTimeout(() => renderSection(), 100);
            }
            // 状态栏设置变更 -> 立即刷新
            if (key === 'settings:batpct' || key === 'settings:showsec') {
              if (OS.statusbar) {
                OS.statusbar._tick();
                OS.statusbar._updateBattery();
              }
            }
          });
        });

        // Auto-lock options
        host.querySelectorAll('.st-autolock-opt').forEach(opt => {
          opt.addEventListener('click', () => {
            const val = parseInt(opt.dataset.val, 10);
            OS.storage.set('settings:autolock', val);
            if (OS.autoLock) OS.autoLock.setTimeout(val);
            host.querySelectorAll('.st-autolock-opt').forEach(el => el.classList.remove('active'));
            opt.classList.add('active');
            if (OS.ui && OS.ui.toast) OS.ui.toast(val === 0 ? '自动锁屏已关闭' : `已设为${val < 60 ? val + ' 秒' : (val / 60) + ' 分钟'}`, { ms: 1000 });
          });
        });
      };

      // Apply wallpaper on mount
      const wp = wallpapers[wallpaperIdx];
      if (wp) {
        const home = document.querySelector('#layer-home .launcher');
        if (home) home.style.background = wp.css;
      }

      renderMain();
      return () => {};
    },
  });

  /* ============================================================
   * 真实应用 2：终端（复用 os-terminal Web Component）
   * ============================================================ */
  OS.apps.register({
    id: 'terminal',
    name: '终端',
    icon: 'terminal',
    cls: 'ic-green',
    version: '1.0.0',
    description: 'nsos 统一命令引擎',
    mount(host) {
      const el = document.createElement('os-terminal');
      host.appendChild(el);
      setTimeout(() => { try { el.focus(); } catch (e) { /* noop */ } }, 60);
      return () => { el.remove(); };
    },
  });

  /* ============================================================
   * 真实应用 3：时钟（现代化 · 世界时钟 / 秒表 / 计时器）
   * ============================================================ */
  OS.apps.register({
    id: 'clock',
    name: '时钟',
    icon: 'clock',
    cls: 'ic-green',
    version: '2.0.0',
    description: '世界时钟 / 秒表 / 计时器',
    mount(host) {
      const pad = n => String(n).padStart(2, '0');
      host.innerHTML = `
        <div class="app-clock">
          <div class="ck-tabs">
            <button class="ck-tab active" data-tab="clock">时钟</button>
            <button class="ck-tab" data-tab="stopwatch">秒表</button>
            <button class="ck-tab" data-tab="timer">计时器</button>
          </div>
          <div class="ck-panels">
            <div class="ck-panel active" data-panel="clock">
              <div class="ck-time">--:--</div>
              <div class="ck-date">----</div>
              <div class="ck-world">
                <div class="ck-wc-item"><span class="ck-wc-city">东京</span><span class="ck-wc-time" data-tz="9">--:--</span></div>
                <div class="ck-wc-item"><span class="ck-wc-city">伦敦</span><span class="ck-wc-time" data-tz="0">--:--</span></div>
                <div class="ck-wc-item"><span class="ck-wc-city">纽约</span><span class="ck-wc-time" data-tz="-5">--:--</span></div>
                <div class="ck-wc-item"><span class="ck-wc-city">迪拜</span><span class="ck-wc-time" data-tz="4">--:--</span></div>
              </div>
            </div>
            <div class="ck-panel" data-panel="stopwatch">
              <div class="ck-sw-display">00:00.<span class="ck-sw-ms">00</span></div>
              <div class="ck-sw-controls">
                <button class="ck-btn ck-btn-primary" id="ck-sw-start">开始</button>
                <button class="ck-btn ck-btn-secondary" id="ck-sw-lap">计圈</button>
                <button class="ck-btn ck-btn-danger" id="ck-sw-reset">重置</button>
              </div>
              <div class="ck-sw-laps"></div>
            </div>
            <div class="ck-panel" data-panel="timer">
              <div class="ck-tm-display">00:10:00</div>
              <div class="ck-tm-presets">
                <button class="ck-tm-preset" data-secs="60">1分钟</button>
                <button class="ck-tm-preset" data-secs="300">5分钟</button>
                <button class="ck-tm-preset" data-secs="600">10分钟</button>
                <button class="ck-tm-preset" data-secs="1800">30分钟</button>
              </div>
              <div class="ck-tm-controls">
                <button class="ck-btn ck-btn-primary" id="ck-tm-start">开始</button>
                <button class="ck-btn ck-btn-danger" id="ck-tm-reset">重置</button>
              </div>
            </div>
          </div>
        </div>`;

      const root = host.querySelector('.app-clock');

      // Tab switching
      root.querySelectorAll('.ck-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.tab;
          root.querySelectorAll('.ck-tab').forEach(t => t.classList.toggle('active', t === tab));
          root.querySelectorAll('.ck-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
        });
      });

      // Clock tab
      const tEl = host.querySelector('.ck-time');
      const dEl = host.querySelector('.ck-date');
      const wcEls = host.querySelectorAll('.ck-wc-time');
      const tickClock = () => {
        const now = new Date();
        tEl.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
        dEl.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日 ' + ['日','一','二','三','四','五','六'][now.getDay()];
        wcEls.forEach(el => {
          const tz = parseInt(el.dataset.tz, 10);
          const utc = now.getTime() + now.getTimezoneOffset() * 60000;
          const local = new Date(utc + tz * 3600000);
          el.textContent = pad(local.getHours()) + ':' + pad(local.getMinutes());
        });
      };
      tickClock();
      const clockIv = setInterval(tickClock, 1000);

      // Stopwatch
      let swRunning = false, swStart = 0, swElapsed = 0, swIv = null, lapCount = 0;
      const swDisplay = host.querySelector('.ck-sw-display');
      const swMs = host.querySelector('.ck-sw-ms');
      const swLaps = host.querySelector('.ck-sw-laps');

      const fmtSw = (ms) => {
        const totalSec = Math.floor(ms / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const cs = Math.floor((ms % 1000) / 10);
        return { main: pad(m) + ':' + pad(s), ms: pad(cs) };
      };

      const swStartBtn = host.querySelector('#ck-sw-start');
      const swLapBtn = host.querySelector('#ck-sw-lap');
      const swResetBtn = host.querySelector('#ck-sw-reset');

      swStartBtn.addEventListener('click', () => {
        if (!swRunning) {
          swRunning = true;
          swStart = Date.now() - swElapsed;
          swStartBtn.textContent = '暂停';
          swIv = setInterval(() => {
            swElapsed = Date.now() - swStart;
            const f = fmtSw(swElapsed);
            swDisplay.firstChild.textContent = f.main + '.';
            swMs.textContent = f.ms;
          }, 30);
        } else {
          swRunning = false;
          clearInterval(swIv);
          swStartBtn.textContent = '继续';
        }
      });

      swLapBtn.addEventListener('click', () => {
        if (swElapsed === 0) return;
        lapCount++;
        const f = fmtSw(swElapsed);
        const lap = document.createElement('div');
        lap.className = 'ck-sw-lap';
        lap.innerHTML = '<span class="ck-sw-lap-n">计圈 ' + lapCount + '</span><span class="ck-sw-lap-t">' + f.main + '.' + f.ms + '</span>';
        swLaps.prepend(lap);
      });

      swResetBtn.addEventListener('click', () => {
        swRunning = false;
        clearInterval(swIv);
        swElapsed = 0; lapCount = 0;
        swDisplay.firstChild.textContent = '00:00.';
        swMs.textContent = '00';
        swStartBtn.textContent = '开始';
        swLaps.innerHTML = '';
      });

      // Timer
      let tmRunning = false, tmRemaining = 600, tmIv = null;
      const tmDisplay = host.querySelector('.ck-tm-display');
      const tmStartBtn = host.querySelector('#ck-tm-start');
      const tmResetBtn = host.querySelector('#ck-tm-reset');

      const fmtTm = (secs) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return pad(h) + ':' + pad(m) + ':' + pad(s);
      };

      host.querySelectorAll('.ck-tm-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          tmRemaining = parseInt(btn.dataset.secs, 10);
          tmDisplay.textContent = fmtTm(tmRemaining);
        });
      });

      tmStartBtn.addEventListener('click', () => {
        if (!tmRunning && tmRemaining > 0) {
          tmRunning = true;
          tmStartBtn.textContent = '暂停';
          tmIv = setInterval(() => {
            tmRemaining--;
            tmDisplay.textContent = fmtTm(tmRemaining);
            if (tmRemaining <= 0) {
              clearInterval(tmIv);
              tmRunning = false;
              tmStartBtn.textContent = '开始';
              tmDisplay.classList.add('ck-tm-done');
              setTimeout(() => tmDisplay.classList.remove('ck-tm-done'), 2000);
              if (OS.notify) OS.notify.post({ icon: 'bell', title: '计时器结束', text: '您的计时器已完成', app: 'clock' });
            }
          }, 1000);
        } else {
          tmRunning = false;
          clearInterval(tmIv);
          tmStartBtn.textContent = '继续';
        }
      });

      tmResetBtn.addEventListener('click', () => {
        tmRunning = false;
        clearInterval(tmIv);
        tmRemaining = 600;
        tmDisplay.textContent = fmtTm(tmRemaining);
        tmStartBtn.textContent = '开始';
      });

      return () => {
        clearInterval(clockIv);
        clearInterval(swIv);
        clearInterval(tmIv);
      };
    },
  });

  /* ============================================================
   * 真实应用 4：计算器（Apple 风格 · 全功能）
   * ============================================================ */
  OS.apps.register({
    id: 'calculator',
    name: '计算器',
    icon: 'calculator',
    cls: 'ic-orange',
    version: '1.0.0',
    description: '全功能计算器',
    mount(host) {
      host.innerHTML = `
        <div class="app-calc">
          <div class="calc-display">
            <div class="calc-prev"></div>
            <div class="calc-current">0</div>
          </div>
          <div class="calc-grid">
            <button class="ck-key ck-fn" data-action="clear">AC</button>
            <button class="ck-key ck-fn" data-action="sign">+/−</button>
            <button class="ck-key ck-fn" data-action="percent">%</button>
            <button class="ck-key ck-op" data-op="/">÷</button>
            <button class="ck-key ck-num" data-num="7">7</button>
            <button class="ck-key ck-num" data-num="8">8</button>
            <button class="ck-key ck-num" data-num="9">9</button>
            <button class="ck-key ck-op" data-op="*">×</button>
            <button class="ck-key ck-num" data-num="4">4</button>
            <button class="ck-key ck-num" data-num="5">5</button>
            <button class="ck-key ck-num" data-num="6">6</button>
            <button class="ck-key ck-op" data-op="-">−</button>
            <button class="ck-key ck-num" data-num="1">1</button>
            <button class="ck-key ck-num" data-num="2">2</button>
            <button class="ck-key ck-num" data-num="3">3</button>
            <button class="ck-key ck-op" data-op="+">+</button>
            <button class="ck-key ck-num ck-wide" data-num="0">0</button>
            <button class="ck-key ck-num" data-num=".">.</button>
            <button class="ck-key ck-op" data-op="=">=</button>
          </div>
        </div>`;

      const prevEl = host.querySelector('.calc-prev');
      const currEl = host.querySelector('.calc-current');
      let current = '0', previous = null, operation = null, justEvaluated = false;

      const updateDisplay = () => {
        currEl.textContent = current.length > 12 ? parseFloat(current).toExponential(6) : current;
        if (previous !== null && operation) {
          const opMap = { '+': '+', '-': '−', '*': '×', '/': '÷' };
          prevEl.textContent = previous + ' ' + (opMap[operation] || operation);
        } else {
          prevEl.textContent = '';
        }
      };

      const inputNumber = (num) => {
        if (justEvaluated) { current = '0'; justEvaluated = false; }
        if (num === '.') {
          if (!current.includes('.')) current += '.';
        } else if (current === '0') {
          current = num;
        } else {
          current += num;
        }
        updateDisplay();
      };

      const calculate = (a, b, op) => {
        a = parseFloat(a); b = parseFloat(b);
        switch (op) {
          case '+': return String(a + b);
          case '-': return String(a - b);
          case '*': return String(a * b);
          case '/': return b === 0 ? 'Error' : String(a / b);
          default: return String(b);
        }
      };

      const handleOp = (op) => {
        if (op === '=') {
          if (previous !== null && operation) {
            current = calculate(previous, current, operation);
            previous = null;
            operation = null;
            justEvaluated = true;
          }
        } else {
          if (previous !== null && operation && !justEvaluated) {
            current = calculate(previous, current, operation);
          }
          previous = current;
          operation = op;
          justEvaluated = false;
          current = '0';
        }
        updateDisplay();
      };

      const handleFn = (fn) => {
        switch (fn) {
          case 'clear':
            current = '0'; previous = null; operation = null; justEvaluated = false;
            break;
          case 'sign':
            current = current.startsWith('-') ? current.slice(1) : '-' + current;
            break;
          case 'percent':
            current = String(parseFloat(current) / 100);
            break;
        }
        updateDisplay();
      };

      host.querySelectorAll('.ck-key').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.num !== undefined) inputNumber(btn.dataset.num);
          else if (btn.dataset.op) handleOp(btn.dataset.op);
          else if (btn.dataset.action) handleFn(btn.dataset.action);
          btn.classList.add('ck-pressed');
          setTimeout(() => btn.classList.remove('ck-pressed'), 150);
        });
      });

      updateDisplay();
      return () => {};
    },
  });

  /* ============================================================
   * 真实应用 5：天气（模拟数据 · 精美 UI）
   * ============================================================ */
  OS.apps.register({
    id: 'weather',
    name: '天气',
    icon: 'weather',
    cls: 'ic-cyan',
    version: '1.0.0',
    description: '天气预报（模拟数据）',
    mount(host) {
      const conditions = ['晴', '多云', '阴', '小雨', '中雨', '雷阵雨', '小雪', '雾'];
      const temp = 18 + Math.floor(Math.random() * 12);
      const cond = conditions[Math.floor(Math.random() * conditions.length)];
      const feelTemp = temp + Math.floor(Math.random() * 6 - 3);
      const humidity = 40 + Math.floor(Math.random() * 40);
      const wind = 2 + Math.floor(Math.random() * 8);
      const aqi = 20 + Math.floor(Math.random() * 80);

      let hourlyHtml = '';
      const nowHour = new Date().getHours();
      for (let i = 0; i < 12; i++) {
        const h = (nowHour + i) % 24;
        const t = temp + Math.floor(Math.random() * 8 - 4);
        const c = conditions[Math.floor(Math.random() * conditions.length)];
        hourlyHtml += `<div class="wt-hour"><span class="wt-h-time">${i === 0 ? '现在' : h + '时'}</span><span class="wt-h-icon"><os-icon name="weather" size="18"></os-icon></span><span class="wt-h-temp">${t}°</span></div>`;
      }

      let dailyHtml = '';
      const days = ['今天', '明天', '后天', '周三', '周四', '周五', '周六'];
      for (let i = 0; i < 7; i++) {
        const hi = temp + Math.floor(Math.random() * 8);
        const lo = temp - Math.floor(Math.random() * 8);
        const c = conditions[Math.floor(Math.random() * conditions.length)];
        dailyHtml += `<div class="wt-day"><span class="wt-d-name">${days[i]}</span><span class="wt-d-icon"><os-icon name="weather" size="16"></os-icon></span><span class="wt-d-lo">${lo}°</span><div class="wt-d-bar"><i style="left:${lo + 10}%;width:${hi - lo + 5}%"></i></div><span class="wt-d-hi">${hi}°</span></div>`;
      }

      host.innerHTML = `
        <div class="app-weather">
          <div class="wt-hero">
            <div class="wt-loc">上海</div>
            <div class="wt-temp">${temp}°</div>
            <div class="wt-cond">${cond}</div>
            <div class="wt-feel">体感 ${feelTemp}°</div>
          </div>
          <div class="wt-card">
            <div class="wt-card-title">逐时预报</div>
            <div class="wt-hours">${hourlyHtml}</div>
          </div>
          <div class="wt-card">
            <div class="wt-card-title">每日预报</div>
            <div class="wt-days">${dailyHtml}</div>
          </div>
          <div class="wt-grid">
            <div class="wt-info"><span class="wt-info-label">湿度</span><span class="wt-info-val">${humidity}%</span></div>
            <div class="wt-info"><span class="wt-info-label">风速</span><span class="wt-info-val">${wind} m/s</span></div>
            <div class="wt-info"><span class="wt-info-label">空气质量</span><span class="wt-info-val">${aqi}</span></div>
            <div class="wt-info"><span class="wt-info-label">紫外线</span><span class="wt-info-val">${aqi > 60 ? '弱' : '中'}</span></div>
          </div>
        </div>`;
      return () => {};
    },
  });

  /* ============================================================
   * 真实应用 6：备忘录（localStorage CRUD）
   * ============================================================ */
  OS.apps.register({
    id: 'notes',
    name: '备忘录',
    icon: 'notes',
    cls: 'ic-orange',
    version: '1.0.0',
    description: '备忘录（本地存储）',
    mount(host) {
      const STORE_KEY = 'nsos:notes';
      let notes = [];
      try { notes = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { notes = []; }
      let editingId = null;

      const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(notes));

      const renderList = () => {
        host.innerHTML = `
          <div class="app-notes">
            <div class="nt-header">
              <span class="nt-title">备忘录</span>
              <button class="nt-add" id="nt-new">+</button>
            </div>
            <div class="nt-list" id="nt-list"></div>
          </div>`;
        const listEl = host.querySelector('#nt-list');
        if (notes.length === 0) {
          listEl.innerHTML = '<div class="nt-empty">还没有备忘录<br>点击 + 创建</div>';
        } else {
          notes.forEach(n => {
            const d = new Date(n.updated || n.created);
            const dateStr = (d.getMonth()+1) + '月' + d.getDate() + '日';
            const item = document.createElement('div');
            item.className = 'nt-item';
            item.innerHTML = `
              <div class="nt-item-title">${n.title || '新建备忘录'}</div>
              <div class="nt-item-meta"><span class="nt-item-date">${dateStr}</span><span class="nt-item-preview">${(n.body || '').slice(0,30)}</span></div>`;
            item.addEventListener('click', () => renderEditor(n.id));
            listEl.appendChild(item);
          });
        }
        host.querySelector('#nt-new').addEventListener('click', () => renderEditor(null));
      };

      const renderEditor = (id) => {
        editingId = id;
        const note = id ? notes.find(n => n.id === id) : { id: null, title: '', body: '', created: Date.now() };
        host.innerHTML = `
          <div class="app-notes nt-editor-mode">
            <div class="nt-editor-header">
              <button class="nt-back" id="nt-back">‹ 返回</button>
              <button class="nt-save" id="nt-save">完成</button>
            </div>
            <input class="nt-edit-title" id="nt-edit-title" placeholder="标题" value="${note.title || ''}">
            <textarea class="nt-edit-body" id="nt-edit-body" placeholder="开始书写…">${note.body || ''}</textarea>
          </div>`;
        host.querySelector('#nt-back').addEventListener('click', () => renderList());
        host.querySelector('#nt-save').addEventListener('click', () => {
          const title = host.querySelector('#nt-edit-title').value.trim();
          const body = host.querySelector('#nt-edit-body').value.trim();
          if (!title && !body) { renderList(); return; }
          if (editingId) {
            const n = notes.find(n => n.id === editingId);
            if (n) { n.title = title; n.body = body; n.updated = Date.now(); }
          } else {
            notes.unshift({ id: 'n' + Date.now(), title, body, created: Date.now(), updated: Date.now() });
          }
          save();
          renderList();
        });
        setTimeout(() => { try { host.querySelector('#nt-edit-title').focus(); } catch (e) {} }, 100);
      };

      renderList();
      return () => { save(); };
    },
  });

  /* ============================================================
   * 真实应用 7：浏览器（简易 · iframe + 地址栏）
   * ============================================================ */
  OS.apps.register({
    id: 'browser',
    name: '浏览器',
    icon: 'browser',
    cls: 'ic-blue',
    version: '1.0.0',
    description: '简易浏览器',
    mount(host) {
      host.innerHTML = `
        <div class="app-browser">
          <div class="br-toolbar">
            <button class="br-btn" id="br-back">‹</button>
            <button class="br-btn" id="br-fwd">›</button>
            <div class="br-addr-wrap">
              <input class="br-addr" id="br-addr" type="text" placeholder="搜索或输入网址" value="https://www.bing.com">
            </div>
            <button class="br-btn" id="br-go">→</button>
          </div>
          <div class="br-quick">
            <button class="br-quick-item" data-url="https://www.bing.com">搜索</button>
            <button class="br-quick-item" data-url="https://github.com">GitHub</button>
            <button class="br-quick-item" data-url="https://wikipedia.org">百科</button>
            <button class="br-quick-item" data-url="https://youtube.com">视频</button>
          </div>
          <iframe class="br-frame" id="br-frame" src="https://www.bing.com" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
        </div>`;
      const frame = host.querySelector('#br-frame');
      const addr = host.querySelector('#br-addr');
      const goBtn = host.querySelector('#br-go');
      const backBtn = host.querySelector('#br-back');
      const fwdBtn = host.querySelector('#br-fwd');

      const navigate = (url) => {
        if (!url) return;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url;
          } else {
            url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
          }
        }
        frame.src = url;
        addr.value = url;
      };

      goBtn.addEventListener('click', () => navigate(addr.value.trim()));
      addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(addr.value.trim()); });
      host.querySelectorAll('.br-quick-item').forEach(btn => {
        btn.addEventListener('click', () => navigate(btn.dataset.url));
      });
      backBtn.addEventListener('click', () => { try { frame.contentWindow.history.back(); } catch (e) {} });
      fwdBtn.addEventListener('click', () => { try { frame.contentWindow.history.forward(); } catch (e) {} });

      return () => {};
    },
  });

  /* ============================================================
   * 真实应用 8：音乐播放器（模拟数据 · 现代 UI · 轻量更新）
   * ============================================================ */
  OS.apps.register({
    id: 'music',
    name: '音乐',
    icon: 'music',
    cls: 'ic-purple',
    version: '2.0.0',
    description: '音乐播放器',
    mount(host) {
      const tracks = [
        { title: '夜空下的星', artist: '光年之外', dur: 215, color: '#a452ff' },
        { title: '晨曦微光', artist: '黎明之子', dur: 192, color: '#ff6b5e' },
        { title: '海风轻语', artist: '潮汐乐队', dur: 248, color: '#2dd4d0' },
        { title: '都市霓虹', artist: 'DJ Electron', dur: 176, color: '#ef9f37' },
        { title: '山谷回声', artist: '自然之声', dur: 305, color: '#34d399' },
      ];
      let currentIdx = 0, playing = false, progress = 0, iv = null;
      // DOM 引用缓存，避免每秒 querySelector
      let dom = {};

      const pad = s => String(Math.floor(s)).padStart(2, '0');
      const fmtTime = (s) => pad(s / 60) + ':' + pad(s % 60);

      // 轻量更新：只改进度条 + 时间文字，不重建 DOM
      const updateProgress = () => {
        const t = tracks[currentIdx];
        if (dom.bar) dom.bar.style.width = (progress / t.dur * 100) + '%';
        if (dom.cur) dom.cur.textContent = fmtTime(progress);
      };

      // 切换播放/暂停按钮图标（不重建 DOM）
      const updatePlayBtn = () => {
        if (dom.playBtn) {
          dom.playBtn.innerHTML = playing
            ? '<os-icon name="pause" size="22"></os-icon>'
            : '<os-icon name="play" size="22"></os-icon>';
        }
        if (dom.album) dom.album.classList.toggle('playing', playing);
      };

      // 切换曲目时的高亮（不重建 DOM）
      const updatePlaylistHighlight = () => {
        host.querySelectorAll('.ms-pl-item').forEach((el, i) => {
          el.classList.toggle('active', i === currentIdx);
        });
      };

      // 切换曲目：更新标题/封面/时长等静态信息
      const updateTrackInfo = () => {
        const t = tracks[currentIdx];
        if (dom.album) dom.album.style.background = `linear-gradient(135deg,${t.color},${t.color}88)`;
        if (dom.root) dom.root.style.setProperty('--album-color', t.color);
        if (dom.title) dom.title.textContent = t.title;
        if (dom.artist) dom.artist.textContent = t.artist;
        if (dom.dur) dom.dur.textContent = fmtTime(t.dur);
        progress = 0;
        updateProgress();
        updatePlaylistHighlight();
      };

      const switchTrack = (newIdx) => {
        currentIdx = newIdx;
        updateTrackInfo();
      };

      const render = () => {
        const t = tracks[currentIdx];
        host.innerHTML = `
          <div class="app-music" style="--album-color:${t.color}">
            <div class="ms-album rotating" style="background:linear-gradient(135deg,${t.color},${t.color}88)">
              <div class="ms-album-art"><os-icon name="music" size="48"></os-icon></div>
            </div>
            <div class="ms-info">
              <div class="ms-title">${t.title}</div>
              <div class="ms-artist">${t.artist}</div>
            </div>
            <div class="ms-progress">
              <div class="ms-bar-track"><i class="ms-bar" style="width:${(progress/t.dur)*100}%"></i></div>
              <div class="ms-times"><span class="ms-cur">${fmtTime(progress)}</span><span class="ms-dur">${fmtTime(t.dur)}</span></div>
            </div>
            <div class="ms-controls">
              <button class="ms-btn" id="ms-prev"><os-icon name="skip-prev" size="20"></os-icon></button>
              <button class="ms-btn ms-play" id="ms-play">${playing ? '<os-icon name="pause" size="22"></os-icon>' : '<os-icon name="play" size="22"></os-icon>'}</button>
              <button class="ms-btn" id="ms-next"><os-icon name="skip-next" size="20"></os-icon></button>
            </div>
            <div class="ms-playlist">
              <div class="ms-pl-title">播放列表</div>
              ${tracks.map((tr, i) => `<div class="ms-pl-item ${i === currentIdx ? 'active' : ''}" data-idx="${i}"><span class="ms-pl-name">${tr.title}</span><span class="ms-pl-dur">${fmtTime(tr.dur)}</span></div>`).join('')}
            </div>
          </div>`;

        // 缓存 DOM 引用
        dom = {
          root: host.querySelector('.app-music'),
          album: host.querySelector('.ms-album'),
          title: host.querySelector('.ms-title'),
          artist: host.querySelector('.ms-artist'),
          bar: host.querySelector('.ms-bar'),
          cur: host.querySelector('.ms-cur'),
          dur: host.querySelector('.ms-dur'),
          playBtn: host.querySelector('#ms-play'),
        };

        host.querySelector('#ms-play').addEventListener('click', togglePlay);
        host.querySelector('#ms-prev').addEventListener('click', () => switchTrack((currentIdx - 1 + tracks.length) % tracks.length));
        host.querySelector('#ms-next').addEventListener('click', () => switchTrack((currentIdx + 1) % tracks.length));
        host.querySelectorAll('.ms-pl-item').forEach(el => {
          el.addEventListener('click', () => switchTrack(parseInt(el.dataset.idx)));
        });

        if (playing) dom.album.classList.add('playing');
      };

      const togglePlay = () => {
        playing = !playing;
        if (playing) {
          iv = setInterval(() => {
            progress++;
            if (progress >= tracks[currentIdx].dur) {
              switchTrack((currentIdx + 1) % tracks.length);
            }
            updateProgress(); // 轻量更新，不重建 DOM
          }, 1000);
        } else {
          clearInterval(iv);
        }
        updatePlayBtn();
      };

      render();
      return () => { clearInterval(iv); };
    },
  });

  /* ============================================================
   * 真实应用 9：相册（网格画廊 · SVG 占位图）
   * ============================================================ */
  OS.apps.register({
    id: 'photos',
    name: '相册',
    icon: 'photos',
    cls: 'ic-blue',
    version: '1.0.0',
    description: '相册画廊',
    mount(host) {
      const gradients = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#a8edea,#fed6e3)',
        'linear-gradient(135deg,#ff9a9e,#fecfef)',
        'linear-gradient(135deg,#ffecd2,#fcb69f)',
        'linear-gradient(135deg,#a18cd1,#fbc2eb)',
        'linear-gradient(135deg,#fbc2eb,#a6c1ee)',
        'linear-gradient(135deg,#84fab0,#8fd3f4)',
        'linear-gradient(135deg,#fccb90,#d57eeb)',
      ];
      let viewIdx = -1;

      const renderGrid = () => {
        host.innerHTML = `
          <div class="app-photos">
            <div class="ph-header"><span>相册</span><span class="ph-count">${gradients.length} 张照片</span></div>
            <div class="ph-grid">
              ${gradients.map((g, i) => `<div class="ph-thumb" style="background:${g}" data-idx="${i}"><span class="ph-thumb-ic"><os-icon name="photos" size="20"></os-icon></span></div>`).join('')}
            </div>
          </div>`;
        host.querySelectorAll('.ph-thumb').forEach(el => {
          el.addEventListener('click', () => renderView(parseInt(el.dataset.idx)));
        });
      };

      const renderView = (idx) => {
        viewIdx = idx;
        host.innerHTML = `
          <div class="app-photos ph-view-mode">
            <div class="ph-view-header">
              <button class="ph-back" id="ph-back">‹ 返回</button>
              <span>${idx + 1} / ${gradients.length}</span>
            </div>
            <div class="ph-view" style="background:${gradients[idx]}">
              <div class="ph-view-art">🌅</div>
            </div>
            <div class="ph-view-controls">
              <button class="ph-vw-btn" id="ph-prev">‹</button>
              <button class="ph-vw-btn" id="ph-share">分享</button>
              <button class="ph-vw-btn" id="ph-next">›</button>
            </div>
          </div>`;
        host.querySelector('#ph-back').addEventListener('click', renderGrid);
        host.querySelector('#ph-prev').addEventListener('click', () => renderView((viewIdx - 1 + gradients.length) % gradients.length));
        host.querySelector('#ph-next').addEventListener('click', () => renderView((viewIdx + 1) % gradients.length));
      };

      renderGrid();
      return () => {};
    },
  });

  /* ============================================================
   * Dock 应用 1：电话（拨号面板）
   * ============================================================ */
  OS.apps.register({
    id: 'phone',
    name: '电话',
    icon: 'phone',
    cls: 'ic-green',
    dock: true,
    version: '1.0.0',
    description: '拨号面板',
    mount(host) {
      host.innerHTML = `
        <div class="app-phone">
          <div class="ph-dial-display" id="ph-dial">输入号码</div>
          <div class="ph-keypad">
            ${[1,2,3,4,5,6,7,8,9,'*',0,'#'].map(n => {
              const subs = ['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ', '', '', ''];
              const sub = typeof n === 'number' && subs[n] ? '<span class="ph-key-sub">' + subs[n] + '</span>' : '';
              return '<button class="ph-key" data-key="' + n + '"><span class="ph-key-num">' + n + '</span>' + sub + '</button>';
            }).join('')}
          </div>
          <div class="ph-call-row">
            <button class="ph-call-btn" id="ph-call"><os-icon name="phone" size="28"></os-icon></button>
            <button class="ph-del-btn" id="ph-del"><os-icon name="backspace" size="22"></os-icon></button>
          </div>
        </div>`;
      const display = host.querySelector('#ph-dial');
      let number = '';
      host.querySelectorAll('.ph-key').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.key;
          number += k;
          display.textContent = number;
          display.classList.remove('ph-dial-empty');
        });
      });
      host.querySelector('#ph-del').addEventListener('click', () => {
        number = number.slice(0, -1);
        display.textContent = number || '输入号码';
        if (!number) display.classList.add('ph-dial-empty');
      });
      host.querySelector('#ph-call').addEventListener('click', () => {
        if (number && OS.notify) {
          OS.notify.post({ icon: 'phone', title: '通话结束', text: '已挂断 ' + number, app: 'phone' });
        }
      });
      return () => {};
    },
  });

  /* ============================================================
   * Dock 应用 2：短信（对话列表 + 聊天界面）
   * ============================================================ */
  OS.apps.register({
    id: 'messages',
    name: '短信',
    icon: 'messages',
    cls: 'ic-cyan',
    dock: true,
    version: '1.0.0',
    description: '短信',
    mount(host) {
      const chats = [
        { id: 1, name: '系统通知', avatar: '#ef9f37', msgs: [{ from: 'them', text: '欢迎使用 nsos 短信', time: '09:00' }] },
        { id: 2, name: '小明', avatar: '#5b8def', msgs: [{ from: 'them', text: '晚上一起吃饭吗？', time: '12:30' }, { from: 'me', text: '好啊，几点？', time: '12:35' }] },
        { id: 3, name: '工作群', avatar: '#35c4a2', msgs: [{ from: 'them', text: '会议改到下午3点', time: '14:00' }] },
      ];

      const renderList = () => {
        host.innerHTML = `
          <div class="app-msg">
            <div class="msg-header">短信</div>
            <div class="msg-list">
              ${chats.map(c => {
                const last = c.msgs[c.msgs.length - 1];
                return `<div class="msg-chat-item" data-id="${c.id}">
                  <div class="msg-avatar" style="background:${c.avatar}">${c.name[0]}</div>
                  <div class="msg-chat-info">
                    <div class="msg-chat-name">${c.name}</div>
                    <div class="msg-chat-preview">${last.text}</div>
                  </div>
                  <div class="msg-chat-time">${last.time}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        host.querySelectorAll('.msg-chat-item').forEach(el => {
          el.addEventListener('click', () => renderChat(parseInt(el.dataset.id)));
        });
      };

      const renderChat = (id) => {
        const chat = chats.find(c => c.id === id);
        host.innerHTML = `
          <div class="app-msg msg-chat-mode">
            <div class="msg-chat-header">
              <button class="msg-back" id="msg-back">‹</button>
              <div class="msg-avatar" style="background:${chat.avatar}">${chat.name[0]}</div>
              <span class="msg-chat-name">${chat.name}</span>
            </div>
            <div class="msg-bubbles" id="msg-bubbles">
              ${chat.msgs.map(m => `<div class="msg-bubble ${m.from === 'me' ? 'me' : 'them'}">${m.text}</div>`).join('')}
            </div>
            <div class="msg-input-row">
              <input class="msg-input" id="msg-input" placeholder="输入消息…">
              <button class="msg-send" id="msg-send">↑</button>
            </div>
          </div>`;
        host.querySelector('#msg-back').addEventListener('click', renderList);
        const bubbles = host.querySelector('#msg-bubbles');
        const input = host.querySelector('#msg-input');
        const send = host.querySelector('#msg-send');
        const sendMsg = () => {
          const text = input.value.trim();
          if (!text) return;
          chat.msgs.push({ from: 'me', text, time: 'now' });
          const bubble = document.createElement('div');
          bubble.className = 'msg-bubble me';
          bubble.textContent = text;
          bubbles.appendChild(bubble);
          input.value = '';
          bubbles.scrollTop = bubbles.scrollHeight;
          // Auto-reply
          setTimeout(() => {
            const replies = ['好的', '收到', '了解', '没问题', '稍等', '👌'];
            chat.msgs.push({ from: 'them', text: replies[Math.floor(Math.random()*replies.length)], time: 'now' });
            const r = document.createElement('div');
            r.className = 'msg-bubble them';
            r.textContent = chat.msgs[chat.msgs.length - 1].text;
            bubbles.appendChild(r);
            bubbles.scrollTop = bubbles.scrollHeight;
          }, 800 + Math.random() * 1200);
        };
        send.addEventListener('click', sendMsg);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
      };

      renderList();
      return () => {};
    },
  });

  /* ============================================================
   * Dock 应用 3：应用抽屉（全部应用列表）
   * ============================================================ */
  OS.apps.register({
    id: 'apps',
    name: '应用',
    icon: 'apps',
    cls: 'ic-orange',
    dock: true,
    version: '1.0.0',
    description: '应用抽屉',
    mount(host) {
      const allApps = OS.apps.all();
      host.innerHTML = `
        <div class="app-drawer">
          <div class="dr-header">全部应用</div>
          <div class="dr-search">
            <input class="dr-search-input" id="dr-search" placeholder="搜索应用…">
          </div>
          <div class="dr-grid" id="dr-grid">
            ${allApps.map(a => `<div class="dr-item" data-id="${a.id}" data-name="${a.name}">
              <div class="ic ${a.cls}"><os-icon name="${a.icon}"></os-icon></div>
              <span class="nm">${a.name}</span>
            </div>`).join('')}
          </div>
        </div>`;
      const grid = host.querySelector('#dr-grid');
      const search = host.querySelector('#dr-search');
      search.addEventListener('input', () => {
        const q = search.value.toLowerCase();
        host.querySelectorAll('.dr-item').forEach(el => {
          el.style.display = el.dataset.name.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      host.querySelectorAll('.dr-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          OS.nav.home();
          setTimeout(() => OS.nav.push(id), 100);
        });
      });
      return () => {};
    },
  });

  /* ============================================================
   * Dock 应用 4：相机（模拟取景器）
   * ============================================================ */
  OS.apps.register({
    id: 'camera2',
    name: '相机',
    icon: 'camera',
    cls: 'ic-purple',
    dock: true,
    version: '1.0.0',
    description: '相机',
    mount(host) {
      host.innerHTML = `
        <div class="app-camera">
          <div class="cam-viewfinder">
            <div class="cam-grid-overlay"></div>
            <div class="cam-mode">照片</div>
          </div>
          <div class="cam-modes">
            <span class="cam-mode-item">人像</span>
            <span class="cam-mode-item active">照片</span>
            <span class="cam-mode-item">正方</span>
            <span class="cam-mode-item">全景</span>
          </div>
          <div class="cam-controls">
            <div class="cam-thumb"></div>
            <button class="cam-shutter" id="cam-shutter"></button>
            <button class="cam-flip" id="cam-flip">🔄</button>
          </div>
        </div>`;
      const shutter = host.querySelector('#cam-shutter');
      shutter.addEventListener('click', () => {
        shutter.classList.add('cam-flash');
        const vf = host.querySelector('.cam-viewfinder');
        vf.style.background = '#fff';
        setTimeout(() => {
          vf.style.background = '';
          shutter.classList.remove('cam-flash');
          if (OS.notify) OS.notify.post({ icon: 'camera', title: '已保存照片', text: '照片已保存到相册', app: 'camera' });
        }, 200);
      });
      return () => {};
    },
  });

  /* ============================================================
   * 真实应用 11：日历（月视图 + 事件管理）
   * ============================================================ */
  OS.apps.register({
    id: 'calendar',
    name: '日历',
    icon: 'clock',
    cls: 'ic-red',
    version: '1.0.0',
    description: '日历与事件',
    mount(host) {
      const STORE_KEY = 'nsos:calendar:events';
      let events = {};
      try { events = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (e) { events = {}; }
      const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(events));

      let viewDate = new Date();
      let selectedDate = null;

      const pad = n => String(n).padStart(2, '0');
      const fmtDateKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

      const isToday = (d) => {
        const t = new Date();
        return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
      };

      const render = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDay = firstDay.getDay();
        const daysInMonth = lastDay.getDate();

        let calendarHtml = '';
        // Week day headers
        dayNames.forEach(d => {
          calendarHtml += `<div class="cal-dow">${d}</div>`;
        });
        // Empty cells before first day
        for (let i = 0; i < startDay; i++) {
          calendarHtml += '<div class="cal-cell empty"></div>';
        }
        // Days
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month, d);
          const key = fmtDateKey(date);
          const hasEvents = !!events[key];
          calendarHtml += `<div class="cal-cell ${isToday(date) ? 'today' : ''} ${selectedDate === key ? 'selected' : ''}" data-date="${key}">
            <span class="cal-day">${d}</span>
            ${hasEvents ? '<span class="cal-dot"></span>' : ''}
          </div>`;
        }

        const eventsHtml = selectedDate && events[selectedDate]
          ? events[selectedDate].map((e, i) => `<div class="cal-event" data-idx="${i}"><span class="cal-event-time">${e.time}</span><span class="cal-event-title">${e.title}</span><button class="cal-event-del" data-idx="${i}">×</button></div>`).join('')
          : '<div class="cal-no-events">无事件</div>';

        host.innerHTML = `
          <div class="app-calendar">
            <div class="cal-header">
              <button class="cal-nav-btn" id="cal-prev">‹</button>
              <div class="cal-title">${year}年 ${monthNames[month]}</div>
              <button class="cal-nav-btn" id="cal-next">›</button>
            </div>
            <div class="cal-weekdays">${dayNames.map(d => `<div class="cal-dow">${d}</div>`).join('')}</div>
            <div class="cal-grid">${calendarHtml}</div>
            <div class="cal-events-panel">
              <div class="cal-events-header">
                <span class="cal-events-date">${selectedDate || fmtDateKey(new Date())}</span>
                <button class="cal-add-btn" id="cal-add">+ 事件</button>
              </div>
              <div class="cal-events-list">${eventsHtml}</div>
            </div>
          </div>`;

        // Navigation
        host.querySelector('#cal-prev').addEventListener('click', () => {
          viewDate = new Date(year, month - 1, 1);
          render();
        });
        host.querySelector('#cal-next').addEventListener('click', () => {
          viewDate = new Date(year, month + 1, 1);
          render();
        });

        // Date selection
        host.querySelectorAll('.cal-cell:not(.empty)').forEach(cell => {
          cell.addEventListener('click', () => {
            selectedDate = cell.dataset.date;
            render();
          });
        });

        // Add event
        host.querySelector('#cal-add').addEventListener('click', () => {
          const date = selectedDate || fmtDateKey(new Date());
          const title = prompt('事件标题：');
          if (!title) return;
          const time = prompt('时间（如 14:00）：') || '全天';
          if (!events[date]) events[date] = [];
          events[date].push({ title, time });
          save();
          selectedDate = date;
          render();
        });

        // Delete event
        host.querySelectorAll('.cal-event-del').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx, 10);
            const date = selectedDate;
            if (events[date]) {
              events[date].splice(idx, 1);
              if (events[date].length === 0) delete events[date];
              save();
              render();
            }
          });
        });
      };

      render();
      return () => { save(); };
    },
  });

  /* ============================================================
   * 真实应用 12：文件管理器（浏览虚拟文件系统）
   * ============================================================ */
  OS.apps.register({
    id: 'files',
    name: '文件',
    icon: 'save',
    cls: 'ic-blue',
    version: '1.0.0',
    description: '文件管理器',
    mount(host) {
      let currentPath = '/';
      const fileIcons = {
        '.zip': 'save', '.txt': 'notes', '.md': 'notes', '.js': 'terminal',
        '.css': 'notes', '.html': 'browser', '.json': 'notes', '.svg': 'photos',
      };
      const folderIcon = 'apps';

      const getFiles = (path) => {
        // Use the shell VFS if available, otherwise mock data
        if (OS.shell && OS.shell.VFS) {
          const tree = OS.shell.VFS.tree;
          if (path === '/' && tree['/sdcard']) {
            return { dirs: [], files: tree['/sdcard'] };
          }
        }
        // Mock file system
        const mockFs = {
          '/': {
            dirs: ['sdcard', 'system', 'downloads'],
            files: ['README.txt'],
          },
          '/sdcard': {
            dirs: ['Documents', 'Pictures', 'Music', 'Downloads'],
            files: ['nsos-ota-b0.1.9.zip', 'backup.json'],
          },
          '/system': {
            dirs: ['apps', 'css', 'js'],
            files: ['manifest.json'],
          },
          '/downloads': {
            dirs: [],
            files: ['guide.md', 'changelog.txt'],
          },
        };
        return mockFs[path] || { dirs: [], files: [] };
      };

      const render = () => {
        const data = getFiles(currentPath);
        const pathParts = currentPath.split('/').filter(Boolean);
        let breadcrumb = '<span class="fl-crumb" data-path="/">根目录</span>';
        let curPath = '';
        pathParts.forEach((part, i) => {
          curPath += '/' + part;
          breadcrumb += ` <span class="fl-crumb-sep">›</span> <span class="fl-crumb" data-path="${curPath}">${part}</span>`;
        });

        let contentHtml = '';
        if (data.dirs.length === 0 && data.files.length === 0) {
          contentHtml = '<div class="fl-empty">此文件夹为空</div>';
        } else {
          let itemsHtml = '';
          data.dirs.forEach(dir => {
            const newPath = currentPath === '/' ? '/' + dir : currentPath + '/' + dir;
            itemsHtml += `<div class="fl-item fl-dir" data-path="${newPath}">
              <span class="fl-item-ic"><os-icon name="${folderIcon}" size="18"></os-icon></span>
              <span class="fl-item-name">${dir}</span>
              <span class="fl-item-meta">文件夹</span>
            </div>`;
          });
          data.files.forEach(file => {
            const ext = '.' + (file.split('.').pop() || '');
            const icon = fileIcons[ext] || 'notes';
            const size = (Math.random() * 10 + 0.1).toFixed(1) + ' MB';
            itemsHtml += `<div class="fl-item fl-file" data-name="${file}">
              <span class="fl-item-ic"><os-icon name="${icon}" size="18"></os-icon></span>
              <span class="fl-item-name">${file}</span>
              <span class="fl-item-meta">${size}</span>
            </div>`;
          });
          contentHtml = `<div class="fl-list">${itemsHtml}</div>`;
        }

        host.innerHTML = `
          <div class="app-files">
            <div class="fl-breadcrumb">${breadcrumb}</div>
            <div class="fl-content">${contentHtml}</div>
          </div>`;

        // Breadcrumb navigation
        host.querySelectorAll('.fl-crumb').forEach(crumb => {
          crumb.addEventListener('click', () => {
            currentPath = crumb.dataset.path;
            render();
          });
        });

        // Directory navigation
        host.querySelectorAll('.fl-dir').forEach(item => {
          item.addEventListener('click', () => {
            currentPath = item.dataset.path;
            render();
          });
        });

        // File click
        host.querySelectorAll('.fl-file').forEach(item => {
          item.addEventListener('click', () => {
            if (OS.ui && OS.ui.toast) OS.ui.toast('文件：' + item.dataset.name, { ms: 1000 });
          });
        });
      };

      render();
      return () => {};
    },
  });

})(window);
