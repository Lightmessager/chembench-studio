'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
require('../web/chemistry.js');
require('../web/adapters.js');
const {build} = BenchAdapters;
const raw = fs.readFileSync(path.join(__dirname,'../examples/phenol.gjf'),'utf8');
const project = {id:'phenol-heavy-atoms',title:'苯酚计数',instructions:'求非氢原子数。',kind:'heavy-atoms',
  structure:Chemistry.parse('样本.gjf',raw), settings:{basis:'def2-TZVP'},
  expected:'7',tolerance:0,assets:[{name:'说明.txt',text:'输入材料'}],extra:{reference:'private reference citation'}};

test('local container image and resource overrides are bounded; verifier stays independent', () => {
  const digest = 'a'.repeat(64);
  for(const id of ['mdarena','terminal']) {
    const source = {...project,extra:{baseImage:`localhost:5000/qm-tests/solver:release_1@sha256:${digest}`,cpus:'6',memoryMB:16384}};
    const out = build(id,source);
    assert.match(out['environment/Dockerfile'],/^FROM localhost:5000\/qm-tests\/solver:release_1@sha256:a{64}$/m);
    assert.match(out['task.toml'].split('[environment]')[1],/cpus = 6\nmemory_mb = 16384/);
    if(id === 'terminal') {
      assert.match(out['tests/Dockerfile'],/^FROM python:3.12-slim-bookworm$/m);
      assert.match(out['task.toml'],/environment_mode = "separate"/);
      assert.match(out['task.toml'],/artifacts = \["\/app\/outputs\/answer.json"\]/);
    } else assert.match(out['task.toml'],/artifacts = \["\/app\/outputs\/answer.json","\/app\/final_answer.txt"\]/);
    for(const invalid of ['--platform=evil','abc\nRUN something','abc\n','host:70000/path','bad@sha256:aa','a..b/x','repo/"break"','${HOME}','/abs']) {
      assert.throws(()=>build(id,{...source,extra:{baseImage:invalid}}),/镜像/);
    }
    for(const extra of [{memoryMB:127},{cpus:257},{cpus:'2.2'},{cpus:'4\n'},{cpus:['4']},{memoryMB:'4096\nother=1'}]) {
      assert.throws(()=>build(id,{...source,extra}));
    }
  }
});

test('three upstream layouts retain source and separate answer key from public inputs', () => {
  for (const id of ['asi','mdarena','terminal']) {
    const files = build(id,project);
    const prefix = id === 'asi' ? 'reference/case_001/data/' : 'environment/inputs/';
    assert.equal(files[prefix+'source/样本.gjf'],raw);
    assert.equal(files[prefix+'assets/说明.txt'],'输入材料');
    assert.match(files[prefix+'structure.xyz'],/^13\n/);
    const calc = JSON.parse(files[prefix+'calculation.json']);
    assert.equal(calc.settings.basis,'def2-TZVP');
    assert.equal(calc.original.basis,'6-31G(d)');
    for (const [name,body] of Object.entries(files)) {
      if (name.startsWith(prefix) || name === 'instruction.md' || name.startsWith('prompt_')) {
        assert.doesNotMatch(body,/private reference citation/);
      }
    }
    if (id === 'asi') {
      assert.equal(JSON.parse(files['task_eval.yaml']).generation.mode,'finite');
      assert.equal(JSON.parse(files['task_meta.yaml']).id,'chemistry.phenol_heavy_atoms');
      for(const level of [1,2,3,4]) assert.match(files[`prompt_b${level}.md`],/results\/answer\.json/);
    } else {
      assert.match(files['solution/reference.py'],/structure\.xyz/);
      assert.match(files['instruction.md'],/\/app\/outputs\/answer\.json/);
    }
  }
});

test('invalid numbers and unsafe filenames are rejected', () => {
  for(const v of ['', ' ', true, 'NaN', 'Infinity','0x3','1e9999']) {
    assert.throws(() => build('asi',{...project,expected:v}));
  }
  assert.throws(() => build('asi',{...project,tolerance:-1}));
  for(const name of ['../file','a/b','CON.txt','.','file ','a\\b']) {
    assert.throws(() => build('asi',{...project,assets:[{name,text:'x'}]}));
  }
  assert.throws(() => build('terminal',{...project,assets:[{name:'ABC.top',text:'a'},{name:'abc.TOP',text:'b'}]}));
  assert.equal(build('terminal',{...project,kind:'energy'})['solution/solve.sh'],undefined);
});

test('bundled verifier parses valid TOML, computes example oracle and rejects malformed answers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'chembench-adapter-test-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  for(const id of ['terminal','mdarena','asi']) {
    for(const [name,body] of Object.entries(build(id,project))) {
      const dest = path.join(root,id,name);
      fs.mkdirSync(path.dirname(dest),{recursive:true});
      fs.writeFileSync(dest,body);
    }
  }
  const code = `import ast, json, runpy, sys, tomllib
from pathlib import Path
root = Path(sys.argv[1])
for path in root.rglob("*.py"):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
for path in root.rglob("*.toml"):
    tomllib.loads(path.read_text(encoding="utf-8"))
task = root / "terminal"
oracle = runpy.run_path(str(task / "solution/reference.py"))["solve"]
value = oracle(task / "environment/inputs")
assert value == 7
verifier = runpy.run_path(str(task / "tests/verify.py"))["matches"]
reference = task / "tests/answer.json"
answer = root / "submission.json"
assert not verifier(answer, reference)
for text, result in [('{"value":7}',True),('{"value":8}',False),('{"value":true}',False),('{"value":"7"}',False),('null',False),('bad',False),('{"value":NaN}',False)]:
    answer.write_text(text, encoding="utf-8")
    assert verifier(answer, reference) is result, text
`;
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const result = spawnSync(python,['-X','utf8','-c',code,root],{encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message || result.stderr);
});
