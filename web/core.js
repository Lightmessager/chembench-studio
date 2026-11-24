"use strict";
globalThis.Studio = (() => {
  const kinds = [
    {id:"heavy-atoms",name:"结构分析 · 重原子计数",description:"按输入坐标统计非氢原子，参考值随结构自动更新。",instructions:"统计所给结构中所有非氢原子的数量，提交一个整数。"},
    Measurement.definition,
    {id:"energy",name:"量化计算 · 能量",description:"可用于单点能、相对能或溶剂化能。请指定单位、方法与参考体系。",instructions:"按随题计算设置求体系的电子能量，以 Hartree 为单位提交数值。"},
    {id:"frequency",name:"振动分析 · 频率",description:"选择指定的振动模式，保留虚频的负号，以 cm⁻¹ 计分。",instructions:"计算给定体系的振动频率，并提交题目所指定模式的波数（cm⁻¹）。请在此写明模式选择和缩放约定。"},
    {id:"optimized-geometry",name:"几何优化 · 完整构型",description:"参考答案为优化后的整套笛卡尔坐标，保持输入的原子顺序。",instructions:"按题目计算设置优化给定结构，按输入原子的顺序提交优化后的笛卡尔坐标，单位为 Å。"},
    {id:"observables",name:"综合任务 · 多项结果",description:"按导入的评分标准提交各项结果。",instructions:"依据随题结构和计算条件，求出评分标准列出的物理量。请在此补充每项结果的计算与选取要求。"},
    {id:"geometry",name:"几何分析 · 结构量",description:"可比较键长、键角或优化后的单个结构指标。",instructions:"测量指定原子间的距离，以 Å 为单位提交结果。请在此补充原子编号和是否需要优化。"},
    {id:"md",name:"分子动力学 · 轨迹指标",description:"指定轨迹、统计区间、原子选择和单位，并随题提供必要输入。",instructions:"对给定体系计算指定的轨迹统计量。请补充模拟条件、统计区间、原子选择与单位。"},
    {id:"choice",name:"选择题 · 单选",description:"选项按行编号，评分比较选项序号。",instructions:"阅读结构与选项，提交正确选项的序号。",fields:[{key:"choices",label:"备选项（每行一项，序号从 1 开始）",required:true,type:"textarea"}]},
    {id:"scalar",name:"自定义 · 数值任务",description:"自定题面、参考数值和允许的绝对误差。",instructions:""}
  ];
  function fieldId(key){return typeof key==="string"&&/^[a-z][a-z0-9_-]{0,60}$/i.test(key)&&!["constructor","prototype","__proto__"].includes(key)}
  function definition(v) {
    if(!v||!fieldId(v.id)||typeof v.name!=="string"||!v.name.trim())throw Error("类型定义需要有效 id 和名称 name。");
    if(!Array.isArray(v.fields??[])||(v.fields??[]).length>50)throw Error("fields 需要是最多 50 项的数组。");
    const keys=new Set();
    const fields=(v.fields||[]).map(f=>{
      if(!f||!fieldId(f.key)||keys.has(f.key)||typeof f.label!=="string"||!f.label.trim()||!["text","textarea","number","select"].includes(f.type||"text"))throw Error("字段名称、类型或唯一 key 无效。");
      if(f.type==="select"&&(!Array.isArray(f.options)||!f.options.length||!f.options.every(x=>typeof x==="string"&&x.trim())))throw Error("select 字段需要字符串数组 options。");
      keys.add(f.key);return {key:f.key,label:f.label,type:f.type||"text",required:!!f.required,options:f.options};
    });
    return {id:v.id,name:v.name,instructions:String(v.instructions||""),description:String(v.description||""),fields};
  }
  const settingsKeys=["method","basis","solvent","solventModel","charge","multiplicity","calculation"];
  function fromInput(s){return Object.fromEntries(settingsKeys.map(k=>[k,k==="calculation"?(s.taskOptions||s.tasks).join(" + "):s[k]??""]))}
  function heavy(s){return s.atoms.reduce((n,a)=>n+(a.element==="H"?0:1),0)}
  function seedName(s){
    const title=String(s.title||"").trim();
    return title&&title.length<=64&&!/(?:^|\s)(?:Properties|Lattice|basis|method)=/i.test(title)?title:s.filename.replace(/\.[^.]+$/,"");
  }
  function generatedId(s,kind){
    const slug=s.filename.replace(/\.[^.]+$/,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40).replace(/-$/,"")||"molecule";
    return slug+"-"+kind;
  }
  function localized(text,lang){return globalThis.ChemI18n?.t(text,lang)??text}
  function taskText(def,key,lang){
    const value=def[key]||"";
    return kinds.includes(def)?localized(value,lang):value;
  }
  function generatedTitle(s,def,lang){
    return seedName(s)+" · "+taskText(def,"name",lang).split(" · ").pop();
  }
  function isDefaultTitle(p,def){
    const legacyStem=p.structure.title||p.structure.filename;
    return ["zh","en"].some(lang=>
      (p.kind==="heavy-atoms"&&p.structure.filename==="phenol.gjf"&&p.title===localized("苯酚重原子计数",lang))||
      p.title===generatedTitle(p.structure,def,lang)||
      p.title===legacyStem+" · "+taskText(def,"name",lang).split(" · ").pop()
    );
  }
  function isDefaultInstruction(def,text){
    return !!def&&["zh","en"].some(lang=>text===taskText(def,"instructions",lang));
  }
  function hasBoundInstruction(p){
    const source=p.grading?.sources?.value;
    return !!source&&["zh","en"].some(lang=>p.instructions===AnswerBook.instruction(source,lang));
  }
  function refreshDefaultText(p){
    const def=kinds.find(item=>item.id===p.kind);
    if(!def)return;
    if(isDefaultTitle(p,def))p.title=p.structure.filename==="phenol.gjf"&&def===kinds[0]?localized("苯酚重原子计数"):generatedTitle(p.structure,def);
    if(isDefaultInstruction(def,p.instructions))p.instructions=taskText(def,"instructions");
  }
  function fresh(s){return {grading:AnswerBook.blank("heavy-atoms"),version:1,id:generatedId(s,"heavy-atoms"),title:s.filename==="phenol.gjf"?localized("苯酚重原子计数"):generatedTitle(s,kinds[0]),kind:"heavy-atoms",instructions:taskText(kinds[0],"instructions"),structure:s,settings:fromInput(s),expected:String(heavy(s)),tolerance:"0",assets:[],profile:"asi",profileData:{},kindData:{},customKinds:[]}}
  function switchKind(p,next){
    const defs=[...kinds,...p.customKinds],before=defs.find(d=>d.id===p.kind),after=defs.find(d=>d.id===next);
    if(!after)throw Error("请选择有效的任务类型。");
    if(!p.instructions.trim()||isDefaultInstruction(before,p.instructions)||hasBoundInstruction(p))p.instructions=taskText(after,"instructions");
    if(isDefaultTitle(p,before))p.title=generatedTitle(p.structure,after);
    if(p.id.endsWith("-"+before.id))p.id=p.id.slice(0,-before.id.length)+after.id;
    const custom=p.grading?.custom;
    p.kind=next;p.grading=AnswerBook.blank(next);p.grading.custom=custom||null;
    p.expected="";p.tolerance=({energy:"0.00001",frequency:"1","bond-length":"0.000001","optimized-geometry":"0.10"})[next]||"0";
    if(next==="heavy-atoms")p.expected=String(heavy(p.structure));
    if(next==="bond-length")p.kindData[next]??={first:"1",second:"2"};
  }
  function replaceStructure(p,newSeed){
    const def=[...kinds,...p.customKinds].find(d=>d.id===p.kind);
    if(p.id===generatedId(p.structure,p.kind))p.id=generatedId(newSeed,p.kind);
    if(isDefaultTitle(p,def))p.title=generatedTitle(newSeed,def);
    if(!p.instructions.trim()||isDefaultInstruction(def,p.instructions)||hasBoundInstruction(p))p.instructions=taskText(def,"instructions");
    p.structure=newSeed;p.settings=fromInput(newSeed);
    p.grading.answers={};p.grading.sources={};
    p.expected=p.kind==="heavy-atoms"?String(heavy(newSeed)):"";
  }
  function checked(v) {
    if(!v||v.version!==1||!v.structure||typeof v.structure.filename!=="string")throw Error("请选择 Chembench Studio v1 项目文件。");
    const s=Chemistry.parse(v.structure.filename,v.structure.raw), p=fresh(s);
    for(const k of ["id","title","kind","instructions","expected","tolerance","profile"]){if(typeof v[k]!=="string")throw Error("项目字段无效："+k);p[k]=v[k]}
    const defs=(v.customKinds||[]).map(definition);const ids=new Set(kinds.map(x=>x.id));
    for(const def of defs){if(ids.has(def.id))throw Error("任务类型 ID 重复。");ids.add(def.id)}if(!ids.has(p.kind))throw Error("未知任务类型。");p.customKinds=defs;
    for(const k of settingsKeys)if(["string","number"].includes(typeof v.settings?.[k]))p.settings[k]=v.settings[k];
    for(const k of ["kindData","profileData"]){
      const groups=v[k]??{};
      if(typeof groups!=="object"||Array.isArray(groups))throw Error("项目选项组无效。");
      p[k]=Object.create(null);
      for(const [group,values] of Object.entries(groups)){
        if(!fieldId(group)||!values||typeof values!=="object"||Array.isArray(values))throw Error("项目选项组无效。");
        if(Object.entries(values).some(([key,value])=>!fieldId(key)||!["string","number"].includes(typeof value)))throw Error("项目选项值无效。");
        p[k][group]=Object.assign(Object.create(null),values);
      }
    }
    if(!Array.isArray(v.assets)||v.assets.some(a=>!a||typeof a.name!=="string"||typeof a.text!=="string"))throw Error("项目中的附加材料无效。");p.assets=v.assets;
    p.grading=AnswerBook.restore(p,v.grading);
    return p;
  }
  function prepare(p,def,profile){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)||p.id.length>60||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(p.id))throw Error("任务标识限 60 位小写字母、数字和分组连字符，并须避开系统保留名。");
    if(!p.title.trim()||!p.instructions.trim())throw Error("请在任务配置中填写任务名称与要求。");
    const assessment=AnswerBook.compile(p);
    const scalar=(p.grading?.mode??"scalar")==="scalar";
    if(["heavy-atoms","choice","bond-length"].includes(p.kind)&&!scalar)throw Error("该题型使用单个数值评分。请切换到综合任务以使用其他评分标准。");
    if(p.kind==="optimized-geometry"&&!assessment.rubric.criteria.some(c=>c.metric==="rmsd"))throw Error("完整构型题需要包含 RMSD 评分项。");
    if(p.kind==="heavy-atoms"&&(assessment.answers.value!==heavy(p.structure)||Number(p.tolerance)!==0))throw Error("重原子计数的答案须与结构一致，容差须为零。");
    const taskFields=p.kindData[p.kind]||{}, extra={...(p.profileData[p.profile]||{})};
    if(p.kind===Measurement.definition.id){
      const measured=Measurement.evaluate(p.structure,taskFields);
      if(Number(p.expected)!==Number(measured.expected))throw Error("请重新核对原子编号与参考距离。");
      if(!extra.oracle?.trim())extra.oracle=measured.oracle;
    }
    const publicLines=[];
    const englishPrompt=globalThis.BenchAdapters?.promptLanguage(p.instructions)==="en";
    for(const [fields,values,visible] of [[def.fields,taskFields,true],[profile.fields,extra,false]]){
      for(const f of fields||[]){const v=String(values[f.key]??f.default??"").trim();if(f.required&&!v)throw Error("请填写「"+f.label+"」。");if(v&&f.type==="number"&&!Number.isFinite(Number(v)))throw Error("「"+f.label+"」需要有效数值。");
        if(v&&visible){if(p.kind==="choice"&&f.key==="choices"){const choices=v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(choices.length<2||!Number.isInteger(+p.expected)||+p.expected<1||+p.expected>choices.length||+p.tolerance!==0)throw Error("单选题至少需要两个选项，答案须为有效序号，容差为零。");publicLines.push(choices.map((x,i)=>(i+1)+". "+x).join("\n"))}else publicLines.push((englishPrompt&&f.englishLabel||f.label)+" = "+v)}}
    }
    return {...p,...assessment, instructions:[p.instructions,...publicLines].join("\n\n"),tolerance:scalar?Number(p.tolerance):assessment.rubric.criteria[0].tolerance,extra:{...Object.fromEntries((profile.fields||[]).filter(f=>f.default!==undefined).map(f=>[f.key,f.default])),...extra}};
  }
  const table=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  function zip(files){
    const enc=new TextEncoder(),parts=[],index=[];let offset=0,count=0;
    const make=n=>{const b=new Uint8Array(n),d=new DataView(b.buffer);return {b,u16:(k,v)=>d.setUint16(k,v,true),u32:(k,v)=>d.setUint32(k,v,true)}};
    for(const [path,contents] of Object.entries(files)){
      if(!path||/^[\\/]|\\|:/.test(path)||path.split("/").some(p=>!p||p===".."||p==="."))throw Error("任务包路径无效。");
      const name=enc.encode(path),data=enc.encode(contents);let crc=0xffffffff;for(const n of data)crc=(crc>>>8)^table[(crc^n)&255];crc=(crc^0xffffffff)>>>0;
      const h=make(30);h.u32(0,0x04034b50);h.u16(4,20);h.u16(6,0x800);h.u16(12,33);h.u32(14,crc);h.u32(18,data.length);h.u32(22,data.length);h.u16(26,name.length);
      const c=make(46);c.u32(0,0x02014b50);c.u16(4,0x314);c.u16(6,20);c.u16(8,0x800);c.u16(14,33);c.u32(16,crc);c.u32(20,data.length);c.u32(24,data.length);c.u16(28,name.length);c.u32(38,(/\.sh$/.test(path)?0o100755:0o100644)*65536);c.u32(42,offset);
      parts.push(h.b,name,data);index.push(c.b,name);count++;offset+=30+name.length+data.length;
    }
    const len=index.reduce((n,b)=>n+b.length,0),end=make(22);end.u32(0,0x06054b50);end.u16(8,count);end.u16(10,count);end.u32(12,len);end.u32(16,offset);
    return new Blob([...parts,...index,end.b],{type:"application/zip"});
  }
  return {kinds,definition,fromInput,heavy,fresh,switchKind,replaceStructure,isDefaultInstruction,refreshDefaultText,checked,prepare,zip};
})();
