const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
require('../web/chemistry.js');
require('../web/adapters.js');
require('../web/harbor-index.js');

const structure = Chemistry.parse('h2.xyz', '2\nhydrogen\nH 0 0 0\nH 0 0 0.8\n');
const atoms = [{element:'H',x:0,y:0,z:0}, {element:'H',x:0,y:0,z:.75}];
const rubric = {version:1,id:'mixed',name:'Electronic energy and structure',criteria:[
  {field:'energy',label:'Energy',metric:'absolute',unit:'Eh',tolerance:.0001,weight:3},
  {field:'geometry',label:'Geometry',metric:'rmsd',unit:'Å',tolerance:.01,weight:1}
]};
const seed = {id:'h2-properties',title:'H₂ properties',kind:'energy',instructions:'Optimize hydrogen and report energy.',
  structure,rubric,answers:{energy:-1.23456789,geometry:atoms},answerSources:{energy:{filename:'private-source.log'}}};
function write(dir,files){
  for(const [name,body] of Object.entries(files)){
    const dest=path.join(dir,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,body);
  }
}
function run(dir,...args){
  return spawnSync(process.platform==='win32'?'python':'python3',['-X','utf8',...args],{cwd:dir,encoding:'utf8'});
}
function probe(dir,grader,args,score,exit){
  const r=run(dir,grader,...args);
  assert.equal(r.status,exit,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.equal(report.score,score);
  assert.equal(report.passed,score===1);
  return report;
}

test('same mixed reference grades partial credit and produces the native contract for four targets', t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'chembench-rules-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  for(const id of ['asi','mdarena','terminal','harbor-index']){
    const files=id==='harbor-index'?HarborIndex.build(seed):BenchAdapters.build(id,seed);
    const dir=path.join(tmp,id);
    write(dir,files);
    const root=id==='harbor-index'?'tasks/h2-properties/':'';
    const privateRef=id==='asi'?'reference/case_001/reference/answer.json':root+(id==='mdarena'?'tests/correctness/expected_outputs/answer.json':'tests/answer.json');
    const reference=JSON.parse(files[privateRef]);
    assert.deepEqual(reference.answers,seed.answers);assert.equal(reference.answerSources.energy.filename,'private-source.log');
    for(const [name,body] of Object.entries(files)){
      if(name.includes('environment/inputs/')||name.includes('case_001/data/')||/prompt_b[1-4]\.md$|instruction\.md$/.test(name))assert.doesNotMatch(body,/-1\.23456789|private-source\.log/);
    }
    fs.mkdirSync(path.join(dir,'sub'),{recursive:true});
    const answer='sub/answer.json';
    fs.writeFileSync(path.join(dir,answer),JSON.stringify({energy:seed.answers.energy,geometry:[...atoms].reverse().map((a,i)=>({...a,x:i*2}))}));
    const grader=id==='asi'?'grade.py':root+'tests/verify.py';
    const argv=id==='asi'?[answer,privateRef]:[answer];
    const report=probe(dir,grader,argv,.75,1);
    assert.deepEqual(report.criteria.map(c=>c.passed),[true,false]);
    if(id==='terminal'){
      assert.match(files['tests/test.sh'],/echo 1 > \/logs\/verifier\/reward.txt/);
      assert.match(files['tests/test.sh'],/echo 0 > \/logs\/verifier\/reward.txt/);
      assert.match(files['tests/test_outputs.py'],/parametrize/);
    }
    if(id==='harbor-index'){
      probe(dir,grader,[answer,'--logs','reports','--reward'],.75,0);
      assert.equal(Number(fs.readFileSync(path.join(dir,'reports/reward.txt'))),.75);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'reports/metrics.json'))).score,.75);
      const check=run(dir,'tools/check_candidate.py');assert.equal(check.status,0,check.stderr);
    }
    if(id==='mdarena'){
      assert.match(files['tests/correctness/checks.py'],/rk\.chembench_item\(0, "energy", weight=3\)/);
      assert.match(files['tests/correctness/checks.py'],/rk\.chembench_item\(1, "geometry", weight=1\)/);
      assert.ok(files['tests/process/judge.toml']);
    }
    fs.writeFileSync(path.join(dir,answer),JSON.stringify(seed.answers));probe(dir,grader,argv,1,0);
  }
});

