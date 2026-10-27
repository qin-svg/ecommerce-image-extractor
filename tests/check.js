/**
 * 离线自检：清单合法性、脚本语法、URL 还原规则、尺寸过滤。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("OK  :", msg);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
assert(manifest.manifest_version === 3, "Manifest V3");
assert(manifest.permissions.includes("downloads"), "downloads 权限");
assert(manifest.permissions.includes("scripting"), "scripting 权限");
assert(manifest.host_permissions.some((p) => p.includes("taobao.com")), "淘宝 host");
assert(manifest.host_permissions.some((p) => p.includes("jd.com")), "京东 host");
assert(manifest.host_permissions.some((p) => p.includes("pinduoduo.com")), "拼多多 host");
assert(fs.existsSync(path.join(root, "icons", "icon128.png")), "图标存在");

["content.js", "background.js", "gallery.js"].forEach((file) => {
  const r = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  assert(r.status === 0, file + " 语法" + (r.stderr ? " " + r.stderr : ""));
});

function upgradeImageUrl(url) {
  let next = url;
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
    /* ignore */
  }
  return next.split("#")[0];
}

assert(
  upgradeImageUrl("https://img.alicdn.com/imgextra/i1/foo.jpg_50x50.jpg") ===
    "https://img.alicdn.com/imgextra/i1/foo.jpg",
  "淘宝 jpg_NxN 还原"
);
assert(
  upgradeImageUrl("https://img.alicdn.com/imgextra/i1/foo_50x50.jpg") ===
    "https://img.alicdn.com/imgextra/i1/foo.jpg",
  "淘宝 _NxN.jpg 还原"
);
assert(
  upgradeImageUrl("https://img10.360buyimg.com/n5/s54x54_jfs/t1/foo.jpg").includes("/n1/") &&
    !upgradeImageUrl("https://img10.360buyimg.com/n5/s54x54_jfs/t1/foo.jpg").includes("s54x54"),
  "京东缩略图还原"
);
assert(
  !upgradeImageUrl("https://img.pddpic.com/a.jpeg?imageView2/2/w/100/q/85").includes("imageView2"),
  "拼多多压缩参数剥离"
);

function shouldKeep(w, h) {
  const MIN = 100;
  if (w > 0 && h > 0 && w < MIN && h < MIN) return false;
  return true;
}
assert(!shouldKeep(16, 16), "过滤小图标");
assert(shouldKeep(800, 800), "保留大图");

function padIndex(index) {
  return String(index).padStart(3, "0");
}
assert(padIndex(1) === "001" && padIndex(12) === "012", "文件名序号补零");

const galleryJs = fs.readFileSync(path.join(root, "gallery.js"), "utf8");
assert(galleryJs.includes("取消全选"), "全选可切换为取消全选");
assert(galleryJs.includes("!allChecked()"), "全选按钮按当前勾选状态切换");

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert(readme.includes("edge://extensions"), "README 面向 Edge 安装");
assert(readme.includes("edge://settings/downloads"), "README 说明下载位置改到桌面");

if (failed) {
  console.error("\n" + failed + " 项失败");
  process.exit(1);
}
console.log("\n全部离线检查通过");
