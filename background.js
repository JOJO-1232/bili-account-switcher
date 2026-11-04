/**
 * B站账号切换器 - 后台服务
 *
 * 原理：B站的登录态由 4 个 Cookie 承载（SESSDATA / bili_jct / DedeUserID / DedeUserID__ckMd5）。
 * 切换账号 = 把这 4 个 Cookie 替换成目标账号保存的那一份。
 * Cookie 只保存在本机浏览器本地存储，不上传任何服务器。
 */

const LOGIN_KEYS = ['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5'];
const BILI_DOMAIN = 'bilibili.com';
const NAV_API = 'https://api.bilibili.com/x/web-interface/nav';
const PENDING_KEY = 'pendingAdd';

/* ---------- 基础工具 ---------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cookieUrl(c) {
  const host = String(c.domain || '').replace(/^\./, '');
  const path = c.path || '/';
  return 'https://' + host + (path.charAt(0) === '/' ? path : '/' + path);
}

async function fetchNav() {
  try {
    const res = await fetch(NAV_API, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.code === 0 && json.data && json.data.isLogin) {
      return {
        mid: String(json.data.mid),
        uname: json.data.uname || ('UID ' + json.data.mid),
        face: json.data.face || ''
      };
    }
  } catch (err) {
    console.warn('[bili-switcher] nav 获取失败', err);
  }
  return null;
}

async function readLoginCookies() {
  const all = await chrome.cookies.getAll({ domain: BILI_DOMAIN });
  return all
    .filter((c) => LOGIN_KEYS.indexOf(c.name) !== -1 && c.value)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
      expirationDate: c.expirationDate
    }));
}

async function clearLoginCookies() {
  const all = await chrome.cookies.getAll({ domain: BILI_DOMAIN });
  for (const c of all) {
    if (LOGIN_KEYS.indexOf(c.name) === -1) continue;
    try {
      await chrome.cookies.remove({ url: cookieUrl(c), name: c.name });
    } catch (err) {
      console.warn('[bili-switcher] 删除 Cookie 失败', c.name, err);
    }
  }
}

async function writeCookies(list) {
  for (const c of list) {
    const details = {
      url: cookieUrl(c),
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: c.sameSite,
      domain: c.domain
    };
    if (c.expirationDate) details.expirationDate = c.expirationDate;
    try {
      await chrome.cookies.set(details);
    } catch (err) {
      console.warn('[bili-switcher] 写入 Cookie 失败', c.name, err);
    }
  }
}

async function getAccounts() {
  const data = await chrome.storage.local.get('accounts');
  return data.accounts || {};
}

async function setAccounts(accounts) {
  await chrome.storage.local.set({ accounts });
}

async function getPending() {
  const data = await chrome.storage.local.get(PENDING_KEY);
  return data[PENDING_KEY] || null;
}

async function setPending(p) {
  if (p) await chrome.storage.local.set({ [PENDING_KEY]: p });
  else await chrome.storage.local.remove(PENDING_KEY);
}

/* ---------- 业务逻辑 ---------- */

async function saveCurrent() {
  const nav = await fetchNav();
  if (!nav) return { ok: false, error: '当前浏览器未登录B站，请先登录' };

  const cookies = await readLoginCookies();
  const hasSess = cookies.some((c) => c.name === 'SESSDATA');
  if (!hasSess) return { ok: false, error: '没有取到登录凭证（SESSDATA），请刷新B站页面后重试' };

  const accounts = await getAccounts();
  accounts[nav.mid] = {
    mid: nav.mid,
    uname: nav.uname,
    face: nav.face,
    cookies,
    updatedAt: Date.now()
  };
  await setAccounts(accounts);
  return { ok: true, account: { mid: nav.mid, uname: nav.uname, face: nav.face } };
}

/**
 * 结束「添加账号」流程：一旦检测到浏览器已登录，就把这个账号存进列表。
 * wait=true 时会多等几拍，等 B站 把 4 个 Cookie 全部下发完（它们不是同一瞬间落盘的）。
 */
