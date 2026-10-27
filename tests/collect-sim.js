/**
 * 用最小 DOM mock 跑 collectProductImages，验证 img / srcset / data-src / 背景图 / 过滤。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
const start = src.indexOf("function collectProductImages");
const end = src.indexOf("\nfunction mergeImages");
if (start < 0 || end < 0) {
  console.error("无法从 background.js 截取 collectProductImages");
  process.exit(1);
}
const fnSrc = src.slice(start, end);

function El(tag, attrs, styleBg) {
  this.tagName = tag.toUpperCase();
  this.attrs = attrs || {};
  this.dataset = {};
  this.alt = attrs.alt || "";
  this.src = attrs.src || "";
  this.currentSrc = attrs.currentSrc || attrs.src || "";
  this.width = attrs.width || 0;
  this.height = attrs.height || 0;
  this.naturalWidth = attrs.naturalWidth || attrs.width || 0;
  this.naturalHeight = attrs.naturalHeight || attrs.height || 0;
  this.clientWidth = attrs.clientWidth || attrs.width || 0;
  this.clientHeight = attrs.clientHeight || attrs.height || 0;
  this.styleBg = styleBg || "";
  Object.keys(attrs).forEach((key) => {
    if (key.startsWith("data-")) {
      const camel = key
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = attrs[key];
    }
  });
}
El.prototype.getAttribute = function (name) {
  return this.attrs[name] || null;
};

const imgs = [
  new El("img", {
    src: "https://img.alicdn.com/imgextra/i1/product.jpg_50x50.jpg",
    width: 800,
    height: 800,
    alt: "sku",
  }),
  new El("img", {
    src: "https://img.alicdn.com/favicon.ico",
    width: 16,
    height: 16,
  }),
  new El("img", {
    "data-src": "https://img10.360buyimg.com/n5/s54x54_jfs/t1/big.jpg",
    width: 400,
    height: 400,
  }),
  new El("img", {
    src: "https://example.com/logo-header.png",
    width: 200,
    height: 80,
  }),
];

const sources = [
  new El("source", {
    srcset: "https://img.pddpic.com/a.jpeg?imageView2/2/w/100/q/85 1x",
  }),
];

const lazy = [
  new El(
    "div",
    { "data-src": "https://img.alicdn.com/imgextra/i2/detail.jpg" },
    'url("https://img.alicdn.com/imgextra/i3/bg.jpg")'
  ),
];
lazy[0].clientWidth = 500;
lazy[0].clientHeight = 500;
lazy[0].tagName = "DIV";

const document = {
  baseURI: "https://item.taobao.com/item.htm",
  querySelectorAll(sel) {
    if (sel === "img") return imgs;
    if (sel === "source") return sources;
    return lazy;
  },
};

const context = {
  document,
  URL,
  getComputedStyle() {
    return { backgroundImage: lazy[0].styleBg };
  },
};
vm.createContext(context);
vm.runInContext(fnSrc + "\nthis.__result = collectProductImages();", context);
const result = context.__result;
const urls = result.map((x) => x.url);
console.log(JSON.stringify(urls, null, 2));

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("OK  :", msg);
}

assert(urls.some((u) => u.endsWith("/product.jpg")), "提取并还原淘宝主图");
assert(urls.every((u) => !u.includes("favicon")), "过滤 favicon");
assert(urls.some((u) => u.includes("360buyimg") && u.includes("/n1/") && !u.includes("s54x54")), "京东懒加载图");
assert(urls.some((u) => u.includes("pddpic.com") && !u.includes("imageView2")), "srcset + 拼多多参数");
assert(urls.some((u) => u.endsWith("/detail.jpg")), "data-src 背景容器");
assert(urls.some((u) => u.endsWith("/bg.jpg")), "background-image");
assert(urls.every((u) => !/logo-header/i.test(u)), "过滤 logo 文件名");
console.log("collect 模拟全部通过，共", urls.length, "张");
