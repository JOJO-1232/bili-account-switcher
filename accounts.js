/* B站账号切换器 - 面板逻辑 */

const state = {
  accounts: [],
  current: null,
  pending: null,
  busy: false
};

const el = {
  pendingBar: document.getElementById('pendingBar'),
  currentBar: document.getElementById('currentBar'),
  list: document.getElementById('list'),
  btnSave: document.getElementById('btnSave'),
  btnAdd: document.getElementById('btnAdd'),
  btnRefresh: document.getElementById('btnRefresh'),
  toast: document.getElementById('toast'),
  confirmMask: document.getElementById('confirmMask'),
  confirmText: document.getElementById('confirmText'),
  confirmOk: document.getElementById('confirmOk'),
  confirmCancel: document.getElementById('confirmCancel')
};

/* ---------- 页内确认框 ----------
 * 弹窗（browser action popup）里不能用原生 confirm/alert：
 * 一旦弹出系统对话框，弹窗就失焦并被浏览器立即关闭。所以这里自己画一个。
 */

let confirmResolve = null;

function askConfirm(text) {
  return new Promise((resolve) => {
    el.confirmText.textContent = text;
    el.confirmMask.hidden = false;
    confirmResolve = resolve;
    try { el.confirmOk.focus(); } catch (e) { /* ignore */ }
  });
}

function settleConfirm(val) {
  el.confirmMask.hidden = true;
  if (confirmResolve) {
    const fn = confirmResolve;
    confirmResolve = null;
    fn(val);
  }
}

el.confirmOk.addEventListener('click', () => settleConfirm(true));
el.confirmCancel.addEventListener('click', () => settleConfirm(false));
el.confirmMask.addEventListener('click', (e) => {
  if (e.target === el.confirmMask) settleConfirm(false);
});
document.addEventListener('keydown', (e) => {
  if (el.confirmMask.hidden) return;
  if (e.key === 'Escape') settleConfirm(false);
  if (e.key === 'Enter') settleConfirm(true);
});

/** 关闭面板：弹窗直接关自己；标签页形态下交给后台移除 */
function closePanel() {
  try { window.close(); } catch (e) { /* ignore */ }
  send({ type: 'closeSelf' });
}

/* ---------- 与后台通信 ---------- */

function send(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { ok: false, error: '后台无响应' });
        }
      });
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
}

/* ---------- 提示条 ---------- */

let toastTimer = null;
function toast(text, isError) {
  el.toast.textContent = text;
  el.toast.classList.toggle('error', !!isError);
  el.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
}

/* ---------- 渲染 ---------- */