let finishing = false;
async function finishPending(wait) {
  if (finishing) return null;
  const pending = await getPending();
  if (!pending) return null;

  finishing = true;
  try {
    const rounds = wait ? 6 : 1;
    let nav = null;
    let cookies = [];
    let complete = false;
    for (let i = 0; i < rounds; i++) {
      nav = await fetchNav();
      cookies = await readLoginCookies();
      const names = cookies.map((c) => c.name);
      complete = LOGIN_KEYS.every((k) => names.indexOf(k) !== -1);
      if (nav && complete) break;
      if (i < rounds - 1) await sleep(800);
    }
    // 还没登录、或登录 Cookie 尚未下发完整，都继续等下一次检查
    if (!nav || !complete) return null;

    const accounts = await getAccounts();
    const isNew = !pending.from || String(pending.from.mid) !== String(nav.mid);
    accounts[nav.mid] = {
      mid: nav.mid,
      uname: nav.uname,
      face: nav.face,
      cookies: cookies.length ? cookies : (accounts[nav.mid] || {}).cookies || [],
      updatedAt: Date.now()
    };
    await setAccounts(accounts);
    await setPending(null);
    return {
      added: { mid: nav.mid, uname: nav.uname, face: nav.face },
      reused: !isNew
    };
  } finally {
    finishing = false;
  }
}

/**
 * 开始添加账号。
 *
 * 关键点：B站登录页在「已登录」状态下会直接跳回首页，根本没有输入框。
 * 所以这里必须先把当前登录态摘下来，登录页才会显示二维码/密码表单。
 * 摘之前先把当前账号完整存档（含 Cookie 备份），保证随时能恢复。
 */
async function beginAdd() {
  const before = await fetchNav();
  let from = null;
  if (before) {
    from = { mid: before.mid, uname: before.uname, face: before.face };
    await saveCurrent(); // 保底：先存住当前账号，绝不丢
  }

  const backup = await readLoginCookies();
  await setPending({ from, backup, at: Date.now() });
  await clearLoginCookies();

  try {
    await chrome.tabs.create({ url: 'https://passport.bilibili.com/login' });
  } catch (err) {
    console.warn('[bili-switcher] 打开登录页失败', err);
  }

  return { ok: true, from, hadBackup: backup.length > 0 };
}

/** 放弃添加，把刚才摘下来的登录态原样装回去 */
async function cancelAdd() {
  const pending = await getPending();
  if (!pending) return { ok: false, error: '当前没有正在进行的添加操作' };

  await clearLoginCookies();
  await setPending(null);
  if (pending.backup && pending.backup.length) await writeCookies(pending.backup);

  const current = await fetchNav();
  return { ok: true, current };
}

async function listAll() {
  const fin = await finishPending(false);
  const accounts = await getAccounts();
  const pending = await getPending();
  const current = await fetchNav();
  return {
    ok: true,
    current,
    accounts: Object.values(accounts).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    pending: pending ? { from: pending.from || null, at: pending.at || 0 } : null,
    added: fin ? fin.added : null,
    reused: !!(fin && fin.reused)
  };
}

async function switchTo(mid, panelTabId) {
  mid = String(mid);
  let accounts = await getAccounts();
  const target = accounts[mid];
  if (!target) return { ok: false, error: '账号记录不存在' };

  // 若此时正处在「添加账号」流程里，切换本身已经确定了登录态，直接结束该流程
  await setPending(null);

  // 切换前留一份当前凭证：既用于刷新「当前账号」的存档，也作为失败回滚的备份，
  // 万一目标账号已过期可以原地回滚，不会把你踢成未登录
  const before = await fetchNav();
  const backup = await readLoginCookies();
  if (before && accounts[before.mid] && String(before.mid) !== mid && backup.length) {
    accounts[before.mid].cookies = backup;
    accounts[before.mid].updatedAt = Date.now();
    await setAccounts(accounts);
  }

  await clearLoginCookies();
  await writeCookies(target.cookies);

  const after = await fetchNav();
  if (!after || String(after.mid) !== mid) {
    await clearLoginCookies();
    await writeCookies(backup);
    const who = after ? '当前仍是「' + after.uname + '」' : '已回滚到切换前的账号';
    return {
      ok: false,
      error: '切换失败：该账号的登录凭证可能已过期，请重新登录该账号后保存。' + who
    };
  }

  // 服务端可能下发了新的 SESSDATA，回写保存
  const fresh = await readLoginCookies();
  if (fresh.length) {
    accounts = await getAccounts();
    if (accounts[mid]) {
      accounts[mid].cookies = fresh;
      accounts[mid].updatedAt = Date.now();
      await setAccounts(accounts);
    }
  }

  // 把用户原有的 B站 标签页在原处刷新，而不是另开一个新标签页
  const moved = await refreshBiliTab(panelTabId);
  return { ok: true, account: after, reused: moved.reused };
}

/**
 * 切换完成后让「原有的 B站 标签页」原地变成新账号。
 * 不开新标签页、也不把面板自己变成 B站，避免最后留下两个 B站 标签页。
 */
