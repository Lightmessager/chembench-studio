(() => {
  'use strict';

  const symbols = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn ' +
    'Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu ' +
    'Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm ' +
    'Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  const elements = new Map(symbols.map(symbol => [symbol.toLowerCase(), symbol]));
  const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[DE][+-]?\d+)?$/i;
  const number = token => decimal.test(token) ? Number(token.replace(/D/i, 'E')) : NaN;
  const separator = line => /^\s*-{4,}\s*$/.test(line);

  // Match the value following each property label; correlation corrections (E2, etc.)
  // are intentionally distinct from total correlated energies such as EUMP2.
  const gaussianEnergy = [
    [/^\s*SCF Done:\s*E\(([^)]+)\)\s*=\s*(\S+)/i, 'scf-energy', 'SCF 电子能'],
    [/\b(?:EUMP2|ERMP2|E\(MP2\)|E\(ROMP2\))\s*=\s*(\S+)/i, 'mp2-energy', 'MP2 总能'],
    [/\b(?:EUMP3|ERMP3|E\(MP3\))\s*=\s*(\S+)/i, 'mp3-energy', 'MP3 总能'],
    [/\bCCSD\(T\)\s*=\s*(\S+)/i, 'ccsd-t-energy', 'CCSD(T) 总能'],
    [/\bE\(CORR\)\s*=\s*(\S+)/i, 'correlated-energy', '相关总能 E(Corr)'],
    [/^\s*Zero-point correction\s*=\s*(\S+)/i, 'zero-point-correction', '零点能校正'],
    [/^\s*Sum of electronic and zero-point Energies\s*=\s*(\S+)/i, 'zero-point-energy', '电子能与零点能之和'],
    [/^\s*Sum of electronic and thermal Energies\s*=\s*(\S+)/i, 'thermal-energy', '含热校正的内能'],
    [/^\s*Sum of electronic and thermal Enthalpies\s*=\s*(\S+)/i, 'enthalpy', '含热校正的焓'],
    [/^\s*Sum of electronic and thermal Free Energies\s*=\s*(\S+)/i, 'gibbs-energy', 'Gibbs 自由能']
  ];
  const orcaEnergy = [
    [/^\s*FINAL SINGLE POINT ENERGY\s+(?!\()(\S+)/i, 'final-energy', '最终单点能'],
    [/^\s*FINAL SINGLE POINT ENERGY\s+\(Solute-CPCM\)\s+(\S+)/i, 'solute-cpcm-energy', '单点能 · Solute-CPCM'],
    [/^\s*Zero point energy\s+\.{2,}\s*(\S+)\s+Eh\b/i, 'zero-point-correction', '零点能校正'],
    [/^\s*Total thermal energy\s+\.{2,}\s*(\S+)\s+Eh\b/i, 'thermal-energy', '含热校正的内能'],
    [/^\s*Total enthalpy\s+\.{2,}\s*(\S+)\s+Eh\b/i, 'enthalpy', '含热校正的焓'],
    [/^\s*Final Gibbs free energy\s+\.{2,}\s*(\S+)\s+Eh\b/i, 'gibbs-energy', 'Gibbs 自由能']
  ];

  const formats = {
    Gaussian: {
      signature: /^\s*(?:Entering Gaussian System|SCF Done:\s*E\(|Normal termination of Gaussian|Gaussian (?:09|16):)/im,
      start: /^\s*(?:Entering Gaussian System|--Link1--\s*$|Link1:\s*Proceeding to internal job step)/i,
      success: /^\s*Normal termination of Gaussian\b/i,
      failure: /^\s*Error termination\b/i,
      geometry: /^\s*(?:Standard|Input) orientation:\s*$/i,
      energy: gaussianEnergy
    },
    ORCA: {
      signature: /^\s*(?:\*+\s*O\s+R\s+C\s+A\s*\*+|FINAL SINGLE POINT ENERGY\s+|(?:\*+\s*)?ORCA TERMINATED NORMALLY|Program Version\s+\d+[.]\d+[\s\S]*CARTESIAN COORDINATES \(ANGSTR)/im,
      start: /^\s*(?:\*+\s*O\s+R\s+C\s+A\s*\*+|[*#$=-]*\s*(?:JOB NUMBER|COMPOUND JOB(?: STEP)?)\s*[:#]?\s*\d+\s*[*#$=-]*\s*$)/i,
      success: /^\s*\**\s*ORCA TERMINATED NORMALLY\b/i,
      failure: /^\s*(?:\**\s*ORCA (?:TERMINATED ABNORMALLY|finished by error termination)|ORCA_ABORT\b)/i,
      geometry: /^\s*CARTESIAN COORDINATES\s*\((?:ANGSTROEM|ANGSTROM|Å)\)\s*$/i,
      energy: orcaEnergy
    }
  };

  function coordinates(lines, index, end, gaussian, wanted) {
    let row = index + 1;
    if (!separator(lines[row])) return null;
    if (gaussian) {
      let angstroms = false;
      for (row++; row < end && row < index + 8 && !separator(lines[row]); row++) {
        if (/\bCoordinates\s*\(\s*Angstroms?\s*\)/i.test(lines[row])) angstroms = true;
      }
      if (!angstroms || !separator(lines[row])) return null;
    }
    const atoms = [];
    for (row++; row < end; row++) {
      const line = lines[row].trim();
      if (gaussian ? separator(line) : (!line || separator(line))) {
        return atoms.length && (!wanted || atoms.length === wanted) ? atoms : null;
      }
      const parts = line.split(/\s+/);
      if (gaussian && (parts.length !== 6 || !/^\d+$/.test(parts[1]) || Number(parts[0]) !== atoms.length + 1)) return null;
      if (!gaussian && parts.length !== 4) return null;
      const symbol = gaussian ? symbols[Number(parts[1]) - 1] : elements.get(parts[0].toLowerCase());
      const [x, y, z] = parts.slice(-3).map(number);
      if (!symbol || ![x,y,z].every(Number.isFinite)) return null;
      atoms.push({element:symbol, x, y, z});
    }
    return null;
  }

  function parseJob(lines, start, end, program, index, terminal) {
    const spec = formats[program], gaussian = program === 'Gaussian';
    const properties = new Map(), frequencies = [], warnings = new Set();
    let optimization = 'none', wanted = 0, invalidGeometry = false, scfFailed = false;
    let frequencyTable = false, readOrcaMode = false, pending = false, temperature = '';
    for (let i = start; i < end; i++) {
      const line = lines[i], trimmed = line.trim();
      if (spec.start.test(line)) pending = true;
      const count = gaussian ? /\bNAtoms=\s*(\d+)\b/.exec(line) : /^\s*Number of atoms\s*(?:\.{2,}|:)\s*(\d+)\b/i.exec(line);
      if (count) wanted = Number(count[1]);
      if (/^\s*(?:Optimization completed\b|--\s*Stationary point found\.|[*.| -]*THE OPTIMIZATION HAS CONVERGED\b)/i.test(line)) optimization = 'converged';
      else if (/^\s*(?:Optimization stopped|.*\boptimization (?:did not converge|(?:has )?not converged|has not been converged)|Number of steps exceeded)/i.test(line)) optimization = 'unconverged';
      else if (/^\s*(?:#.*\bopt(?:\W|$)|.*\bGEOMETRY OPTIMIZATION CYCLE\b|Berny optimization\b)/i.test(line) && optimization === 'none') optimization = 'unknown';
      if (/^\s*(?:Convergence failure\b|.*\bSCF (?:NOT (?:FULLY )?CONVERGED|DID NOT CONVERGE|CONVERGENCE FAILURE)\b)/i.test(line)) scfFailed = true;
      if (spec.geometry.test(line)) {
        pending = true;
        const value = coordinates(lines, i, end, gaussian, wanted || properties.get('geometry')?.value.length);
        invalidGeometry = !value;
        if (value) properties.set('geometry', {id:'geometry', label:'最后完整笛卡尔坐标', unit:'Å', value, kind:'geometry', line:i + 1});
      }
      const temp = /(?:Temperature\s+|THERMOCHEMISTRY AT\s+)([.\d]+)\s*(?:Kelvin|K)\b/i.exec(line);
      if (temp) temperature = temp[1] + ' K';
      for (const [pattern, id, name] of spec.energy) {
        const match = pattern.exec(line);
        if (!match) continue;
        pending = true;
        const thermal = ['thermal-energy','enthalpy','gibbs-energy'].includes(id);
        const key = temperature && thermal ? id + '@' + temperature : id;
        const value = number(match[match.length - 1]);
        if (!Number.isFinite(value)) {
          properties.delete(key);
          warnings.add('第 ' + (i + 1) + ' 行的 ' + name + ' 缺少有限数值。');
          continue;
        }
        const label = id === 'scf-energy' ? name + ' · ' + match[1] : name;
        properties.set(key, {id:key, label:temperature && thermal ? label + ' · ' + temperature : label, unit:'Eh', value, kind:'scalar', line:i + 1});
      }
      if (gaussian) {
        if (/^Harmonic frequencies\b/i.test(trimmed)) frequencies.length = 0;
        const match = /^Frequencies\s+--\s+(.+)$/i.exec(trimmed);
        if (match) {
          for (const token of match[1].trim().split(/\s+/)) {
            const mode = frequencies.length + 1, value = number(token);
            frequencies.push({id:'frequency-' + mode, label:'振动频率 · 模式 ' + mode, unit:'cm⁻¹', value, kind:'scalar', line:i + 1});
          }
        }
      } else if (trimmed === 'VIBRATIONAL FREQUENCIES') {
        frequencies.length = 0;
        frequencyTable = true;
        readOrcaMode = false;
      } else if (frequencyTable) {
        const match = /^(\d+):\s*(\S+)\s+cm(?:\*\*-1|\^-1|-1)(?:\s|$)/i.exec(trimmed);
        if (match) {
          readOrcaMode = true;
          const mode = Number(match[1]), value = number(match[2]);
          const zero = mode < 6 && value === 0;
          frequencies.push({id:'frequency-' + mode, label:'模式 ' + mode + (zero ? ' · 报告零模（核对平动/转动）' : ' · 振动频率'), unit:'cm⁻¹', value, kind:'scalar', line:i + 1});
        } else if ((readOrcaMode && trimmed) || /^(?:NORMAL MODES|IR SPECTRUM|THERMOCHEMISTRY)/.test(trimmed)) {
          frequencyTable = false;
        }
      }
    }
    if (!pending && !properties.size && !frequencies.length) return null;
    for (const property of frequencies) {
      if (Number.isFinite(property.value)) properties.set(property.id, property);
      else warnings.add('第 ' + property.line + ' 行的频率数值无效。');
    }
    if (terminal !== 'normal') warnings.add(terminal === 'failed' ? '软件报告错误终止。' : '此作业段缺少正常结束标志。');
    if (optimization === 'unconverged' || optimization === 'unknown') warnings.add('本段未确认几何优化收敛。');
    if (scfFailed) warnings.add('本段报告了 SCF 收敛失败。');
    if (invalidGeometry) warnings.add('最后一张坐标表不完整或包含不支持的中心。');
    const complete = terminal === 'normal' && !scfFailed && !invalidGeometry && !['unconverged','unknown'].includes(optimization);
    const thermalKeys = Array.from(properties.keys()).filter(key => key.includes('@'));
    for (const key of thermalKeys) {
      const [base] = key.split('@');
      if (!properties.has(base) && thermalKeys.filter(k => k.startsWith(base + '@')).length === 1) properties.get(key).id = base;
    }
    return {label:'作业 ' + index + ' · 第 ' + (start + 1) + '–' + end + ' 行', complete, optimization, termination:terminal,
      properties:Array.from(properties.values()), warnings:Array.from(warnings)};
  }

  function parse(filename, text) {
    if (typeof text !== 'string' || text.includes('\0') || !text.trim()) throw Error('请选择 ORCA 或 Gaussian 的文本输出文件。');
    const programs = Object.keys(formats).filter(program => formats[program].signature.test(text));
    if (programs.length !== 1) throw Error(programs.length ? '检测到混合程序输出，请按软件拆分文件。' : '未识别 Gaussian 或 ORCA 输出特征。');
    const program = programs[0], spec = formats[program], lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const jobs = [];
    let start = 0, hasBody = false;
    function finish(end, terminal) {
      if (end > start) {
        const section = parseJob(lines, start, end, program, jobs.length + 1, terminal);
        if (section) jobs.push(section);
      }
      start = end; hasBody = false;
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (hasBody && spec.start.test(line)) finish(i, 'incomplete');
      if (spec.geometry.test(line) || /^\s*(?:SCF Done:|FINAL SINGLE POINT ENERGY|VIBRATIONAL FREQUENCIES|Frequencies\s+--)/i.test(line)) hasBody = true;
      if (spec.success.test(line)) finish(i + 1, 'normal');
      else if (spec.failure.test(line)) finish(i + 1, 'failed');
    }
    finish(lines.length, 'incomplete');
    if (!jobs.some(job => job.properties.length)) throw Error('已识别 ' + program + '，但没有可读的能量、振动频率或完整笛卡尔坐标。');
    return {program, jobs};
  }
  globalThis.ChemResults = Object.freeze({parse});
})();