function faceUrl(url) {
  if (!url) return '';
  return url.replace(/^http:\/\//, 'https://');
}

function avatarNode(url, name) {
  const img = document.createElement('img');
  img.className = 'avatar';
  img.referrerPolicy = 'no-referrer';
  // alt 留空：头像缺失时不会把昵称当作替代文字撑变形
  img.alt = '';
  img.title = name || '';
  if (url) img.src = faceUrl(url);
  return img;
}

function isSaved(mid) {
  return state.accounts.some((a) => a.mid === mid);
}

function renderCurrent() {
  el.currentBar.innerHTML = '';
  const cur = state.current;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = '当前登录';
  el.currentBar.appendChild(label);

  if (!cur) {
    const none = document.createElement('div');
    none.className = 'who';
    const info = document.createElement('div');
    info.className = 'cur-info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = '未登录';
    info.appendChild(name);
    none.appendChild(info);
    el.currentBar.appendChild(none);

    const hint = document.createElement('span');
    hint.className = 'tag gray';
    hint.textContent = '点下面的「登录新账号」';
    el.currentBar.appendChild(hint);
    return;
  }

  const who = document.createElement('div');
  who.className = 'who';
  who.appendChild(avatarNode(cur.face, cur.uname));

  // 昵称与 UID 上下两行，避免长昵称把 UID 挤到重叠
  const info = document.createElement('div');
  info.className = 'cur-info';

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = cur.uname;
  name.title = cur.uname;
  info.appendChild(name);

  const uidLine = document.createElement('div');
  uidLine.className = 'cur-uid';
  uidLine.textContent = 'UID ' + cur.mid;
  info.appendChild(uidLine);

  who.appendChild(info);
  el.currentBar.appendChild(who);

  if (!isSaved(cur.mid)) {
    const saveNow = document.createElement('button');
    saveNow.className = 'btn btn-primary';
    saveNow.style.marginLeft = 'auto';
    saveNow.style.padding = '5px 12px';
    saveNow.textContent = '保存此账号';
    saveNow.addEventListener('click', () => doSave());
    el.currentBar.appendChild(saveNow);
  } else {
    const ok = document.createElement('span');
    ok.className = 'tag';
    ok.style.marginLeft = 'auto';
    ok.textContent = '已保存';
    el.currentBar.appendChild(ok);
  }
}

function renderPending() {
  const bar = el.pendingBar;
  bar.innerHTML = '';

  if (!state.pending) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.classList.add('show');

  const icon = document.createElement('span');
  icon.className = 'p-icon';
  bar.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'p-body';

  const title = document.createElement('div');
  title.className = 'p-title';
  title.textContent = '正在添加新账号';
  body.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'p-desc';
  const fromName = state.pending.from ? state.pending.from.uname : '';
  if (fromName) {
    desc.textContent =
      '「' + fromName + '」的登录状态已暂存。请在新标签页登录另一个账号，完成后会自动加入列表，随时可点卡片切回。';
  } else {
    desc.textContent = '请在新标签页完成登录，完成后该账号会自动加入列表。';
  }
  body.appendChild(desc);

  bar.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'p-actions';

  const open = document.createElement('button');
  open.className = 'btn btn-ghost';
  open.style.padding = '5px 12px';
  open.textContent = '打开登录页';
  open.addEventListener('click', () => send({ type: 'openLoginTab' }));
  actions.appendChild(open);

  const cancel = document.createElement('button');
  cancel.className = 'btn btn-text';
  cancel.textContent = '恢复原账号';
  cancel.addEventListener('click', doCancelAdd);
  actions.appendChild(cancel);

  bar.appendChild(actions);
}

function renderList() {
  el.list.innerHTML = '';

  if (!state.accounts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML =
      '<strong>还没有保存任何账号</strong>' +
      '当前浏览器已登录的账号，点上面的「保存当前登录账号」即可加入列表。';
    el.list.appendChild(empty);
    return;
  }

  state.accounts.forEach((acc) => {
    const isCur = state.current && state.current.mid === acc.mid;

    const card = document.createElement('div');
    card.className = 'card' + (isCur ? ' is-current' : '');
    card.dataset.mid = acc.mid;

    card.appendChild(avatarNode(acc.face, acc.uname));

    const meta = document.createElement('div');
    meta.className = 'meta';

    const uname = document.createElement('div');
    uname.className = 'uname';
    uname.textContent = acc.uname;
    meta.appendChild(uname);

    const uid = document.createElement('div');
    uid.className = 'uid';
    uid.textContent = 'UID ' + acc.mid;
    meta.appendChild(uid);

    card.appendChild(meta);

    if (isCur) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '当前';
      card.appendChild(tag);
    }

    const del = document.createElement('button');
    del.className = 'del';
    del.type = 'button';
    del.textContent = '删除';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      doRemove(acc);
    });
    card.appendChild(del);

    card.addEventListener('click', () => {
      if (state.busy) return;
      if (isCur) {
        toast('已经是当前账号');
        return;
      }
      doSwitch(acc);
    });

    el.list.appendChild(card);
  });
}

/* ---------- 操作 ---------- */

let pollTimer = null;
function stopPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
function schedulePoll() {
  if (pollTimer) return;
  pollTimer = setTimeout(runPoll, 2500);
}
async function runPoll() {
  pollTimer = null;
  if (!state.pending || document.hidden) return;
  await refresh();
  schedulePoll();
}

