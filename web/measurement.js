(() => {
  'use strict';

  const definition = {
    id: 'bond-length',
    name: '键长测量',
    description: '测量指定两个原子在输入构型中的距离（Å）。',
    instructions: '读取 calculation.json 中 task_options 的 first 和 second。按 structure.xyz 原子记录从 1 开始编号，计算这两个原子在给定笛卡尔坐标中的直线距离，单位为 Å。使用输入构型，无需优化。',
    fields: [
      {key: 'first', label: '第一个原子编号', englishLabel: 'First atom index', type: 'number', required: true},
      {key: 'second', label: '第二个原子编号', englishLabel: 'Second atom index', type: 'number', required: true}
    ]
  };

  function atomIndex(value, count) {
    const n = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isSafeInteger(n) || n < 1 || n > count) {
      throw new Error('原子编号须为 1 至 ' + count + ' 的整数。');
    }
    return n;
  }

  function evaluate(structure, values) {
    const atoms = structure?.atoms;
    if (!Array.isArray(atoms) || atoms.length < 2) throw new Error('键长测量至少需要两个原子。');
    const first = atomIndex(values?.first, atoms.length);
    const second = atomIndex(values?.second, atoms.length);
    if (first === second) throw new Error('请指定两个不同的原子编号。');
    const a = atoms[first - 1], b = atoms[second - 1];
    const distance = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    if (!Number.isFinite(distance)) throw new Error('所选原子的距离超出可表示范围，请检查坐标。');

    // Resolve atoms from the normalized XYZ at oracle runtime.
    const oracle = [
      'def solve(inputs):',
      '    import math',
      '    rows = (inputs / "structure.xyz").read_text(encoding="utf-8").splitlines()[2:]',
      '    def point(index):',
      '        return [float(value) for value in rows[index - 1].split()[1:4]]',
      '    return math.dist(point(' + first + '), point(' + second + '))',
      ''
    ].join('\n');
    return {expected: String(distance), oracle};
  }

  globalThis.Measurement = Object.freeze({definition, evaluate});
})();
