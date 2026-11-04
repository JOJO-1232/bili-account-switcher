## v1.5.8

B站账号切换器当前稳定版本。基于 Manifest V3，适配 Microsoft Edge、Google Chrome 及其他 Chromium 内核浏览器。

### 本版内容

- 恢复工具栏弹出面板形态，回退实验性的页面内浮层方案。
- 账号卡片与状态框改为直角，与方形弹窗对应；按钮、状态标签与头像保持圆润。
- 修正窄视口下确认框的验证方式，避免把浏览器最小窗口宽度的测试假象误判为溢出。
- 完整迭代记录见仓库 [CHANGELOG.md](https://github.com/JOJO-1232/bili-account-switcher/blob/main/CHANGELOG.md)。

### 安装

1. 下载下方 `bili-account-switcher-v1.5.8.zip`，解压到一个长期保留的固定目录。
2. 打开 `edge://extensions`（Edge）或 `chrome://extensions`（Chrome），开启开发者模式。
3. 点击「加载解压缩的扩展」/「加载已解压的扩展程序」，选择解压后的文件夹。
4. 建议把扩展图标固定到工具栏。

> 升级时覆盖原解压目录，再到扩展管理页点击「重新加载」，已保存的账号不会丢失。

### 完整性校验

| 项目 | 值 |
| --- | --- |
| 文件 | `bili-account-switcher-v1.5.8.zip` |
| 大小 | 21,210 字节 |
| SHA-256 | `76a4b0490e1394f93dafdeea23a7cc9c1109313b06998e27d6e2cd74d04d5fd5` |
| 包内文件 | 10 个（`manifest.json`、`popup.html`、`popup.css`、`accounts.js`、`background.js`、`content.js`、`icons/` 下 4 个 PNG） |

### 说明

- 登录凭证仅保存在本机 `chrome.storage.local`，不上传任何服务器，也没有后端服务。
- 本项目为**非官方**个人作品，与哔哩哔哩官方无任何关联、授权或背书关系。