async function refresh() {
  const res = await send({ type: 'list' });
  if (!res.ok) {
    toast(res.error || '读取账号失败', true);
    return;
  }
  state.accounts = res.accounts || [];
  state.current = res.current || null;
  state.pending = res.pending || null;

  renderPending();
  renderCurrent();
  renderList();

  if (res.added) {
    toast((res.reused ? '已更新：' : '已添加账号：') + res.added.uname);
  }

  if (state.pending) schedulePoll();
  else stopPoll();
}

async function doSave() {
  el.btnSave.disabled = true;
  const res = await send({ type: 'saveCurrent' });
  el.btnSave.disabled = false;

  if (res.ok) {
    toast('已保存：' + res.account.uname);
    await refresh();
  } else {
    toast(res.error || '保存失败', true);
  }
}

async function doSwitch(acc) {
  state.busy = true;
  const card = el.list.querySelector('.card[data-mid="' + acc.mid + '"]');
  if (card) card.classList.add('is-busy');
  toast('正在切换到 ' + acc.uname + ' …');

  const res = await send({ type: 'switch', mid: acc.mid });
  state.busy = false;

  if (res.ok) {
    toast('已切换到 ' + res.account.uname);
    setTimeout(() => {
      if (res.reused) {
        // 原有 B站 标签页已在原地刷新成新账号，面板自行关闭
        closePanel();
      } else {
        // 一个 B站 标签页都没有时，交给后台新开一个（弹窗随即失焦关闭）
        send({ type: 'openBiliTab' });
      }
    }, 700);
  } else {
    toast(res.error || '切换失败', true);
    if (card) card.classList.remove('is-busy');
    await refresh();
  }
}

async function doRemove(acc) {
  const yes = await askConfirm('从列表中删除「' + acc.uname + '」？\n（只是删除保存的凭证，不会退出该账号）');
  if (!yes) return;
  const res = await send({ type: 'remove', mid: acc.mid });
  if (res.ok) {
    toast('已删除');
    await refresh();
  } else {
    toast(res.error || '删除失败', true);
  }
}

async function doOpenLogin() {
  if (state.busy) return;

  if (state.pending) {
    await send({ type: 'openLoginTab' });
    toast('已打开登录页');
    return;
  }

  const cur = state.current;
  const tip = cur
    ? 'B站的登录页在已登录状态下会直接跳回首页，所以要先把当前登录摘下来，登录页才会出现输入框。\n\n' +
      '当前账号「' + cur.uname + '」会先自动保存，登录完新账号后可随时点卡片切回。'
    : '将打开B站登录页，登录完成后新账号会自动加入列表。';
  const yes = await askConfirm(tip);
  if (!yes) return;

  el.btnAdd.disabled = true;
  const res = await send({ type: 'openLogin' });
  el.btnAdd.disabled = false;

  if (!res.ok) {
    toast(res.error || '打开登录页失败', true);
    return;
  }

  toast('当前登录已暂存，请在登录页登录新账号');
  await refresh();
}

async function doCancelAdd() {
  const res = await send({ type: 'cancelAdd' });
  if (!res.ok) {
    toast(res.error || '恢复失败', true);
    return;
  }
  toast(res.current ? '已恢复：' + res.current.uname : '已取消');
  await refresh();
}

/* ---------- 液态玻璃：高光跟随指针 ---------- */

let sheenFrame = null;

document.addEventListener('pointermove', function (e) {
  const panel = e.target && e.target.closest
    ? e.target.closest('.card, .current-bar, .btn')
    : null;
  if (!panel || sheenFrame) return;

  const x = e.clientX;
  const y = e.clientY;
  sheenFrame = requestAnimationFrame(function () {
    sheenFrame = null;
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty('--gx', (x - rect.left) + 'px');
    panel.style.setProperty('--gy', (y - rect.top) + 'px');
  });
}, { passive: true });

/* ---------- 初始化 ---------- */

el.btnSave.addEventListener('click', doSave);
el.btnAdd.addEventListener('click', doOpenLogin);
el.btnRefresh.addEventListener('click', () => refresh());

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});

refresh();
