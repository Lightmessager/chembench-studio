'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
require('../web/rubrics.js');
const sample = require('../examples/energy-geometry.rubric.json');
const grader = globalThis.Rubrics;
const atom = (element,x,y,z)=>({element,x,y,z});
const ref = [atom('C',0,0,0),atom('F',1.3,0,0),atom('N',0,1.1,0),atom('O',0,0,1.7)];

test('validates portable rule schema, answers and self-contained JS',()=>{
  const obj = grader.validate('\uFEFF'+JSON.stringify(sample));
  assert.deepEqual(obj,sample);
  assert.deepEqual(grader.validateAnswers(obj,{energy:-10,geometry:ref}),{energy:-10,geometry:ref});
  assert.equal(grader.scalar('0').criteria[0].tolerance,0);
  assert.equal(grader.geometry().criteria[0].metric,'rmsd');
  for (const patch of [{weight:0},{unit:'Bohr',metric:'rmsd'},{field:'constructor'},{metric:'eval'},{weight:Infinity},{tolerance:true},{code:'run()'}]){
    assert.throws(()=>grader.validate({...sample,criteria:[{...sample.criteria[0],...patch}]}));
  }
  assert.throws(()=>grader.validate({...sample,criteria:[...sample.criteria,sample.criteria[0]]}));
  assert.throws(()=>grader.validateAnswers(obj,{energy:'-10',geometry:ref}));
  assert.throws(()=>grader.validateAnswers(obj,{energy:-10,geometry:[atom('H',0,NaN,0)]}));
  const context = vm.createContext({});
  vm.runInContext(grader.standaloneSource(),context);
  assert.equal(context.Rubrics.pythonSource,grader.pythonSource);
});

test('exported Python grades weighted, relative and properly aligned geometry including XYZ',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chembench-rubric-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=path.join(dir,'grade.py'), key=path.join(dir,'key.json');
  fs.writeFileSync(source,grader.pythonSource);
  const python=process.platform==='win32'?'python':'python3';
  function run(rubric,answers,submission,extension='json') {
    const output=path.join(dir,'answer.'+extension);
    fs.writeFileSync(key,JSON.stringify({rubric,answers}));
    fs.writeFileSync(output,typeof submission==='string'?submission:JSON.stringify(submission));
    const p=spawnSync(python,[source,output,key],{encoding:'utf8'});
    assert.ok([0,1].includes(p.status),p.stderr);
    const result=JSON.parse(p.stdout);
    assert.equal(result.passed,p.status===0);
    return result;
  }
  const rigid=atoms=>atoms.map(({element,x,y,z})=>atom(element,2+y,9+z,-4+x));
  const geom=grader.geometry(), answers={geometry:ref};
  const xyz=ref.length+'\nrotated\n'+rigid(ref).map(a=>[a.element,a.x,a.y,a.z].join(' ')).join('\n');
  const same=run(geom,answers,xyz,'xyz');
  assert.equal(same.score,1);
  assert.ok(same.criteria[0].error<1e-12);
  const mirror=ref.map(a=>({...a,x:-a.x}));
  assert.equal(run(geom,answers,{geometry:mirror}).score,0);
  assert.equal(run(geom,answers,{geometry:ref.toReversed()}).score,0);
  assert.equal(run(geom,answers,xyz+'\n2\nsecond frame\nH 0 0 0\nH 1 0 0','xyz').score,0);
  for(const atoms of [[atom('H',0,0,0)], [atom('H',0,0,0),atom('H',2,0,0)],ref.slice(0,3)]){
    assert.equal(run(geom,{geometry:atoms},{geometry:rigid(atoms)}).score,1);
  }
  // Isotropic distortion has a known optimum after removal of the rigid pose.
  const factor=1.2, centroid=['x','y','z'].map(k=>ref.reduce((s,a)=>s+a[k],0)/ref.length);
  const radius=Math.sqrt(ref.reduce((s,a)=>s+['x','y','z'].reduce((d,k,i)=>d+(a[k]-centroid[i])**2,0),0)/ref.length);
  const scaled=rigid(ref.map(a=>atom(a.element,a.x*factor,a.y*factor,a.z*factor)));
  assert.ok(Math.abs(run(geom,answers,{geometry:scaled}).criteria[0].error-(factor-1)*radius)<1e-12);
  const distorted=ref.map((a,i)=>({...a,z:a.z+(i===3?2:0)}));
  const combined={geometry:ref,energy:-10};
  assert.equal(run(sample,combined,{energy:-10,geometry:distorted}).score,.4);
  assert.equal(run(sample,combined,{geometry:ref}).score,.6);
  const rulePath=path.join(dir,'rule.json'), answersPath=path.join(dir,'answers.json');
  fs.writeFileSync(rulePath,JSON.stringify(sample));
  fs.writeFileSync(answersPath,JSON.stringify(combined));
  const grade=spawnSync(python,[source,'--rubric',rulePath,path.join(dir,'answer.json'),answersPath],{encoding:'utf8'});
  assert.equal(grade.status,1,grade.stderr);
  const report=JSON.parse(grade.stdout);
  assert.equal(report.score,.6);
  assert.equal(report.criteria[0].earned_weight,0);
  assert.deepEqual(report.criteria[1],{...sample.criteria[1],earned_weight:3,passed:true,error:0});
  assert.equal(run(sample,combined,'{}').score,0);
  assert.equal(run(sample,combined,'incomplete').score,0);
  assert.equal(run(sample,combined,'{"energy":-10,"unused":NaN}').score,0);
  assert.equal(run(sample,combined,'{"energy":0,"energy":-10}').score,0);
  assert.equal(run(sample,combined,{energy:true}).score,0);
  const relative=grader.scalar(.1,'Eh'); relative.criteria[0].metric='relative';
  assert.equal(run(relative,{value:100},{value:110}).score,1);
  assert.equal(run(relative,{value:-100},{value:-112}).score,0);
  assert.equal(run(relative,{value:0},{value:0}).score,1);
  assert.equal(run(relative,{value:0},{value:1e-20}).score,0);
  const threshold=grader.scalar(0);
  assert.equal(run(threshold,{value:7},{value:7}).score,1);
  assert.equal(run(threshold,{value:7},{value:6.99}).score,0);
});
