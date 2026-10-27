/**
 * Service Worker：扫描所有 frame 的商品图、打开图库、跨域拉取并转为 PNG 后下载。
 */

const STORAGE_KEY = "eie_gallery";
// 提取结果仅保留最近 MAX_GALLERIES 次，防止 storage 无限增长
const MAX_GALLERIES = 5;
const MIN_EDGE = 100;

/** 注入到页面（含 iframe）中执行，必须自包含、无闭包外变量 */
function collectProductImages() {
  const MIN = 100;
  const seen = new Set();
  const results = [];

  function absUrl(raw) {
    if (!raw || typeof raw !== "string") return "";
    const trimmed = raw.trim().replace(/^["']|["']$/g, "");
    if (!trimmed || trimmed === "about:blank" || trimmed === "none") return "";
    if (trimmed.startsWith("data:")) return trimmed;
    try {
      return new URL(trimmed, document.baseURI).href;
    } catch {
      return "";
    }
  }

  function parseSrcset(value) {
    if (!value) return [];
    return String(value)
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  /** 尽量还原淘宝 / 京东 / 拼多多 CDN 原图 */
  function upgradeImageUrl(url) {
    if (!url || url.startsWith("data:")) return url;
    let next = url;

    // 淘宝/天猫：foo.jpg_50x50.jpg、foo.jpg_400x400q90.jpg.webp、foo_50x50.jpg
    next = next.replace(/(\.(?:jpe?g|png|webp|gif))_[^/?#]+/gi, "$1");
    next = next.replace(/_\d+x\d+(q\d+)?(?=\.(?:jpe?g|png|webp|gif))/gi, "");

    try {
      const u = new URL(next);
      const host = u.hostname;

      if (/360buyimg\.com|ddimg\.cn/i.test(host)) {
        u.pathname = u.pathname.replace(/\/s\d+x\d+_/i, "/");
        u.pathname = u.pathname.replace(/\/n[1-9]\//i, "/n1/");
        next = u.toString();
      }

      if (/pddpic\.com|yangkeduo/i.test(host)) {
        next = next.replace(/[?&](imageView2|imageMogr2)\/[^?#]*/gi, "");
        next = next.replace(/[?&]$/, "");
      }
    } catch {
      /* 保持 next */
    }

    return next.split("#")[0];
  }

  function isTinyPlaceholder(url) {
    if (url.startsWith("data:image/gif;base64,R0lGODlhAQAB")) return true;
    if (url.startsWith("data:image/svg")) return true;
    return false;
  }

  function shouldSkipUrl(url) {
    if (!url) return true;
    if (isTinyPlaceholder(url)) return true;
    if (/\.svg(\?|$)/i.test(url)) return true;
    if (
      /sprite|favicon|icon[-_./]|\/icons?\/|logo[-_./]|placeholder|1x1|pixel\.|blank\.gif|loading\.gif|spacer|qrcode|qr[-_]?code|captcha|watermark/i.test(
        url
      )
    ) {
      return true;
    }
    return false;
  }

  function add(raw, width, height, alt) {
    const upgraded = upgradeImageUrl(absUrl(raw));
    if (shouldSkipUrl(upgraded)) return;

    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w > 0 && h > 0 && w < MIN && h < MIN) return;
    if (w > 0 && h === 0 && w < MIN) return;
    if (h > 0 && w === 0 && h < MIN) return;

    const key = upgraded.startsWith("data:") ? upgraded : upgraded.split("?")[0];
    if (seen.has(key) || seen.has(upgraded)) return;
    seen.add(key);
    seen.add(upgraded);

    results.push({
      url: upgraded,
      width: w,
      height: h,
      alt: alt || "",
    });
  }

  document.querySelectorAll("img").forEach((img) => {
    const w =
      img.naturalWidth ||
      img.width ||
      parseInt(img.getAttribute("width"), 10) ||
      0;
    const h =
      img.naturalHeight ||
      img.height ||
      parseInt(img.getAttribute("height"), 10) ||
      0;
    const candidates = [
      img.currentSrc,
      img.src,
      img.getAttribute("src"),
      img.dataset.src,
      img.dataset.lazySrc,
      img.dataset.lazyloadSrc,
      img.dataset.original,
      img.dataset.ksLazyload,
      img.dataset.lazy,
      img.dataset.img,
      img.dataset.lazyImg,
      img.dataset.image,
      img.dataset.big,
      img.dataset.pic,
      img.getAttribute("data-src"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("data-lazyload"),
      img.getAttribute("lazy-src"),
      img.getAttribute("data-init-src"),
    ];
    parseSrcset(img.getAttribute("srcset")).forEach((u) => candidates.push(u));
    parseSrcset(img.dataset.srcset).forEach((u) => candidates.push(u));
    candidates.forEach((u) => add(u, w, h, img.alt || ""));
  });

  document.querySelectorAll("source").forEach((source) => {
    parseSrcset(source.getAttribute("srcset")).forEach((u) => add(u, 0, 0, ""));
    add(source.getAttribute("src"), 0, 0, "");
  });

  const lazySelector = [
    "[data-src]",
    "[data-lazy-src]",
    "[data-original]",
    "[data-ks-lazyload]",
    "[data-lazy]",
    "[data-img]",
    "[style*='background']",
    "[style*='Background']",
  ].join(",");

  document.querySelectorAll(lazySelector).forEach((el) => {
    if (el.tagName === "IMG" || el.tagName === "SOURCE") return;
    [
      el.dataset.src,
      el.dataset.lazySrc,
      el.dataset.original,
      el.dataset.ksLazyload,
      el.dataset.lazy,
      el.dataset.img,
      el.getAttribute("data-src"),
    ].forEach((u) => add(u, el.clientWidth, el.clientHeight, ""));

    try {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none") {
        const re = /url\((['"]?)(.*?)\1\)/gi;
        let match;
        while ((match = re.exec(bg))) {
          add(match[2], el.clientWidth, el.clientHeight, "");
        }
      }
    } catch {
      /* 跨域 style 忽略 */
    }
  });

  return results;
}

function mergeImages(frameResults) {
  const seen = new Set();
  const merged = [];
  for (const item of frameResults) {
    if (!item || !item.url) continue;
    const key = item.url.startsWith("data:") ? item.url : item.url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

async function extractFromTab(tabId) {
  let injected;
  try {
    // 详情描述常在跨域 iframe 中；若某个 frame 无权限会导致整次注入失败
    injected = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: collectProductImages,
    });
  } catch {
    injected = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectProductImages,
    });
  }
  const lists = (injected || [])
    .filter((entry) => entry && !entry.error)
    .map((entry) => entry.result || [])
    .flat();
  return mergeImages(lists);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    // 固定 this 绑定，避免大文件时 String.fromCharCode.apply 超调用栈
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 按 CDN 域名给出防盗链友好的 Referer，避免被 403 拦截 */
function refererForUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (/alicdn\.com|taobaocdn\.com|tbcdn\.cn/i.test(host)) return "https://www.taobao.com/";
    if (/360buyimg\.com|ddimg\.cn/i.test(host)) return "https://item.jd.com/";
    if (/pddpic\.com|yangkeduo/i.test(host)) return "https://mobile.yangkeduo.com/";
  } catch {
    /* 无法解析的 URL 不带 Referer */
  }
  return "";
}

/** 网络抖动 / 偶发 5xx 时最多重试 attempts 次 */
async function fetchImageWithRetry(url, init, attempts) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      lastErr = new Error("HTTP " + response.status);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
  }
  throw lastErr;
}

/** 在 Service Worker 中拉取图片并转为 PNG，规避页面 canvas 污染。 */
async function urlToPngBlob(url) {
  const init = { credentials: "omit", cache: "default" };
  const referer = refererForUrl(url);
  if (referer) {
    // 部分 CDN 防盗链校验 Referer；不再设 no-referrer，避免被当成爬虫 403
    init.referrer = referer;
    init.referrerPolicy = "no-referrer-when-downgrade";
  }
  const response = await fetchImageWithRetry(url, init, 3);
  const blob = await response.blob();

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // Service Worker 里没有 Image 元素可兜底，SVG/HEIC 等不支持的格式直接报错
    throw new Error("图片解码失败（可能为 SVG/HEIC 等不支持的格式）");
  }
  try {
    if (bitmap.width < MIN_EDGE && bitmap.height < MIN_EDGE) {
      throw new Error("图片尺寸过小");
    }
    // 单边超过 4096 的超大图等比缩小，避免 OffscreenCanvas 栅格化失败
    const MAX_DIM = 4096;
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    return { pngBlob, width: w, height: h };
  } finally {
    bitmap.close();
  }
}

async function downloadPngBlob(pngBlob, filename) {
  // MV3 Service Worker 里 blob: objectURL 传给 downloads API 常报 ERR_INVALID_URL，
  // 直接转 data: URL 交付，可靠性最高
  const base64 = arrayBufferToBase64(await pngBlob.arrayBuffer());
  await chrome.downloads.download({
    url: "data:image/png;base64," + base64,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
}

function padIndex(index) {
  // 超过 999 张时继续扩展位数（1000 -> "1000"），不再截断
  return String(index).padStart(index > 999 ? 4 : 3, "0");
}

async function openGallery(tab, images) {
  const record = {
    sourceUrl: tab.url || "",
    sourceTitle: tab.title || "",
    images,
    createdAt: Date.now(),
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: record });
  // 只保留最近 MAX_GALLERIES 次，避免图库数据堆积占满 storage
  await pruneGalleryRecords();
  await chrome.tabs.create({
    url: chrome.runtime.getURL("gallery.html"),
    openerTabId: tab.id,
  });
}

/** 删除 eie_gallery_* 中较旧的记录，只留最近 MAX_GALLERIES 条 */
async function pruneGalleryRecords() {
  const all = await chrome.storage.local.get(null);
  const candidates = Object.keys(all).filter((k) => k.startsWith("eie_gallery_"));
  if (candidates.length <= MAX_GALLERIES) return;
  const withTime = candidates.map((k) => ({
    key: k,
    at: (all[k] && all[k].createdAt) || 0,
  }));
  withTime.sort((a, b) => a.at - b.at); // 最旧在前
  const toRemove = withTime
    .slice(0, candidates.length - MAX_GALLERIES)
    .map((x) => x.key);
  await chrome.storage.local.remove(toRemove);
}

async function handleExtract(tab) {
  if (!tab || !tab.id) throw new Error("找不到当前标签页");
  const images = await extractFromTab(tab.id);
  if (!images.length) {
    throw new Error("没有找到符合尺寸要求的商品图片");
  }
  await openGallery(tab, images);
  return { ok: true, count: images.length };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "EIE_EXTRACT_AND_OPEN") {
    const tab = sender.tab;
    handleExtract(tab)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message.type === "EIE_GET_GALLERY") {
    chrome.storage.local.get(STORAGE_KEY).then((data) => {
      sendResponse({ ok: true, payload: data[STORAGE_KEY] || null });
    });
    return true;
  }

  if (message.type === "EIE_DOWNLOAD_SELECTED") {
    const urls = Array.isArray(message.urls) ? message.urls : [];
    downloadSelected(urls, sender.tab && sender.tab.id)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await handleExtract(tab);
  } catch (err) {
    if (tab && tab.id) {
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: (text) => alert(text),
          args: ["获取图片失败：" + (err.message || String(err))],
        })
        .catch(() => {});
    }
  }
});

async function notifyProgress(galleryTabId, payload) {
  try {
    // 图库是扩展页而非 content script，tabs.sendMessage 到不了；
    // 只能 runtime 广播，附带 galleryTabId 让图库页自行过滤
    await chrome.runtime.sendMessage({
      type: "EIE_DOWNLOAD_PROGRESS",
      galleryTabId: galleryTabId || null,
      ...payload,
    });
  } catch {
    /* 图库尚未监听时忽略 */
  }
}

async function downloadSelected(urls, galleryTabId) {
  const total = urls.length;
  let success = 0;
  let failed = 0;
  const errors = [];

  await notifyProgress(galleryTabId, {
    phase: "start",
    current: 0,
    total,
    success,
    failed,
  });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = "商品图_" + padIndex(i + 1) + ".png";
    await notifyProgress(galleryTabId, {
      phase: "item",
      current: i + 1,
      total,
      success,
      failed,
      filename,
    });
    try {
      const { pngBlob } = await urlToPngBlob(url);
      await downloadPngBlob(pngBlob, filename);
      success += 1;
    } catch (err) {
      failed += 1;
      errors.push(filename + ": " + (err.message || String(err)));
    }
  }

  const result = { ok: failed === 0, success, failed, total, errors };
  await notifyProgress(galleryTabId, { phase: "done", ...result });
  return result;
}
