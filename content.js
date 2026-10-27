/**
 * 商品详情页悬浮按钮：仅在淘宝 / 京东 / 拼多多商家版详情页显示。
 * 点击后通知 Service Worker 扫描所有 frame 并打开图库页。
 */
(function () {
  const BUTTON_ID = "eie-extract-btn";

  function hostMatches(suffixes) {
    const host = location.hostname.toLowerCase();
    return suffixes.some((s) => host === s || host.endsWith("." + s));
  }

  /** 是否为支持的商品详情页（含部分商家后台详情/编辑页） */
  function isProductDetailPage() {
    const path = location.pathname || "";
    const href = location.href || "";
    const hash = location.hash || "";
    const search = location.search || "";
    const combined = path + search + hash;

    if (hostMatches(["taobao.com", "tmall.com", "tmall.hk"])) {
      return /item\.htm|\/item\/|\/detail|world\/item/i.test(combined);
    }

    if (hostMatches(["jd.com", "jd.hk"])) {
      return (
        /item\.jd|npcitem\.jd|item\.m\.jd/i.test(href) ||
        /\/product\/|\/\d+\.html/i.test(path) ||
        /sku=|wareId=/i.test(search)
      );
    }

    if (hostMatches(["pinduoduo.com", "yangkeduo.com"])) {
      return /goods|detail|sku|product|item|official/i.test(combined);
    }

    return false;
  }

  function removeButton() {
    const el = document.getElementById(BUTTON_ID);
    if (el) el.remove();
  }

  function ensureButton() {
    if (!isProductDetailPage()) {
      removeButton();
      return;
    }
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "获取图片";
    btn.addEventListener("click", onClick);
    document.documentElement.appendChild(btn);
  }

  async function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    const btn = event.currentTarget;
    if (btn.classList.contains("is-busy")) return;
    btn.classList.add("is-busy");
    btn.textContent = "提取中";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "EIE_EXTRACT_AND_OPEN",
        pageTitle: document.title || "",
        pageUrl: location.href,
      });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || "提取失败");
      }
    } catch (err) {
      console.warn("[电商图片提取]", err);
      alert("提取图片失败：" + (err && err.message ? err.message : String(err)));
    } finally {
      btn.classList.remove("is-busy");
      btn.textContent = "获取图片";
    }
  }

  ensureButton();

  // SPA / 局部刷新场景：地址变化时增删按钮。
  // 仅用事件监听（history API 覆盖 pushState/replaceState/popstate），
  // 不用永不停止的 setInterval 轮询。
  let lastHref = location.href;
  const sync = () => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      ensureButton();
    }
  };

  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);
  history.pushState = function (...args) {
    const result = nativePush(...args);
    sync();
    return result;
  };
  history.replaceState = function (...args) {
    const result = nativeReplace(...args);
    sync();
    return result;
  };
  window.addEventListener("popstate", sync);
  window.addEventListener("hashchange", sync);
})();
