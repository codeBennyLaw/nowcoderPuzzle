# 牛客娘拼图大作战（HTML/CSS/JavaScript）

一个轻量、响应式的网页拼图小游戏（纯 HTML/CSS/Vanilla JS）。支持经典拖拽与滑块两种模式，移动端友好，加载快、无依赖。

## 功能特性

- 模式切换：
  - 经典拖拽：3×3 / 4×4 / 5×5，碎片带编号，拖拽吸附并与占位交换。
  - 滑块拼图：3×3 / 4×4 / 5×5，合法移动随机打乱，保证可解。
- 图片资源：仅加载 JPG/JPEG，来源于清单 [assets/images/puzzle/manifest.json](assets/images/puzzle/manifest.json)。
- 操作与统计：步数统计，计时可开关（首次有效移动开始）。
  - 经典拖拽：拖拽过程中不显示整图涟漪；仅在释放并发生交换时为双方图块提供一次性弹起反馈；拖拽落地从当前指针位置过渡到目标格。
- 通关体验：完成后棋盘锁定；弹窗展示 [assets/images/ac.jpg](assets/images/ac.jpg) 并播放 [assets/media/ac.wav](assets/media/ac.wav)；支持“查看原图”。
- 浮窗趣味：右下角常驻随机 GIF（清单 [assets/images/float/manifest.json](assets/images/float/manifest.json)），每次刷新随机一种。
- 适配与性能：Pointer Events 统一触控与鼠标；GPU 加速拖拽；图片预解码；本地缓存清单；音频预加载。

## 快速开始

建议使用任意「静态文件服务器」打开项目根目录，以避免浏览器在 `file://` 协议下拦截 `fetch` 读取清单：

1. 在 VS Code 中安装并使用 Five Server / Live Server 打开 [index.html](index.html)。
2. 或使用任意本地静态服务（Nginx、http-server、Python 简单服务器等）。

## 使用说明

- 模式与难度：顶部控制栏选择模式；两种模式均支持 3×3 / 4×4 / 5×5。
- 切换图片：左右箭头或下拉选单切换；“🎲”随机选择一张。
- 重新开始：保持当前图片与模式，重新打乱布局。
- 计时：勾选后在第一次有效移动开始计时；关闭则不计时。
- 完成后：棋盘锁定；弹窗可“查看原图”或关闭。

## 资源与目录

- [index.html](index.html)：页面结构与控制面板、悬浮 GIF、通关弹窗、页脚。
- [css/styles.css](css/styles.css)：主题样式、棋盘与弹窗、响应式与细节效果。
- [js/script.js](js/script.js)：两种拼图模式逻辑、图片与 GIF 清单读取、统计与通关处理；经典拖拽落地动画与弹起反馈。
- [assets/images/puzzle](assets/images/puzzle)：拼图 JPG 资源与清单 [manifest.json](assets/images/puzzle/manifest.json)。
- [assets/images/float](assets/images/float)：悬浮 GIF 与清单 [manifest.json](assets/images/float/manifest.json)。
- [assets/media](assets/media)：通关提示音 `ac.wav`。

## 维护与扩展

- 添加/删除拼图图片：
  - 仅支持 JPG/JPEG。将图片放入 [assets/images/puzzle](assets/images/puzzle)，并更新 [manifest.json](assets/images/puzzle/manifest.json)。
  - 清单示例：
    ```json
    ["1.jpg", "2.jpg", "3.jpg"]
    ```
- 悬浮 GIF：在 [assets/images/float](assets/images/float) 放置 `.gif` 并更新清单。
- 清单缓存：浏览器本地缓存键为 `puzzleManifestV3` 与 `floatManifestV1`。开发调试时可在控制台执行 `localStorage.clear()` 强制刷新清单。

### 预加载提示与优化

- 为避免浏览器出现“preload 的资源未在短时间内使用”的警告，已移除对拼图清单的 `<link rel="preload" as="fetch">`。清单加载由脚本通过 `fetch` + 缓存完成。
- 若需进一步优化首屏，可在服务端配置合理的缓存头或在脚本中提前触发图片预解码（已内置）。

## 兼容性

- 现代浏览器（支持 Pointer Events 的 Chrome/Edge/Firefox/Safari 近两个主要版本）。
- 建议在移动端及桌面端最新版本浏览器中体验以获得最佳性能与稳定性。
- 尊重用户的减少动画偏好：在 `prefers-reduced-motion: reduce` 下自动缩短或禁用过渡动画。

—— 祝你玩得开心！
