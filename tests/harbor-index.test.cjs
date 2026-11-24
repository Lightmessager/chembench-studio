const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
require('../web/chemistry.js');
require('../web/adapters.js');
if (fs.existsSync(path.join(__dirname, '../web/harbor-index.js'))) require('../web/harbor-index.js');
function project() {
  return {id:'phenol-01', title:'Phenol', instructions:'Count heavy atoms.', expected:'7', tolerance:0, kind:'heavy-atoms',
    structure:Chemistry.parse('phenol.gjf',fs.readFileSync(path.join(__dirname,'../examples/phenol.gjf'),'utf8')),
    extra:{author:'课题组'},assets:[]};
}
function exportFiles(p) {
  assert.ok(globalThis.HarborIndex, 'Harbor Index export is installed');
  return HarborIndex.build(p);
}
function python(cwd, args) {
  return cp.spawnSync(process.platform === 'win32' ? 'python' : 'python3',args, {cwd,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});
}
test('candidate task has an authored namespaced v1 config and independent oracle', () => {
  const files = exportFiles(project());
  const task = 'tasks/phenol-01/';
  assert.match(files[task+'task.toml'],/^version = "1\.0"/);
  assert.match(files[task+'task.toml'],/chembench-local\/phenol-01/);
  assert.match(files[task+'task.toml'],/课题组/);
  assert.ok(files[task+'solution/solve.sh']);
  assert.match(files['job-config.yaml'],/n_attempts: 5/);
  const pkg = 'src/chembench-local/';
  assert.match(files[pkg+'pyproject.toml'],/name = "harbor-chembench-local-adapter"/);
  assert.match(files[pkg+'uv.lock'],/harbor-chembench-local-adapter/);
  assert.match(files[pkg+'src/chembench_local/adapter.py'],/class ChembenchLocalAdapter:/);
  assert.match(files[pkg+'src/chembench_local/adapter.py'],/def run\(self\):/);
  assert.equal(JSON.parse(files[pkg+'adapter_metadata.json'])[0].harbor_adapter[0].registry_benchmark_size,0);
  assert.equal(files[pkg+'parity_experiment.json'],undefined);
  assert.doesNotMatch(files[task+'environment/Dockerfile'],/canary/i);
  const draft=exportFiles({...project(),kind:'other'});
  assert.equal(draft[task+'solution/solve.sh'],undefined);
  assert.equal(draft[task+'solution/reference.py'],undefined);
  assert.match(draft['job-config.yaml'],/name: nop/);
  assert.match(draft['README.md'],/独立参考算法待补/);
});
test('generated CLI recreates every task byte, honors filters and converts updated source records', t => {
  const files = exportFiles(project());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'chembench-adapter-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  for (const [name,body] of Object.entries(files)) {
    const dst = path.join(tmp,name);
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.writeFileSync(dst,body);
  }
  const entry = 'src/chembench-local/src/chembench_local/main.py';
  const exec = (...args) => python(tmp,[entry,...args]);
  let run = exec('--output-dir','out','--limit','1','--task-ids','phenol-01');
  assert.equal(run.status,0,run.stderr);
  for (const [name,body] of Object.entries(files).filter(([n])=>n.startsWith('tasks/'))) {
    assert.equal(fs.readFileSync(path.join(tmp,'out',name.slice(6)),'utf8'),body,name);
  }
  const oracle = python(tmp,['-c',[
    'from pathlib import Path',
    'import runpy',
    'root = Path("out/phenol-01")',
    'result = runpy.run_path(str(root / "solution/reference.py"))["solve"](root / "environment/inputs")',
    'assert result == 7, result',
  ].join('\n')]);
  assert.equal(oracle.status,0,oracle.stderr);
  fs.writeFileSync(path.join(tmp,'runs.json'),'{"original_runs":[25,75],"harbor_runs":[50,100]}');
  const stats = python(tmp,['tools/compare_runs.py','runs.json']);
  assert.equal(stats.status,0,stats.stderr);
  const summary = JSON.parse(stats.stdout);
  assert.equal(summary.original.mean,50);
  assert.ok(Math.abs(summary.original.sample_sem-25)<1e-12);
  assert.equal(summary.overlapping_ranges,true);
  assert.notEqual(exec('--output-dir','out','--task-ids','missing').status,0);
  const modified = {...project(),title:'New prompt',id:'sample-02'};
  fs.writeFileSync(path.join(tmp,'cases.json'),JSON.stringify([project(), modified]));
  run = exec('--source','cases.json','--output-dir','out','--task-ids','sample-02');
  assert.equal(run.status,0,run.stderr);
  assert.match(fs.readFileSync(path.join(tmp,'out/sample-02/instruction.md'),'utf8'),/New prompt/);
  run = exec('--output-dir','out','--overwrite');
  assert.equal(run.status,0,run.stderr);
  fs.writeFileSync(path.join(tmp,'out','phenol-01','notes.txt'),'user notes');
  assert.notEqual(exec('--output-dir','out','--overwrite').status,0);
  assert.equal(fs.readFileSync(path.join(tmp,'out','phenol-01','notes.txt'),'utf8'),'user notes');
  const check = python(tmp,['tools/check_candidate.py','--tasks','out','--source','cases.json']);
  assert.equal(check.status,0,check.stderr);
  const ref = path.join(tmp,'out/sample-02/tests/answer.json');
  fs.writeFileSync(ref,'{"value": 0, "absolute_tolerance": 0}');
  assert.notEqual(python(tmp,['tools/check_candidate.py','--tasks','out','--source','cases.json']).status,0);
  const template = path.join(tmp,'src/chembench-local/src/chembench_local/task-template/instruction.md');
  fs.appendFileSync(template,'\nAdded by the task author.\n');
  run = exec('--output-dir','other');
  assert.equal(run.status,0,run.stderr);
  assert.match(fs.readFileSync(path.join(tmp,'other/phenol-01/instruction.md'),'utf8'),/Added by the task author/);
});