test('geometry-only exports accept a rotated XYZ and agree on the actual filename',t=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'chembench-xyz-'));
  t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const p={...seed,rubric:Rubrics.geometry(),answers:{geometry:atoms}};
  for(const id of ['asi','mdarena','terminal','harbor-index']){
    const files=id==='harbor-index'?HarborIndex.build(p):BenchAdapters.build(id,p);
    const dir=path.join(tmp,id);
    write(dir,files);
    const root=id==='harbor-index'?'tasks/h2-properties/':'';
    const prompt=files[id==='asi'?'prompt_b1.md':root+'instruction.md'];
    assert.match(prompt,/answer\.xyz/);
    if(id==='asi'){
      assert.equal(JSON.parse(files['task_meta.yaml']).output.files[0].name,'results/answer.xyz');
      assert.equal(JSON.parse(files['task_eval.yaml']).evaluation.gates[0].config.checks[0].file,'results/answer.xyz');
    } else if(id!=='harbor-index')assert.match(files['task.toml'],/artifacts = \["\/app\/outputs\/answer.xyz"/);
    fs.writeFileSync(path.join(dir,'rotated.xyz'),'2\nrotated and translated\nH 4 0 0\nH 4.75 0 0\n');
    probe(dir,id==='asi'?'grade.py':root+'tests/verify.py',id==='asi'?['rotated.xyz','reference/case_001/reference/answer.json']:['rotated.xyz'],1,0);
    if(id==='harbor-index'){const check=run(dir,'tools/check_candidate.py');assert.equal(check.status,0,check.stderr)}
  }
});

test('solver instructions follow the saved task independently of the local interface',()=>{
  for(const file of ['i18n','i18n-task','measurement','answer-book','core'])require('../web/'+file+'.js');
  ChemI18n.set('en');
  const p=Studio.fresh(structure);
  Studio.switchKind(p,'bond-length');
  const task=Studio.kinds.find(kind=>kind.id===p.kind);
  p.expected=Measurement.evaluate(structure,p.kindData[p.kind]).expected;
  const exporter=(profile)=>{
    p.profile=profile.id;
    const prepared=Studio.prepare(p,task,profile);
    return profile===HarborIndex.profile?HarborIndex.build(prepared):BenchAdapters.build(profile.id,prepared);
  };
  const profiles=[...BenchAdapters.profiles,HarborIndex.profile];
  const generated=profiles.map(exporter);
  ChemI18n.set('zh');
  try{
    for(const [i,profile] of profiles.entries()){
      const files=generated[i];
      assert.deepEqual(exporter(profile),files);
      const prompts=Object.entries(files).filter(([name])=>/^(?:prompt_b[1-4]\.md|(?:tasks\/[^/]+\/)?instruction\.md)$/.test(name));
      assert.equal(prompts.length,profile.id==='asi'?4:1);
      for(const [,prompt] of prompts){
        assert.doesNotMatch(prompt,/[\u3400-\u9fff]/u);
        assert.match(prompt,/First atom index = 1/);
        assert.match(prompt,/## Submission and scoring/);
        assert.match(prompt,/answer\.json/);
        if(profile.id==='mdarena')assert.match(prompt,/final_answer\.txt/);
        if(profile.id==='terminal')assert.match(prompt,/only when all criteria pass/);
        if(profile.id==='harbor-index')assert.match(prompt,/weighted score on a scale of 0 to 1/);
      }
    }
    const custom=structuredClone(seed);
    custom.rubric.criteria[0].label='作者能量字段';
    custom.assets=[{name:'notes.txt',text:'作者材料'}];
    const english=BenchAdapters.build('asi',custom);
    assert.match(english['prompt_b1.md'],/作者能量字段/);
    assert.equal(english['reference/case_001/data/assets/notes.txt'],'作者材料');
    custom.instructions='请使用给定结构计算对应性质。';
    assert.match(BenchAdapters.build('asi',custom)['prompt_b1.md'],/## 提交与评分/);
  }finally{ChemI18n.set('zh')}
});
