const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {spawnSync}=require("node:child_process");
for(const file of ["chemistry","rubrics","answer-book","adapters","harbor-index","measurement","core"])require("../web/"+file+".js");
const source=fs.readFileSync(path.join(__dirname,"../examples/phenol.gjf"),"utf8");
function fresh(){return Studio.fresh(Chemistry.parse("phenol.gjf",source))}
function prepare(p){return Studio.prepare(p,Studio.kinds.find(x=>x.id===p.kind),[...BenchAdapters.profiles,HarborIndex.profile].find(x=>x.id===p.profile))}

test("editing effective parameters and a round trip preserve the source and task inputs",()=>{
  const p=fresh();p.settings.basis="def2-TZVP";p.profileData.asi={reference:"Private lab record"};
  const restored=Studio.checked(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.structure.basis,"6-31G(d)");assert.equal(restored.settings.basis,"def2-TZVP");
  const f=BenchAdapters.build("asi",prepare(restored));
  assert.equal(f["reference/case_001/data/source/phenol.gjf"],source);
  assert.equal(JSON.parse(f["reference/case_001/data/calculation.json"]).settings.basis,"def2-TZVP");
  assert.ok(!f["prompt_b1.md"].includes("Private lab record"));
});

test("selected atoms yield a privately verifiable distance for all exports",()=>{
  const p=fresh();p.kind="bond-length";p.kindData[p.kind]={first:"1",second:"7"};
  p.expected=Measurement.evaluate(p.structure,p.kindData[p.kind]).expected;p.tolerance="0.000001";
  for(const profile of [...BenchAdapters.profiles,HarborIndex.profile]){
    p.profile=profile.id;const record=prepare(p);
    assert.ok(record.extra.oracle.includes("math.dist"));assert.match(record.instructions,/第一个原子编号 = 1/);
    const files=profile.id==="harbor-index"?HarborIndex.build(record):BenchAdapters.build(profile.id,record);
    const calc=JSON.parse(Object.entries(files).find(([k])=>k.endsWith("/calculation.json"))[1]);
    assert.deepEqual(calc.task_options,{first:"1",second:"7"});
  }
});

test("multiple choice exposes numbered options and validates private answer",()=>{
  const p=fresh();p.kind="choice";p.kindData.choice={choices:"直线形\n平面形"};p.expected="2";
  assert.match(prepare(p).instructions,/1\. 直线形\n2\. 平面形/);
  p.expected="3";assert.throws(()=>prepare(p),/序号/);
  assert.throws(()=>Studio.definition({id:"constructor",name:"X"}));
});

test("ZIP preserves Unicode and executable flags in standard extractors",async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"chembench-zip-"));
  try{
    const f=path.join(tmp,"bundle.zip");fs.writeFileSync(f,Buffer.from(await Studio.zip({"结构/水.xyz":"3\n水\n","tests/test.sh":"#!/bin/sh\n"}).arrayBuffer()));
    const r=spawnSync(process.platform==="win32"?"python":"python3",["-c","import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read('结构/水.xyz').decode()=='3\\n水\\n'; assert (z.getinfo('tests/test.sh').external_attr >> 16) & 0o111",f],{encoding:"utf8"});
    assert.equal(r.status,0,r.stderr);assert.throws(()=>Studio.zip({"../unsafe":"a"}));
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
