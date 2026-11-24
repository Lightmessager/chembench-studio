const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const modulePath = path.join(__dirname, '../web/measurement.js');
if (fs.existsSync(modulePath)) require(modulePath);
require('../web/chemistry.js');

const molecule = Chemistry.parse('example.xyz', '3\nExample\nH 0 1 2\nO -2 5 -.25\nC 2 8 11.75\n');

test('bond length uses the two selected one-based atom indices and all three Cartesian axes', () => {
  assert.ok(globalThis.Measurement, 'measurement type is registered');
  assert.equal(Measurement.definition.id, 'bond-length');
  assert.equal(Measurement.evaluate(molecule,{first:'3',second:2}).expected,'13');
  assert.equal(Measurement.evaluate(molecule,{first:2,second:3}).expected,'13');
});

test('invalid and duplicate atom indices fail before an answer or oracle can be generated', () => {
  assert.ok(globalThis.Measurement, 'measurement type is registered');
  for (const value of [0,-2,4,2.5,'2.5','',' ','2+1',null,undefined,Infinity]) {
    assert.throws(()=>Measurement.evaluate(molecule,{first:1,second:value}),/原子编号/);
  }
  assert.throws(()=>Measurement.evaluate(molecule,{first:2,second:'2'}),/不同/);
});

test('independent Python oracle reads coordinates from the provided XYZ each time', t => {
  assert.ok(globalThis.Measurement, 'measurement type is registered');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chembench-bond-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const result = Measurement.evaluate(molecule,{first:2,second:3});
  fs.writeFileSync(path.join(dir,'solution.py'), result.oracle + '\nfrom pathlib import Path\nprint(solve(Path(".")))\n');
  fs.writeFileSync(path.join(dir,'structure.xyz'), molecule.raw);
  const evaluate = () => {
    const run = cp.spawnSync(process.platform === 'win32' ? 'python' : 'python3',['solution.py'],{cwd:dir,encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    return Number(run.stdout);
  };
  assert.equal(evaluate(),Number(result.expected));
  fs.writeFileSync(path.join(dir,'structure.xyz'), '3\nMoved atoms\nH 0 0 0\nO 0 0 0\nC 0 .5 .25\n');
  assert.ok(Math.abs(evaluate()-Math.sqrt(.3125))<1e-13);
});
