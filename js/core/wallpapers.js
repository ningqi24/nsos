/* ============================================================
 * nsos - wallpapers.js
 * 壁纸唯一来源：桌面与设置应用共用同一份清单，避免两处各写一套
 * 导致索引错位（历史上桌面只有 5 套、设置 12 套，5~11 会回落）。
 *
 * 结构：OS.wallpapers = [{ name, css }, ...]
 *       OS.wallpaperAt(i) 返回安全的壁纸对象（越界回退第 0 套）
 *       OS.applyWallpaper(i) 应用到桌面 .launcher
 * ============================================================ */
(function (global) {
  'use strict';

  const OS = global.OS;

  /* 每套壁纸：深色基底 + 两处光源 + 极轻噪点感层次，避免“纯色板”观感 */
  const WALLPAPERS = [
    { name: '深空',   css: 'radial-gradient(ellipse at 30% 18%, rgba(91,141,239,.38), transparent 55%), radial-gradient(ellipse at 78% 82%, rgba(53,196,162,.18), transparent 55%), linear-gradient(160deg, #0a1024 0%, #07090e 70%)' },
    { name: '琥珀之夜', css: 'radial-gradient(ellipse at 50% 34%, rgba(239,159,55,.34), transparent 58%), radial-gradient(ellipse at 20% 90%, rgba(120,60,20,.25), transparent 60%), linear-gradient(180deg, #1a1206 0%, #07090e 72%)' },
    { name: '极光',   css: 'linear-gradient(180deg, #0a0e2e 0%, #14524a 48%, #0a0e2e 100%)' },
    { name: '暮光',   css: 'radial-gradient(ellipse at 65% 25%, rgba(164,82,255,.30), transparent 55%), linear-gradient(180deg, #1a0830 0%, #2a1050 45%, #07090e 100%)' },
    { name: '深海',   css: 'radial-gradient(ellipse at 60% 62%, rgba(45,140,220,.32), transparent 58%), linear-gradient(180deg, #061426 0%, #07090e 78%)' },
    { name: '紫罗兰', css: 'linear-gradient(140deg, #1a0b3e 0%, #3b1466 52%, #0a0210 100%)' },
    { name: '日出',   css: 'radial-gradient(ellipse at 50% 88%, rgba(255,150,70,.45), transparent 55%), linear-gradient(180deg, #160820 0%, #3a1436 42%, #6e2f1a 74%, #160820 100%)' },
    { name: '薄荷',   css: 'radial-gradient(ellipse at 30% 30%, rgba(53,196,162,.30), transparent 60%), linear-gradient(140deg, #06201c 0%, #0f4038 55%, #06120f 100%)' },
    { name: '银河',   css: 'radial-gradient(ellipse at 38% 28%, rgba(120,90,230,.40) 0%, transparent 52%), radial-gradient(ellipse at 72% 68%, rgba(200,60,140,.28) 0%, transparent 52%), linear-gradient(160deg, #0a0620 0%, #07090e 80%)' },
    { name: '星空',   css: 'radial-gradient(circle at 22% 48%, rgba(91,141,239,.26) 0%, transparent 46%), radial-gradient(circle at 80% 22%, rgba(164,82,255,.22) 0%, transparent 46%), linear-gradient(180deg, #060812 0%, #0a0e1e 100%)' },
    { name: '日落',   css: 'linear-gradient(180deg, #140718 0%, #3c1a0e 26%, #7a3f1c 50%, #35170c 74%, #140718 100%)' },
    { name: '霓虹',   css: 'radial-gradient(ellipse at 25% 25%, rgba(70,224,221,.30), transparent 55%), radial-gradient(ellipse at 78% 75%, rgba(240,90,150,.30), transparent 55%), linear-gradient(140deg, #0a0a26 0%, #1c0a30 55%, #0a0a1e 100%)' },
  ];

  OS.wallpapers = WALLPAPERS;

  OS.wallpaperAt = function (i) {
    const idx = Number.isFinite(i) ? i : 0;
    return WALLPAPERS[idx] || WALLPAPERS[0];
  };

  /** 把第 i 套壁纸应用到桌面容器 */
  OS.applyWallpaper = function (i) {
    const wp = OS.wallpaperAt(i);
    const launcher = document.querySelector('.launcher');
    if (launcher) launcher.style.background = wp.css;
    return wp;
  };
})(window);