async function refreshBiliTab(panelTabId) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['*://*.bilibili.com/*'] });
  } catch (err) {
    console.warn('[bili-switcher] 查询标签页失败', err);
    return { reused: false };
  }

  tabs = tabs.filter(
    (t) =>
      t.id !== panelTabId &&
      /^https?:\/\/([a-z0-9-]+\.)*bilibili\.com(\/|$)/i.test(t.url || '')
  );
  if (!tabs.length) return { reused: false };

  // 优先同窗口内的 B站 标签页（面板通常就开在旁边），再选当前活动的，最后按最近访问排序
  let panelWin = null;
  if (panelTabId != null) {
    try {
      const panelTab = await chrome.tabs.get(panelTabId);
      panelWin = panelTab ? panelTab.windowId : null;
    } catch (e) { /* 面板可能已关闭，忽略 */ }
  }
  const sameWin = panelWin == null ? [] : tabs.filter((t) => t.windowId === panelWin);
  const pool = sameWin.length ? sameWin : tabs;

  const target =
    pool.find((t) => t.active) ||
    pool.slice().sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

  try {
    await chrome.tabs.update(target.id, { active: true });
    if (target.windowId != null) {
      try {
        await chrome.windows.update(target.windowId, { focused: true });
      } catch (e) { /* 窗口可能已关闭，忽略 */ }
    }
    await chrome.tabs.reload(target.id);
  } catch (err) {
    console.warn('[bili-switcher] 刷新标签页失败', err);
    return { reused: false };
  }

  return { reused: true, tabId: target.id };
}

async function removeAccount(mid) {
  mid = String(mid);
  const accounts = await getAccounts();
  delete accounts[mid];
  await setAccounts(accounts);
  return { ok: true };
}

/* ---------- 消息路由 · 面板入口 ---------- */

const handlers = {
  // 点菜单里的「切换账号」时，尽量直接弹出工具栏小窗（和点图标一致）；
  // 旧版浏览器不支持 action.openPopup 时，退化成一个小 popup 窗口，同样不是整页标签。
  openPanel: async () => {
    try {
      if (chrome.action && typeof chrome.action.openPopup === 'function') {
        await chrome.action.openPopup();
        return { ok: true, mode: 'popup' };
      }
    } catch (err) {
      console.warn('[bili-switcher] openPopup 不可用，改用小窗口', err);
    }
    try {
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 384,
        height: 620
      });
    } catch (err) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    }
    return { ok: true, mode: 'window' };
  },
  openBiliTab: async () => {
    await chrome.tabs.create({ url: 'https://www.bilibili.com/' });
    return { ok: true };
  },
  openLogin: () => beginAdd(),
  openLoginTab: async () => {
    await chrome.tabs.create({ url: 'https://passport.bilibili.com/login' });
    return { ok: true };
  },
  cancelAdd: () => cancelAdd(),
  list: () => listAll(),
  saveCurrent: () => saveCurrent(),
  switch: (msg, sender) => switchTo(msg.mid, sender && sender.tab ? sender.tab.id : null),
  // 面板完成使命后自行关闭，只留用户原有的 B站 标签页
  closeSelf: async (msg, sender) => {
    // 面板自己占了一个标签页时才允许关标签页；页面内子框架（frameId > 0）绝不动标签页
    const inSubFrame = sender && typeof sender.frameId === 'number' && sender.frameId > 0;
    if (!inSubFrame && sender && sender.tab && sender.tab.id != null) {
      try {
        await chrome.tabs.remove(sender.tab.id);
      } catch (err) { /* 标签页可能已被用户关掉 */ }
    }
    return { ok: true };
  },
  remove: (msg) => removeAccount(msg.mid)
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = msg && handlers[msg.type];
  if (!fn) return false;
  Promise.resolve()
    .then(() => fn(msg, sender))
    .then((res) => sendResponse(res))
    .catch((err) => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true;
});

// 登录成功后 B站 会写入 SESSDATA，这里立刻收尾存档 —— 即使用户关掉了面板也能存上
chrome.cookies.onChanged.addListener((info) => {
  if (info.removed) return;
  if (info.cookie.name !== 'SESSDATA') return;
  if (String(info.cookie.domain).indexOf(BILI_DOMAIN) === -1) return;
  finishPending(true).catch((err) => console.warn('[bili-switcher] 收尾失败', err));
});

chrome.action.onClicked.addListener(async () => {
  // 正常情况会由 manifest 的 default_popup 接管，不会走到这里；
  // 仅在默认弹窗被禁用时兜底。
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 384,
      height: 620
    });
  } catch (err) { /* ignore */ }
});
