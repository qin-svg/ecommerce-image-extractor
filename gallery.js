/**
 * 图库页：展示提取结果，支持全选 / 反选 / 批量转 PNG 下载。
 */
(function () {
  const grid = document.getElementById("grid");
  const emptyState = document.getElementById("empty-state");
  const sourceMeta = document.getElementById("source-meta");
  const selectedCount = document.getElementById("selected-count");
  const btnAll = document.getElementById("btn-all");
  const btnInvert = document.getElementById("btn-invert");
  const btnDownload = document.getElementById("btn-download");
  const mask = document.getElementById("progress-mask");
  const progressText = document.getElementById("progress-text");
  const progressBar = document.getElementById("progress-bar");
  const progressSub = document.getElementById("progress-sub");

  let images = [];

  // 本图库标签页的 tabId，用于过滤其他图库标签页的下载进度广播
  let selfTabId = null;
  chrome.tabs.getCurrent((tab) => {
    selfTabId = tab && tab.id;
  });

  function checkboxes() {
    return [...grid.querySelectorAll('input[type="checkbox"]')];
  }

  function updateCount() {
    const boxes = checkboxes();
    const selected = boxes.filter((box) => box.checked).length;
    selectedCount.textContent = "已选 " + selected + " / " + boxes.length;
    btnDownload.disabled = selected === 0;
  }

  function render(payload) {
    images = (payload && payload.images) || [];
    grid.innerHTML = "";

    if (payload && payload.sourceTitle) {
      sourceMeta.textContent =
        payload.sourceTitle + (payload.sourceUrl ? " · " + payload.sourceUrl : "");
      sourceMeta.title = payload.sourceUrl || "";
    } else {
      sourceMeta.textContent = "来自最近一次提取";
    }

    if (!images.length) {
      emptyState.classList.remove("hidden");
      updateCount();
      return;
    }

    emptyState.classList.add("hidden");

    images.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "card";

      const thumb = document.createElement("div");
      thumb.className = "thumb-wrap";
      const img = document.createElement("img");
      img.alt = item.alt || "商品图 " + (index + 1);
      img.loading = "lazy";
      // 仅允许 http/https 与 data:image 前缀，防止渲染非法 URL
      img.src = /^(https?:|data:image\/)/i.test(item.url || "") ? item.url : "";
      img.addEventListener("load", () => {
        const size = card.querySelector(".size");
        if (size && (!item.width || !item.height)) {
          size.textContent = img.naturalWidth + " × " + img.naturalHeight;
        }
      });
      img.addEventListener("error", () => {
        img.replaceWith(Object.assign(document.createElement("span"), { textContent: "无法预览" }));
      });
      thumb.appendChild(img);

      const foot = document.createElement("div");
      foot.className = "card-foot";
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.url = item.url;
      box.addEventListener("change", updateCount);
      label.appendChild(box);
      label.appendChild(document.createTextNode("选择"));

      const size = document.createElement("span");
      size.className = "size";
      size.textContent =
        item.width && item.height ? item.width + " × " + item.height : "尺寸读取中";

      foot.appendChild(label);
      foot.appendChild(size);
      card.appendChild(thumb);
      card.appendChild(foot);
      grid.appendChild(card);
    });

    updateCount();
  }

  function allChecked() {
    const boxes = checkboxes();
    return boxes.length > 0 && boxes.every((box) => box.checked);
  }

  btnAll.addEventListener("click", () => {
    // 全部已选时点「全选」= 取消全选，否则全部选中
    const target = !allChecked();
    checkboxes().forEach((box) => {
      box.checked = target;
    });
    updateCount();
  });

  btnInvert.addEventListener("click", () => {
    checkboxes().forEach((box) => {
      box.checked = !box.checked;
    });
    updateCount();
  });

  function showProgress(visible) {
    mask.classList.toggle("hidden", !visible);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== "EIE_DOWNLOAD_PROGRESS") return;
    // 只显示发给本图库标签页的进度，其他图库标签页的下载进度不显示
    if (
      message.galleryTabId != null &&
      selfTabId != null &&
      message.galleryTabId !== selfTabId
    ) {
      return;
    }
    showProgress(true);
    if (message.phase === "start") {
      progressText.textContent = "开始下载 " + message.total + " 张图片";
      progressBar.style.width = "0%";
      progressSub.textContent = "";
    }
    if (message.phase === "item") {
      const pct = message.total ? Math.round((message.current / message.total) * 100) : 0;
      progressBar.style.width = pct + "%";
      progressText.textContent = "正在转换并下载 " + message.current + " / " + message.total;
      progressSub.textContent = message.filename || "";
    }
    if (message.phase === "done") {
      progressBar.style.width = "100%";
      progressText.textContent =
        "完成：成功 " + message.success + "，失败 " + message.failed;
      progressSub.textContent = (message.errors || []).slice(0, 3).join("；");
      setTimeout(() => showProgress(false), 1600);
    }
  });

  btnDownload.addEventListener("click", async () => {
    const urls = checkboxes()
      .filter((box) => box.checked)
      .map((box) => box.dataset.url);
    if (!urls.length) return;

    btnDownload.disabled = true;
    showProgress(true);
    progressText.textContent = "正在提交下载任务…";
    progressBar.style.width = "4%";

    try {
      const result = await chrome.runtime.sendMessage({
        type: "EIE_DOWNLOAD_SELECTED",
        urls,
      });
      if (!result || result.ok === false) {
        const total = result && result.total !== undefined ? result.total : urls.length;
        const success = result ? result.success || 0 : 0;
        const failed = result ? result.failed || total : total;
        const errors = (result && result.errors || []).slice(0, 5);
        const msg =
          failed > 0 && success > 0
            ? "部分下载完成：成功 " + success + " 张，失败 " + failed + " 张。"
            : failed > 0
            ? "下载失败（" + failed + " 张）。"
            : "下载完成。";
        const where =
          "\n文件保存在浏览器默认下载目录（文件名为 商品图_001.png 起）。" +
          "\n想保存到桌面：浏览器 设置 → 下载内容 → 更改位置，选择桌面（Chrome 安全限制，扩展无法直接指定路径）。";
        if (failed > 0) {
          alert(msg + where + (errors.length ? "\n" + errors.join("\n") : ""));
        } else if (success === total) {
          alert(msg + where);
        }
      }
    } catch (err) {
      alert("下载失败：" + (err.message || String(err)));
      showProgress(false);
    } finally {
      btnDownload.disabled = false;
      updateCount();
    }
  });

  chrome.runtime.sendMessage({ type: "EIE_GET_GALLERY" }).then((res) => {
    if (!res || !res.ok || !res.payload) {
      render(null);
      return;
    }
    render(res.payload);
  });
})();
