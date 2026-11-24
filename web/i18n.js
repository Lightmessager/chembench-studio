"use strict";
globalThis.ChemI18n = (() => {
  const key = "chembench.studio.language";
  const dictionary = new Map();
  const patterns = [];
  const originals = new WeakMap();
  const attributes = ["title", "aria-label", "placeholder"];
  const excluded = "script, style, pre, code, textarea, [data-no-i18n], #file-name, #model-file, #formula, #legend, #coords tbody, .treeitem";
  let language = "zh";
  try {
    if (globalThis.localStorage?.getItem(key) === "en") language = "en";
  } catch { /* The interface also works if browser storage is disabled. */ }

  function add(entries, rules = []) {
    for (const [source, english] of Object.entries(entries)) dictionary.set(source, english);
    patterns.push(...rules);
  }
  function t(source, target = language) {
    if (target !== "en" || typeof source !== "string") return source;
    const text = source.trim();
    if (!text || !/[\u3400-\u9fff]/u.test(text)) return source;
    let translated = dictionary.get(text);
    if (translated === undefined && text.endsWith(" *")) {
      const base = dictionary.get(text.slice(0, -2));
      if (base !== undefined) translated = base + " *";
    }
    if (translated === undefined) {
      for (const [pattern, replacement] of patterns) {
        pattern.lastIndex = 0;
        if (!pattern.test(text)) continue;
        pattern.lastIndex = 0;
        translated = text.replace(pattern, replacement);
        break;
      }
    }
    return translated === undefined ? source : source.slice(0, source.indexOf(text)) + translated + source.slice(source.indexOf(text) + text.length);
  }
  function localize(node, property, read, write) {
    const current = read();
    if (!current) return;
    const record = originals.get(node);
    const previous = record?.[property];
    const source = previous && current === previous.rendered ? previous.source : current;
    const rendered = t(source);
    if (previous || rendered !== current) {
      const next = record || Object.create(null);
      next[property] = {source, rendered};
      originals.set(node, next);
    }
    if (rendered !== current) write(rendered);
  }
  function render(node = globalThis.document) {
    if (!node) return;
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(excluded)) return;
      localize(node, "text", () => node.data, v => { node.data = v; });
      return;
    }
    if (node.nodeType === 1) {
      if (node.closest("[data-no-i18n]")) return;
      for (const attr of attributes) {
        if (node.hasAttribute(attr)) localize(node, attr, () => node.getAttribute(attr), v => node.setAttribute(attr, v));
      }
      if (node.closest(excluded)) return;
    }
    for (const child of node.childNodes) render(child);
  }
  function synchronize(doc) {
    doc.documentElement.lang = language === "en" ? "en" : "zh-CN";
    for (const button of doc.querySelectorAll("#language-switch [data-lang]")) {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    }
    render(doc);
  }
  function set(next) {
    if (next !== "en" && next !== "zh") return;
    language = next;
    try { globalThis.localStorage?.setItem(key, next); } catch { /* Private browsing. */ }
    if (globalThis.document) {
      synchronize(document);
      window.dispatchEvent(new CustomEvent("chembench:languagechange", {detail:{language}}));
    }
  }
  function start(doc) {
    for (const button of doc.querySelectorAll("#language-switch [data-lang]")) {
      button.addEventListener("click", () => set(button.dataset.lang));
    }
    synchronize(doc);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) render(node);
        } else if (mutation.type === "attributes") {
          const el = mutation.target, attr = mutation.attributeName;
          if (!el.closest("[data-no-i18n]")) localize(el, attr, () => el.getAttribute(attr), v => el.setAttribute(attr, v));
        } else render(mutation.target);
      }
    });
    observer.observe(doc.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attributes});
  }
  add({
    "Chembench Studio · 化学任务工作台":"Chembench Studio · Chemistry task workbench",
    "工作流程":"Workflow", "工作空间":"Workspace", "结构工作台":"Structure", "任务配置":"Task setup",
    "打包导出":"Export", "使用指南":"User guide", "本地工作空间":"Local workspace",
    "离线模式":"Offline", "界面语言":"Interface language", "项目文件":"Project files",
    "检查分子结构与计算参数，为基准测试准备输入。":"Inspect the structure and calculation settings for your task.",
    "导入结构":"Import structure", "分子视图":"Molecule", "结构视图":"Structure view",
    "模型":"Model", "坐标":"Coordinates", "原文":"Source", "球棍模型":"Ball and stick",
    "三维分子球棍模型，可用方向键旋转，加减键缩放":"3D molecule. Rotate with the arrow keys and zoom with plus or minus.",
    "切换球棍或空间填充模型":"Switch between ball-and-stick and space-filling models",
    "拖动旋转 · 滚轮缩放":"Drag to rotate · Scroll to zoom", "缩小":"Zoom out", "放大":"Zoom in", "复位视角":"Reset view",
    "计算参数":"Calculation settings", "编辑":"Edit", "Gaussian 路由":"Gaussian route",
    "输入文件":"Input file", "替换文件":"Replace file", "拖入结构文件，或":"Drop a structure file or ", "浏览文件":"browse",
    "编写测试要求，定义参考答案与评分条件。":"Write the task and define the reference answers and grading criteria.",
    "预览任务包":"Preview package", "任务定义":"Task definition", "任务名称":"Task title", "任务标识":"Task ID",
    "任务类型":"Task type", "导入类型定义":"Import task type", "给答题者的要求":"Participant instructions",
    "评分依据":"Reference and grading", "评分标准":"Grading rule", "数值 · 容差判定":"Numeric · Absolute tolerance",
    "完整构型 · 对齐 RMSD":"Geometry · Aligned RMSD", "导入规则 JSON":"Import rule JSON",
    "保存规则":"Save rule", "AI 编写格式":"Rule format for AI", "参考数值":"Reference value", "答案单位":"Answer unit",
    "如 Eh、cm⁻¹，无量纲可留空":"e.g. Eh or cm⁻¹; leave blank if dimensionless", "绝对容差":"Absolute tolerance",
    "读取计算输出":"Read calculation output", "下载独立评分包":"Download grading kit",
    "Gaussian .log / .out、ORCA .out，或独立参考 XYZ。写入前可核对计算步、物理量与单位。":"Load a Gaussian or ORCA log, or a reference XYZ. Review the calculation step, property and units before saving.",
    "补充材料":"Supporting files", "随题分发的 UTF-8 文本，如参数表、拓扑或说明。":"Public UTF-8 text files such as parameter tables, topology files or notes.",
    "添加材料":"Add files", "选择目标框架，核对目录后下载测试任务。":"Select a framework and review the files before downloading your task.",
    "导出 ZIP":"Export ZIP", "目标框架":"Target framework", "打包预览":"Package preview", "关闭":"Close",
    "草稿恢复失败，已打开示例。可从项目文件恢复备份。":"The draft could not be restored. The example is open. Restore a backup from Project files.",
    "草稿已保存":"Draft saved", "请另存项目备份":"Save a project backup", "需要调整":"Action required",
    "XYZ 笛卡尔坐标":"XYZ Cartesian coordinates", "Gaussian 输入文件":"Gaussian input", "源文件未提供 Gaussian 路由":"No Gaussian route in this file",
    "计算方法":"Method", "基组":"Basis set", "溶剂 / 模型":"Solvent / model", "电荷 / 多重度":"Charge / multiplicity", "核":"cores",
    "计算任务":"Calculation tasks", "源文件资源":"Input resources", "未指定":"Unspecified",
    "超过 4000 个原子时以点云显示完整结构":"Structures with over 4,000 atoms are shown as a point cloud",
    "点云模型":"Point cloud", "元素":"Element", "上一页":"Previous", "下一页":"Next",
    "当前浏览器窗口限制了全屏显示。":"Fullscreen is unavailable in this browser window.",
    "全屏观察":"Fullscreen", "退出全屏":"Exit fullscreen", "空间填充":"Space filling",
    "请使用 UTF-8 编码的文本文件。":"Choose a UTF-8 encoded text file.", "选择的文件包含二进制数据。":"The selected file contains binary data.",
    "请一次拖入一个结构文件。":"Drop one structure file at a time.",
    "这里填写本题采用的参数，导出时写入 calculation.json。原始路由可在「原文」中核对。":"These task settings are exported in calculation.json. Review the original route in Source.",
    "溶剂":"Solvent", "溶剂模型":"Solvent model", "电荷":"Charge", "自旋多重度":"Spin multiplicity",
    "计算任务 / 选项":"Calculation tasks / options", "应用参数":"Apply settings",
    "电荷须为整数，多重度须为正整数。":"Charge must be an integer and multiplicity must be a positive integer.",
    "编辑计算参数":"Edit calculation settings", "由结构计算":"Calculated from the structure", "移除":"Remove",
    "此任务类型 ID 已存在。":"This task type ID already exists.", "类型已添加，可在列表中选择":"Task type added to the list",
    "已生成任务 ZIP":"Task ZIP created", "当前项目":"Current project", "保存项目 JSON":"Save project JSON", "打开项目":"Open project",
    "项目使用了未知的导出框架。":"This project uses an unknown export framework.", "项目已恢复":"Project restored",
    "导入 GJF、COM 或单帧 XYZ 后，在分子视图中拖动旋转，或切换到坐标与原文核对输入。连线由原子间距估算。":"Import a GJF, COM or single-frame XYZ. Drag the model to rotate it, or switch to Coordinates and Source to inspect the input. Bonds are estimated from interatomic distances.",
    "在任务配置中选择评分标准，点击「读取计算输出」从 ORCA、Gaussian 或参考 XYZ 写入答案。「AI 编写格式」提供可移植规则示例。「下载独立评分包」可离线批改。打包导出支持四种目标框架。":"In Task setup, select a grading rule and use Read calculation output to import reference answers from ORCA, Gaussian or XYZ. Rule format for AI provides a portable example. Download a grading kit to score offline, or use Export to create a task for one of four frameworks.",
    "本工具在浏览器内离线处理文件。草稿保存在当前浏览器，项目 JSON 可在两台电脑间继续编辑。项目含私有答案，正式分发请使用目标框架的任务加载器。":"Files are processed offline in your browser. Drafts stay in this browser. Save a project JSON to continue editing on another computer. The project includes private answers. Distribute tasks through your framework’s task loader.",
    "任务类型支持 JSON 定义。发布包的 examples 目录中含有可直接导入的示例。":"You can define task types in JSON. Ready-to-import examples are in the release package’s examples directory."
  }, [
    [/^1 个原子$/, "1 atom"],
    [/^已读取 1 个原子$/, "Loaded 1 atom"],
    [/^(\d+) 个原子$/, "$1 atoms"],
    [/^已读取 (\d+) 个原子$/, "Loaded $1 atoms"],
    [/^(\d+) 个文件 · 点击路径查看内容$/, "$1 files · Select a path to view its contents"],
    [/^材料文件重名：(.*)$/s, "Duplicate supporting filename: $1"]
  ]);
  return Object.freeze({add, t, set, render, start, get lang() { return language; }});
})();
