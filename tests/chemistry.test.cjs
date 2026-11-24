const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parserPath = path.join(__dirname, '../web/chemistry.js');
if (fs.existsSync(parserPath)) require(parserPath);
const parse = (...args) => {
  assert.equal(typeof globalThis.Chemistry?.parse, 'function', 'structure parser is registered');
  return globalThis.Chemistry.parse(...args);
};

test('multiline Gaussian route, atom numbers, freeze flags, Fortran exponents, custom basis, Link1', () => {
  const raw = '\uFEFF%mem=4GB\r\n%nprocshared=2\r\n#p opt=(tight, modredundant) freq\r\n  B3LYP/GenECP SCRF=(SMD, Solvent=Water) IOp(3/33=1)\r\n\r\nFe complex\r\n\r\n+2 5\r\n26 0 .5 1D-1 -2.0\r\n\r\nFe 0\r\nLANL2DZ\r\n****\r\n\r\n--Link1--\r\n# Geom=AllCheck\r\n';
  const s = parse('trial.COM', raw);
  assert.deepEqual(s.atoms[0], {element:'Fe',x:.5,y:.1,z:-2,freeze:0});
  assert.equal(s.title,'Fe complex');
  assert.equal(s.method,'B3LYP');
  assert.equal(s.basis,'GenECP');
  assert.equal(s.solventModel,'SMD');
  assert.equal(s.solvent,'Water');
  assert.equal(s.charge,2);
  assert.equal(s.multiplicity,5);
  assert.equal(s.link0.mem,'4GB');
  assert.deepEqual(s.tasks,['Opt','Freq']);
  assert.ok(s.route.includes('tight, modredundant'));
  assert.ok(s.additionalInput.includes('LANL2DZ'));
  assert.ok(s.warnings.some(w=>w.includes('Link1')));
  assert.equal(s.raw,raw);
});

test('IOp ratios are not method/basis and Units=Bohr coordinates are exposed as angstroms', () => {
  const s = parse('a.gjf','# AM1 Units=Bohr IOp(3/33=1)\n\nH2\n\n0 1\nH 0 0 0\nH 1 0 0\n');
  assert.equal(s.method,'AM1');
  assert.equal(s.basis,null);
  assert.ok(Math.abs(s.atoms[1].x-.52917721)<1e-7);
});

test('plain XYZ blank comment retains unknown settings', () => {
  const s = parse('x.XYZ','2\n\ncl 1e-3 2.0 -2\nH 0 0 0\n');
  assert.deepEqual(s.atoms[0],{element:'Cl',x:.001,y:2,z:-2});
  for (const key of ['method','basis','solvent','charge','multiplicity']) assert.equal(s[key],null,key);
});

test('extended XYZ respects declared column layout and explicit metadata', () => {
  const s = parse('o.xyz','1\nProperties=id:I:1:species:S:1:pos:R:3 charge=-1 multiplicity=2 method="PBE0" basis=def2-SVP solvent=Water\n7 O 1 2 3\n');
  assert.deepEqual(s.atoms,[{element:'O',x:1,y:2,z:3}]);
  assert.deepEqual([s.charge,s.multiplicity,s.method,s.basis,s.solvent],[-1,2,'PBE0','def2-SVP','Water']);
});

test('invalid or ambiguous geometries produce actionable errors', () => {
  for (const [file,raw,pattern] of [
    ['a.xyz','2\nwater\nO 0 0 0','2'],
    ['a.xyz','1\n\nH Infinity 0 0','坐标'],
    ['a.xyz','1\n\nH 0 0 0\n1\n\nH 1 2 3','多帧'],
    ['a.gjf','# HF/STO-3G Geom=AllCheck\n\n','检查点'],
    ['a.gjf','#p Opt\n\nwater\n\n0 1\nO\nH 1 1.0\n','笛卡尔'],
    ['a.gjf','# Opt\n\ntest\n\n0 0\nC 1 2 3\n','多重度'],
    ['a.xyz','1\nProperties=pos:R:2:species:S:1\n1 2 C','Properties']
  ]) assert.throws(()=>parse(file,raw),new RegExp(pattern));
});

test('phenol example files describe identical 13 atom geometries', () => {
  const example = ext => {
    const name = 'phenol.'+ext;
    return parse(name,fs.readFileSync(path.join(__dirname,'../examples',name),'utf8'));
  };
  const gjf = example('gjf'), xyz = example('xyz');
  assert.deepEqual(gjf.atoms,xyz.atoms);
  assert.equal(gjf.atoms.length,13);
  assert.deepEqual([gjf.method,gjf.basis,gjf.solventModel,gjf.solvent],['B3LYP','6-31G(d)','SMD','Water']);
});

test('calculation options remain intact for Gaussian and annotated XYZ', () => {
  const job=Chemistry.parse('h.gjf','#p HF/STO-3G Opt=(Tight,ModRedundant) Freq=Raman\n\nH\n\n0 2\nH 0 0 0\n\n');
  assert.deepEqual(job.taskOptions,['Opt=(Tight,ModRedundant)','Freq=Raman']);
  const xyz=Chemistry.parse('h.xyz','1\ntasks="Opt=(Tight,MaxCycles=50) Freq"\nH 0 0 0\n');
  assert.deepEqual(xyz.tasks,['Opt','Freq']);
  assert.deepEqual(xyz.taskOptions,['Opt=(Tight,MaxCycles=50)','Freq']);
});
