# 更新日志

本文件记录 B站账号切换器各版本的重要变更。日期以版本定稿日为准，版本格式为 `主版本.次版本.修订号`。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> 说明：v1.5.6、v1.5.7、v1.6.0 均为界面形态的探索性迭代，最终在 **v1.5.8** 回退到稳定的工具栏弹窗方案；其中 v1.6.0 从未作为发布版本分发。

---

## [v1.5.8] — 2026-11-04

当前稳定版本。

### 变更

- 回退 v1.6.0 的页面内 iframe 浮层方案，恢复 `action.default_popup` 工具栏弹窗。
- `content_scripts` 只保留 `content.js`，移除 `web_accessible_resources` 与 `overlay.js`；后台的面板打开逻辑还原为 `chrome.action.openPopup()` / `windows.create`。
- `accounts.js` 移除浮层相关的 `EMBED`、`postToParent`、`reportHeight`、Esc 关闭与 `embed` 参数。

### 界面

- 账号卡片与状态框改为直角：`--radius` 与 `--radius-sm` 置为 `0px`，确认框原先硬编码的 18px 圆角同步改用变量。
- 直角需要明确边界，`.card` 的描边由 `transparent` 改回 `var(--edge)`。
- 控件保持圆润：按钮、状态标签、删除按钮仍为胶囊形，刷新按钮与头像保持圆形，以区分「框」与「控件」的层次。
- 修正窄视口下的验证方式：headless 浏览器存在最小窗口宽度，需把弹窗放入固定 360px 的 iframe 内截图，避免把测试假象误判为溢出。

---

## [v1.6.0] — 2026-11-04（实验版本，已回退，未发布）

- 尝试实现真圆角：去掉 `default_popup`，改由 content script 在网页内注入 Shadow DOM 浮层与 iframe 面板。
- 修复了三个关键缺陷：`closeSelf` 会误删用户标签页、`refreshBiliTab` 会误判无可复用标签页、ResizeObserver 在内容变高时不回调导致面板显示半截。
- 结论：popup 的窗口形状与底色完全由浏览器绘制，CSS 无法改变；真圆角只能改为页面内浮层。该方案被否决，v1.5.8 已完整回退。

## [v1.5.7] — 2026-11-04

### 修复

- 撤回 v1.5.6 的「透明画布 + 圆角外壳」方案：真机上弹窗四周出现黑色边框。
- 根因是 CSS 背景会从 `body` 传播到画布层，`html/body` 设为透明后，弹窗窗口比内容盒多出的区域露出窗口自身黑底。
- 恢复满铺背景与 `.bg`、`.confirm-mask` 的 `position: fixed`。

## [v1.5.6] — 2026-11-04

- 尝试用 `html, body { background: transparent }` + `.shell` 圆角外壳实现弹窗圆角。
- 后续真机验证证实该思路不可行，见 v1.5.7。

## [v1.5.5] — 2026-11-03

### 界面

- 去掉账号行的 1px 描边与上下两条 inset 内高光——这三条硬边是「方框感」的主要来源。
- `.card` 改用专用「无边界玻璃」：`border: 1px solid transparent` 只为占位对齐，玻璃底使用 `--row-glass`，只保留 `--row-shadow`。
- hover 仅提亮玻璃底，不再修改描边颜色或添加光环。

## [v1.5.4] — 2026-11-03

- 账号行删除自有的 `box-shadow` / `border-color` / `background` 覆盖，与「当前登录」栏共用同一条玻璃规则，消除「另一种框」的观感。
- `.is-current` 不再换色，只保留「当前」标签；列表间距 12px → 14px。

## [v1.5.3] — 2026-11-03

- 分析确认「外部浅色大框」并非真实 DOM 容器，而是相邻圆角卡片的投影在 7px 间隙里连成一片造成的错觉。
- 列表间距 7px → 12px（需明显大于圆角半径）；`.list` 显式 `background: none; border: 0`；卡片换用更轻的投影；hover 改为粉色光环。

## [v1.5.2] — 2026-11-03

- 应反馈把账号行恢复为有框玻璃卡片，与「当前登录」栏同款描边、渐变玻璃底、圆角与阴影。
- hover 只把描边转为淡粉，删除上一版引入的 `--row-hover` / `--row-current` 变量。

## [v1.5.1] — 2026-11-03

- 「当前登录」栏由 84px 收紧到 70px，头像 46px → 38px，昵称 14.5px → 13.5px。
- 曾把账号列表改为无框列表行（后续 v1.5.2 撤回）。

