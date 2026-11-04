/**
 * B站账号切换器 - 页面注入脚本
 *
 * 做法：找到头像下拉菜单里的「我的课程」菜单项，克隆它的外层容器（因此能完整继承
 * B站自己的类名、内边距、hover 效果和图标），改掉文字后插到它后面。
 * 这样无需写死任何 B站 的 CSS 类名，B站改版也不容易失效。
 */

(function () {
  'use strict';

  var MARK = 'data-bili-ac-switch';
  var SOURCE_TEXT = '我的课程';
  var BUTTON_TEXT = '切换账号';
  var THROTTLE_MS = 250;

  var timer = null;

  function rootsToScan() {
    var list = [document];
    try {
      var host = document.querySelector('#bili-header') || document.querySelector('bili-header');
      if (host && host.shadowRoot) list.push(host.shadowRoot);
    } catch (e) { /* ignore */ }
    return list;
  }

  function findSourceAnchor() {
    var roots = rootsToScan();
    for (var i = 0; i < roots.length; i++) {
      var root = roots[i];
      var links = root.querySelectorAll ? root.querySelectorAll('a') : [];
      var j;
      for (j = 0; j < links.length; j++) {
        if (links[j].childElementCount === 0 && links[j].textContent.trim() === SOURCE_TEXT) {
          return links[j];
        }
      }
      for (j = 0; j < links.length; j++) {
        if (links[j].textContent.trim() === SOURCE_TEXT) return links[j];
      }
    }
    return null;
  }

  function pickContainer(anchor) {
    var node = anchor;
    for (var depth = 0; depth < 5; depth++) {
      var parent = node.parentElement;
      if (!parent || parent === document.body) break;
      // 只有当前容器内仅含一个链接时才继续上溯，避免把整个菜单列表一起克隆
      if (parent.querySelectorAll('a').length !== 1) break;
      node = parent;
    }
    return node;
  }

  function replaceText(root, from, to) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var changed = false;
    var node;
    while ((node = walker.nextNode())) {
      if ((node.nodeValue || '').trim() === from) {
        node.nodeValue = (node.nodeValue || '').replace(from, to);
        changed = true;
      }
    }
    return changed;
  }

  function onSwitchClick(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      chrome.runtime.sendMessage({ type: 'openPanel' });
    } catch (err) {
      // 扩展被重载后旧的 content script 会失效，提示用户刷新
      console.warn('[bili-switcher] 扩展上下文已失效，请刷新页面', err);
    }
  }

  function inject() {
    if (document.querySelector('[' + MARK + ']')) return true;

    var anchor = findSourceAnchor();
    if (!anchor) return false;

    var container = pickContainer(anchor);
    var parent = container.parentElement;
    if (!parent) return false;

    var clone = container.cloneNode(true);
    clone.setAttribute(MARK, '1');
    clone.style.cursor = 'pointer';

    if (!replaceText(clone, SOURCE_TEXT, BUTTON_TEXT)) {
      clone.textContent = BUTTON_TEXT;
    }

    var links = clone.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].removeAttribute('href');
      links[i].removeAttribute('target');
      links[i].removeAttribute('rel');
      links[i].style.cursor = 'pointer';
    }

    clone.addEventListener('click', onSwitchClick, true);
    parent.insertBefore(clone, container.nextSibling);
    return true;
  }

  function scheduleInject() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      inject();
    }, THROTTLE_MS);
  }

  function inHeader(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !el.closest) return false;
    return !!el.closest('#bili-header, .bili-header, bili-header');
  }

  function start() {
    inject();

    // 头像菜单挂在顶部导航内，只在头部发生变化时才立即检查，避免首页无限滚动
    // 反复触发表格卡片新增而导致的全量扫描。
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        if (!added || !added.length) continue;
        for (var j = 0; j < added.length; j++) {
          if (inHeader(added[j])) {
            scheduleInject();
            return;
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 兜底：若菜单被挂到 body 下而非头部内，靠低频轮询补上（约有标记时开销可忽略）
    setInterval(function () {
      if (!document.hidden) inject();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
