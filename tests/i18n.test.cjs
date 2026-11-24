const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "web/i18n.js"), "utf8");
function fresh(storage = new Map()) {
  const context = vm.createContext({localStorage:{
    getItem:key => storage.get(key), setItem:(key, value) => storage.set(key, value)
  }});
  vm.runInContext(source, context);
  return context.ChemI18n;
}
function element(tag, attrs = {}) {
  return {
    nodeType:1, tag, attrs:{...attrs}, childNodes:[],
    hasAttribute(key) { return Object.hasOwn(this.attrs, key); },
    getAttribute(key) { return this.attrs[key]; },
    setAttribute(key, value) { this.attrs[key] = value; },
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector.split(", ").some(key => key === node.tag || (key === "[data-no-i18n]" && node.hasAttribute("data-no-i18n")))) return node;
      }
      return null;
    },
    add(...children) {
      for (const child of children) { child.parentElement = this; this.childNodes.push(child); }
    }
  };
}
const text = data => ({nodeType:3, data});

test("Chinese default, persisted English, forced lookup, whitespace and data-safe substitutions", () => {
  const storage = new Map(), api = fresh(storage);
  assert.equal(api.lang, "zh");
  assert.equal(api.t("计算方法"), "计算方法");
  assert.equal(api.t(" 编辑 ", "en"), " Edit ");
  api.set("en");
  assert.equal(fresh(storage).lang, "en");
  assert.equal(api.t("13 个原子"), "13 atoms");
  assert.equal(api.t("材料文件重名：用户文件.xyz"), "Duplicate supporting filename: 用户文件.xyz");
  assert.equal(api.t("未收录的原文"), "未收录的原文");
  api.set("invalid");
  assert.equal(api.lang, "en");
  api.set("zh");
  assert.equal(fresh(storage).lang, "zh");
});

test("DOM labels and accessibility attributes switch back after dynamic updates, preserving raw content", () => {
  const api = fresh();
  const card = element("article"), button = element("button", {title:"全屏观察"}), caption = text(" 编辑 ");
  const user = element("span", {"data-no-i18n":""}), raw = element("pre");
  user.add(text("计算参数")); raw.add(text("任务配置")); button.add(caption);
  card.add(button, user, raw);
  api.set("en"); api.render(card);
  assert.equal(caption.data, " Edit ");
  assert.equal(button.getAttribute("title"), "Fullscreen");
  assert.equal(user.childNodes[0].data, "计算参数");
  assert.equal(raw.childNodes[0].data, "任务配置");
  caption.data = "计算方法"; button.setAttribute("title", "退出全屏");
  api.render(card);
  assert.equal(caption.data, "Method");
  api.set("zh"); api.render(card);
  assert.equal(caption.data, "计算方法");
  assert.equal(button.getAttribute("title"), "退出全屏");
});

test("shipped UI exposes both language buttons and loads dictionaries before the application", () => {
  const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
  assert.match(html, /id="language-switch"/);
  assert.match(html, /data-lang="zh"/);
  assert.match(html, /data-lang="en"/);
  const names = Array.from(html.matchAll(/<script src="([^"]+)"/g), m => m[1]);
  assert.deepEqual(names.slice(0, 3), ["i18n.js", "i18n-chem.js", "i18n-task.js"]);
  assert.ok(names.indexOf("core.js") > 2 && names.at(-1) === "app.js");
});
