const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
for(const script of ["chemistry","measurement","rubrics","results","answer-book","core"])require("../web/"+script+".js");
const read=name=>fs.readFileSync(path.join(__dirname,"../examples",name),"utf8");
function fresh(){return Studio.fresh(Chemistry.parse("water-seed.xyz",read("water-seed.xyz")))}
const outputs={name:"orca-water.out",program:"ORCA"};
const job=ChemResults.parse(outputs.name,read(outputs.name)).jobs[0];
const file={filename:outputs.name,program:outputs.program};
const property=id=>job.properties.find(x=>x.id===id);
function prepare(p){return Studio.prepare(p,Studio.kinds.find(k=>k.id===p.kind),{fields:[]})}

test("energy import stores the selected observable and line, while leaving source coordinates intact",()=>{
  const p=fresh(),seed=JSON.stringify(p.structure);
  Studio.switchKind(p,"energy");
  AnswerBook.apply(p,AnswerBook.rule(p).criteria[0],property("gibbs-energy"),job,file);
  const packed=prepare(Studio.checked(JSON.parse(JSON.stringify(p))));
  assert.equal(packed.answers.value,-76.407275);
  assert.equal(packed.answerSources.value.program,"ORCA");
  assert.equal(packed.answerSources.value.line,31);
  assert.equal(JSON.stringify(p.structure),seed);
  assert.equal(packed.rubric.criteria[0].unit,"Eh");
  p.grading.unit="eV";assert.throws(()=>prepare(p),/单位/);
  p.grading.unit="Eh";p.assets.push({name:file.filename,text:"contains key"});assert.throws(()=>prepare(p),/公开/);
});

test("the structure preset rejects mismatched atom order, failed jobs and unconverged optimization",()=>{
  const p=fresh();Studio.switchKind(p,"optimized-geometry");
  const c=AnswerBook.rule(p).criteria[0],xyz=property("geometry");
  assert.throws(()=>AnswerBook.apply(p,c,xyz,{...job,complete:false},file),/完成/);
  assert.throws(()=>AnswerBook.apply(p,c,xyz,{...job,optimization:"none"},file),/收敛/);
  assert.throws(()=>AnswerBook.apply(p,c,{...xyz,value:xyz.value.slice().reverse()},job,file),/顺序/);
  assert.throws(()=>prepare(p),/坐标/);
  AnswerBook.apply(p,c,xyz,job,file);
  const restored=Studio.checked(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(prepare(restored).answers.geometry,xyz.value);
  Studio.switchKind(restored,"energy");assert.deepEqual(restored.grading.sources,{});assert.throws(()=>prepare(restored),/有限/);
});

test("portable compound rubrics bind fields independently and older projects still load",()=>{
  const p=fresh(),old=JSON.parse(JSON.stringify(p));delete old.grading;
  assert.equal(prepare(Studio.checked(old)).answers.value,1);
  Studio.switchKind(p,"observables");const r=Rubrics.validate(read("energy-geometry.rubric.json"));
  p.grading.mode="custom";p.grading.custom=r;
  for(const c of r.criteria)AnswerBook.apply(p,c,property(c.metric==="rmsd"?"geometry":"final-energy"),job,file);
  const packed=prepare(Studio.checked(p));assert.deepEqual(packed.rubric,r);
  assert.equal(packed.answers.geometry.length,3);assert.equal(packed.answers.energy,-76.4103456789);
  delete p.grading.answers.geometry;assert.throws(()=>prepare(p),/坐标/);
});

test("replacing a reference system updates generated task metadata and drops previous bindings",()=>{
  const p=fresh();Studio.switchKind(p,"energy");
  AnswerBook.apply(p,AnswerBook.rule(p).criteria[0],property("final-energy"),job,file);
  const phenol=Chemistry.parse("phenol.gjf",read("phenol.gjf"));
  Studio.replaceStructure(p,phenol);
  assert.equal(p.id,"phenol-energy");assert.match(p.title,/Phenol/);
  assert.equal(p.expected,"");assert.deepEqual(p.grading.sources,{});
  p.title="自定标题";p.id="custom-name";Studio.replaceStructure(p,fresh().structure);
  assert.equal(p.title,"自定标题");assert.equal(p.id,"custom-name");
});