## [v1.5.0] — 2026-11-03

- 移除面板顶部 logo 与标题整块，刷新按钮并入工具栏并靠右。
- 「当前登录」栏由 54px 放大到 84px，头像 28px → 46px，昵称与 UID 字号提升，用于吸收移除头部后腾出的竖向空间。

## [v1.4.2] — 2026-11-03

### 修复

- 按钮 hover 上的 `filter: brightness()` 会形成独立渲染层，截断同页其他玻璃面板的 `backdrop-filter` 采样，表现为「鼠标悬停按钮时所有卡片突然变暗」。
- 改用 `::before` 半透明白色覆盖层 + `opacity` 过渡，彻底不使用 `filter`。

## [v1.4.1] — 2026-11-03

- 降低模糊半径：深色 20px → 12px、浅色 18px → 12px，toast 14px → 9px，确认遮罩 5px → 3px。
- 同步把 `--glass` 透明度由 .55/.68 提到 .58/.70，补偿模糊变浅后文字对比度下降。

## [v1.4.0] — 2026-11-03

- 新增「液态玻璃」主题：背景层由 4 个缓慢漂移的彩色光斑与噪点构成，面板通过 `backdrop-filter` 取其折射感。
- 指针跟随高光由 `--gx` / `--gy` 驱动 `radial-gradient`，用 `requestAnimationFrame` 节流。
- 浅色与深色两套独立变量；深色玻璃使用深色半透明填充并压暗背景，避免变成奶白雾导致浅色文字糊掉。

## [v1.3.1] — 2026-11-03

### 修复

- 「当前登录」栏里昵称与 UID 同处一行，长昵称会盖住 UID。改为 `.cur-info` 纵向两行，文本容器同时加 `min-width: 0` 与 `overflow: hidden`，两行均带省略号。

## [v1.3.0] — 2026-11-03

- 面板由整页标签改为工具栏弹出面板：新增 `popup.html` / `popup.css`，删除 `accounts.html` / `accounts.css`。
- **关键修复**：弹窗内调用原生 `confirm()` / `alert()` 会导致弹窗失焦并被浏览器立即关闭；改为自绘确认遮罩，支持 Esc / Enter。
- 头像 `alt` 置空，避免头像缺失时把昵称当替代文字撑变形。
- 头像菜单入口优先尝试 `chrome.action.openPopup()`（Chromium 127+），不支持时退化为独立小窗口。

## [v1.2.0] — 2026-11-03

### 修复与改进

- 切换后原有 B 站标签页留在旧账号、又新开一个标签页的问题。
- 新增 `refreshBiliTab`：查询已有 B 站标签页，排除面板自身，优先同窗口/当前活动/最近访问的一个标签页，激活并原地 `reload`。
- 切换成功后面板自行关闭，最终只保留用户原来的那一个标签页；仅在完全没有 B 站标签页时才新开一个。

## [v1.1.0] — 2026-11-03

### 修复

- 点击「登录新账号」后，`passport.bilibili.com/login` 在已登录状态下直接 302 回首页，导致只能保存一个账号。
- `beginAdd` 先 `fetchNav` + `saveCurrent()` 保底存档当前账号，把 4 个 Cookie 备份进 `storage.local.pendingAdd`，清除登录 Cookie 后再打开登录页。
- `finishPending(wait)` 检测到已登录且 4 个 Cookie 齐全即自动入库（`wait=true` 时轮询 6 × 800ms，因为 B 站 4 个 Cookie 并非同一瞬间落盘）。
- `chrome.cookies.onChanged` 监听 SESSDATA 写入即收尾，即使用户已关闭面板也能存上。
- `cancelAdd` 先清 pending 再回写备份，避免回写触发监听造成误判。

### 新增

- 面板新增「正在添加新账号」流程横幅，提供「打开登录页」与「恢复原账号」，pending 期间 2.5 秒轮询。

## [v1.0.0] — 2026-11-03

首个可用版本。

- 基于 Manifest V3，声明 `cookies`、`storage` 权限与 `*://*.bilibili.com/*` 主机权限。
- `content.js` 克隆头像菜单中「我的课程」的外层容器并替换文字，注入「切换账号」入口，不写死 B 站 CSS 类名。
- `background.js` 快照并还原 `SESSDATA` / `bili_jct` / `DedeUserID` / `DedeUserID__ckMd5` 四个 Cookie 实现切换。
- 切换前备份当前凭证，写入后校验失败自动回滚，避免被踢成未登录。
- 面板适配浅色 / 深色主题。
