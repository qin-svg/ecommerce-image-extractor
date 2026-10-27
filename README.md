# 电商图片提取下载（Chrome 扩展）

在淘宝、天猫、京东、拼多多商家版商品详情页一键提取商品图，在新标签页勾选后批量保存为 PNG。

## 安装

### Chrome

1. 打开 Chrome，访问 `chrome://extensions`
2. 打开右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录 `ecommerce-image-extractor`

### Microsoft Edge

1. 打开 Edge，访问 `edge://extensions`
2. 打开左下角「开发人员」开关
3. 点击「加载解压缩的扩展」
4. 选择本目录 `ecommerce-image-extractor`

## 下载位置

默认保存到浏览器「下载」文件夹（文件名为 `商品图_001.png`、`商品图_002.png`…）。

> 受 Chrome 安全限制，扩展无法直接指定保存到桌面等绝对路径。
> 想保存到桌面，请把浏览器默认下载位置改成桌面（一次性设置）：
>
> - Chrome：`chrome://settings/downloads` → 位置 → 更改 → 选择桌面
> - Edge：`edge://settings/downloads` → 位置 → 更改 → 选择桌面

勾选「下载前询问每个文件的保存位置」可逐次选择，或直接修改默认位置。

## 使用

1. 打开淘宝 / 天猫 / 京东 / 拼多多商家版的**商品详情页**
2. 页面右下角会出现「获取图片」按钮（也可点击浏览器工具栏中的扩展图标）
3. 新标签页会网格展示提取到的图片
4. 使用全选 / 反选勾选需要的图片，点击「下载选中」
5. 文件保存到浏览器默认下载目录，命名为 `商品图_001.png`、`商品图_002.png`…

小于约 100×100 的图标、logo、占位图会被过滤。跨域图片会在扩展后台拉取并转成 PNG。

## 文件结构

- `manifest.json` — Manifest V3 配置与权限
- `content.js` / `content.css` — 详情页悬浮按钮
- `background.js` — Service Worker：全 frame 扫描、PNG 转换、下载
- `gallery.html` / `gallery.js` / `gallery.css` — 图库与勾选下载
- `icons/` — 扩展图标
