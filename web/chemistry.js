(() => {
  'use strict';

  const elements = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
    'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  const elementNames = new Map(elements.map(symbol => [symbol.toLowerCase(), symbol]));
  const taskNames = ['SP', 'Opt', 'Freq', 'IRC', 'IRCMax', 'Scan', 'Force', 'Stable', 'NMR', 'Polar', 'TD', 'BOMD', 'ADMP', 'Volume'];
  const decimal = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[dDeE][+-]?\d+)?$/;
  const bohr = 0.529177210903;

  function readElement(label, lineNumber, gaussian) {
    // Gaussian permits atom labels such as C1 and C(Fragment=2).
    let token = label;
    if (gaussian) token = label.replace(/\([^)]*\)$/, '').replace(/^([A-Za-z]{1,2})\d+$/, '$1');
    const element = /^\d+$/.test(token) ? elements[Number(token) - 1] : elementNames.get(token.toLowerCase());
    if (!element) throw new Error('第 ' + lineNumber + ' 行的元素标记无法识别（' + label + '）。请提供真实元素符号或原子序数。');
    return element;
  }

  function readAtom(label, coords, lineNumber, scale, gaussian) {
    const element = readElement(label, lineNumber, gaussian);
    const values = coords.map(v => decimal.test(v) ? Number(v.replace(/d/i, 'e')) * scale : NaN);
    if (values.length !== 3 || !values.every(Number.isFinite)) {
      throw new Error('第 ' + lineNumber + ' 行需要三个有限数值作为笛卡尔坐标。');
    }
    return {element, x: values[0], y: values[1], z: values[2]};
  }

  function integer(text, label, min = -Infinity) {
    if (!/^[+-]?\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) < min) {
      throw new Error(label + '无效，请检查输入中的整数值。');
    }
    return Number(text);
  }

  function readTitleFields(comment) {
    const values = new Map();
    const assignment = /(?:^|\s)([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    for (const m of comment.matchAll(assignment)) values.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4]);
    return values;
  }

  function xyzLayout(properties) {
    const parts = properties.split(':');
    const layout = {element: -1, position: -1, width: 0};
    if (parts.length % 3 !== 0) throw new Error('XYZ 的 Properties 列定义不完整。');
    for (let i = 0; i < parts.length; i += 3) {
      const [name, type, size] = parts.slice(i, i + 3);
      const n = integer(size, 'Properties 列宽', 1);
      if ((name === 'species' && type === 'S' || name === 'Z' && type === 'I') && n === 1) layout.element = layout.width;
      if (name === 'pos' && type === 'R' && n === 3) layout.position = layout.width;
      layout.width += n;
    }
    if (layout.element < 0 || layout.position < 0) throw new Error('XYZ 的 Properties 需要元素列（species 或 Z）和三维坐标列（pos:R:3）。');
    return layout;
  }

  function parseXYZ(result, lines) {
    const n = integer(lines[0].trim(), 'XYZ 首行原子数', 1);
    if (lines.length < n + 2) throw new Error('XYZ 首行声明了 ' + n + ' 个原子，请检查注释行和坐标行数。');
    result.title = lines[1].trim();
    const kv = readTitleFields(lines[1]);
    for (const field of ['method', 'basis', 'solvent', 'solventModel']) result[field] = kv.get(field.toLowerCase()) || null;
    const requested = kv.get('calculation') ?? kv.get('tasks') ?? kv.get('task');
    if (requested) {
      result.taskOptions = routeTokens(requested).filter(token => token !== '+');
      result.tasks = result.taskOptions.map(token => token.split(/[=(]/)[0]);
    }
    if (kv.has('charge')) result.charge = integer(kv.get('charge'), '电荷');
    const mult = kv.get('multiplicity') ?? kv.get('mult');
    if (mult !== undefined) result.multiplicity = integer(mult, '多重度', 1);
    const unit = (kv.get('units') || 'angstrom').toLowerCase();
    if (!['angstrom', 'angstroms', 'å', 'bohr', 'au'].includes(unit)) throw new Error('XYZ 的坐标单位无法识别（' + unit + '）。');
    const scale = ['bohr', 'au'].includes(unit) ? bohr : 1;
    const layout = kv.has('properties') ? xyzLayout(kv.get('properties')) : {element: 0, position: 1, width: 4};
    if (kv.has('lattice')) result.warnings.push('原始文件包含晶胞信息。预览只显示给定坐标中的原子。');
    for (let i = 2; i < n + 2; i++) {
      const fields = lines[i].trim().split(/\s+/);
      if (fields.length < layout.width) throw new Error('XYZ 声明了 ' + n + ' 个原子，第 ' + (i + 1) + ' 行的坐标数据不完整。');
      result.atoms.push(readAtom(fields[layout.element], fields.slice(layout.position, layout.position + 3), i + 1, scale, false));
    }
    const trailing = lines.slice(n + 2).find(line => line.trim());
    if (trailing) {
      if (/^\s*\d+\s*$/.test(trailing)) throw new Error('检测到多帧 XYZ，请先截取要用于任务的单个构型。');
      throw new Error('XYZ 首行声明了 ' + n + ' 个原子，但坐标区后还有内容。请核对原子数。');
    }
  }

  function routeTokens(route) {
    // Gaussian options may contain commas, whitespace and nested parentheses.
    const clean = route.replace(/^#\s*[pnt](?=\s|$)/i, '').replace(/^#/, '').replace(/\s*=\s*/g, '=').replace(/\s*\/\s*/g, '/');
    let depth = 0, word = '';
    const words = [];
    for (const c of clean) {
      if (depth === 0 && /[\s,]/.test(c)) {
        if (word) words.push(word);
        word = '';
      } else {
        word += c;
        if (c === '(') depth++;
        if (c === ')') depth--;
      }
      if (depth < 0) throw new Error('Gaussian 路由行括号不匹配。');
    }
    if (depth !== 0) throw new Error('Gaussian 路由行括号不匹配。');
    if (word) words.push(word);
    return words;
  }

  function parseRoute(result) {
    const words = routeTokens(result.route);
    for (const word of words) {
      const keyword = word.split(/[=(]/)[0].toLowerCase();
      const task = taskNames.find(t => t.toLowerCase() === keyword);
      if (task) {
        if (!result.tasks.includes(task)) result.tasks.push(task);
        result.taskOptions.push(word);
      }
      if (keyword === 'scrf') {
        const options = word.slice(4).replace(/^[=(]+|\)+$/g, '').split(',').map(s => s.trim());
        const model = options.find(s => /^(?:smd|cpcm|iefpcm|pcm|ipcm|scipcm|dipole|isodensity|cosmors|onsager)$/i.test(s));
        result.solventModel = model || null;
        const solvent = options.find(s => /^solvent=/i.test(s));
        result.solvent = solvent?.slice(8) || null;
      }
      // A slash inside IOp(...) or a method option never divides theory and basis.
      let level = 0, split = -1;
      for (let i = 0; i < word.length; i++) {
        if (word[i] === '(') level++;
        if (word[i] === ')') level--;
        if (level === 0 && word[i] === '/') { split = i; break; }
      }
      if (split > 0 && !word.includes('=') && word.slice(split + 1)) {
        result.method = word.slice(0, split);
        result.basis = word.slice(split + 1);
      }
    }
    // Gaussian also accepts methods and basis sets as separate keywords.
    if (!result.method) result.method = words.find(w => /^(?:[RU]?(?:HF|MP[2345](?:\([^)]*\))?|CCSD(?:\(T\))?|B3LYP|PBE1PBE|PBE0|PBEPBE|BLYP|CAM-B3LYP|wB97X-?D|M06(?:2X|-2X|-L)?|BP86|TPSSh?)|ROHF|AM1|PM[367]|MNDO|GFN2-?xTB|G[234]|CBS-QB3)$/i.test(w)) || null;
    if (!result.basis) result.basis = words.find(w => /^(?:gen(?:ecp)?|chkbasis|sto-\d+g|[346]-\d+[+]*g(?:\*+|\([^)]*\))?|(?:aug-)?cc-p[\w-]+|def2[\w-]+|sdd|lanl2dz)$/i.test(w)) || null;
    return words;
  }

  function parseGaussian(result, allLines) {
    const next = allLines.findIndex(line => /^\s*--link1--\s*$/i.test(line));
    const lines = next < 0 ? allLines : allLines.slice(0, next);
    if (next >= 0) result.warnings.push('检测到 Link1 多步作业。当前表单显示第一步，源文件保留全部计算步骤。');
    let i = 0;
    const skipSpace = () => { while (i < lines.length && !lines[i].trim()) i++; };
    const block = () => {
      const start = i;
      while (i < lines.length && lines[i].trim()) i++;
      return lines.slice(start, i);
    };
    skipSpace();
    while (i < lines.length && /^\s*[%!]/.test(lines[i])) {
      const opt = /^\s*%([\w-]+)(?:\s*=\s*(.*))?\s*$/.exec(lines[i++]);
      if (opt) result.link0[opt[1].toLowerCase()] = opt[2]?.trim() || '';
      skipSpace();
    }
    if (!lines[i]?.trimStart().startsWith('#')) throw new Error('GJF/COM 缺少以 # 开头的 Gaussian 路由行。');
    result.route = block().map(s => s.trim()).join(' ');
    const words = parseRoute(result);
    if (words.some(w => /^geom(?:=|\()(?:\()?[^)]*\b(?:allcheck|check|checkpoint|step)\b/i.test(w))) {
      throw new Error('此作业从检查点文件读取几何结构，请提供带显式笛卡尔坐标的 GJF 或 XYZ。');
    }
    if (words.some(w => /^oniom\b/i.test(w))) throw new Error('ONIOM 输入包含多层原子信息，请从所需层导出笛卡尔 XYZ。');
    skipSpace();
    result.title = block().map(s => s.trim()).join(' ');
    skipSpace();
    const chargeLine = (lines[i++] || '').trim().split(/[\s,]+/);
    if (chargeLine.length < 2 || chargeLine.length % 2) throw new Error('标题后需要独立的电荷和多重度行，例如 0 1。');
    const states = [];
    for (let j = 0; j < chargeLine.length; j += 2) {
      states.push({charge: integer(chargeLine[j], '电荷'), multiplicity: integer(chargeLine[j + 1], '多重度', 1)});
    }
    Object.assign(result, states[0]);
    if (states.length > 1) result.fragmentStates = states.slice(1);
    const useBohr = words.some(w => /^units(?:=|\()\(?[^)]*\b(?:bohr|au)\b/i.test(w));
    const scale = useBohr ? bohr : 1;
    while (i < lines.length && lines[i].trim()) {
      const lineNumber = i + 1, line = lines[i++].trim();
      const match = /^([A-Za-z0-9]+(?:\([^)]*\))?)[\s,]+(.+)$/.exec(line);
      if (!match) throw new Error('第 ' + lineNumber + ' 行需要笛卡尔坐标。请先将 Z 矩阵或自定义原子标记转换为 XYZ。');
      const fields = match[2].trim().split(/[\s,]+/);
      let freeze;
      if (fields.length === 4 && /^[+-]?\d+$/.test(fields[0])) freeze = integer(fields.shift(), '原子冻结标志');
      const atom = readAtom(match[1], fields, lineNumber, scale, true);
      if (freeze !== undefined) atom.freeze = freeze;
      result.atoms.push(atom);
    }
    if (!result.atoms.length) throw new Error('缺少显式笛卡尔坐标。请检查标题、电荷多重度行和空行。');
    result.additionalInput = lines.slice(i).join('\n').trim();
    if (useBohr) result.warnings.push('输入为 Bohr 坐标。结构预览与派生坐标使用 Å，源文件保留原单位。');
    if (result.additionalInput) result.warnings.push('源文件保留坐标后的附加输入，包括其中的基组、赝势、连接或约束定义。');
  }

  function parse(filename, raw) {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('文件为空，请选择含坐标的 GJF、COM 或 XYZ 文件。');
    const ext = String(filename).split('.').pop().toLowerCase();
    const lines = raw.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const result = {
      filename, raw, title: '', format: ext, atoms: [], method: null, basis: null, solvent: null,
      solventModel: null, charge: null, multiplicity: null, units: 'angstrom', route: '', tasks: [], taskOptions: [],
      link0: Object.create(null), additionalInput: '', warnings: []
    };
    if (ext === 'xyz') parseXYZ(result, lines);
    else if (ext === 'gjf' || ext === 'com') parseGaussian(result, lines);
    else throw new Error('请选择扩展名为 .gjf、.com 或 .xyz 的文件。');
    return result;
  }

  globalThis.Chemistry = Object.freeze({parse});
})();
