"use strict";
globalThis.AnswerBook = (() => {
  const decimal=/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
  const units={eh:"Eh",hartree:"Eh",hartrees:"Eh","e_h":"Eh","cm-1":"cm⁻¹","cm^-1":"cm⁻¹","cm**-1":"cm⁻¹","1/cm":"cm⁻¹","cm⁻¹":"cm⁻¹","å":"Å",angstrom:"Å",angstroms:"Å","ångström":"Å"};
  const equivalentUnit=u=>units[String(u).trim().toLowerCase()]||String(u).trim();
  function numeric(value,label){
    if((typeof value!=="number"&&typeof value!=="string")||!decimal.test(String(value).trim())||!Number.isFinite(Number(value)))throw Error("请填写有限数值："+label);
    return Number(value);
  }
  function blank(kind){
    const unit=({energy:"Eh",frequency:"cm⁻¹","bond-length":"Å"})[kind]||"";
    return {mode:kind==="optimized-geometry"?"geometry":"scalar",unit,custom:null,answers:{},sources:{}};
  }
  function rule(p){
    const g=p.grading||blank(p.kind);
    if(g.mode==="custom")return Rubrics.validate(g.custom);
    const tol=numeric(p.tolerance,"容差");
    if(tol<0)throw Error("容差必须大于或等于零。");
    if(g.mode==="geometry"){
      const r=Rubrics.geometry();return Rubrics.validate({...r,criteria:r.criteria.map(c=>({...c,tolerance:tol}))});
    }
    return Rubrics.scalar(tol,g.unit);
  }
  function sameOrder(seed,coords){
    return Array.isArray(coords)&&seed.length===coords.length&&seed.every((a,i)=>a.element===coords[i]?.element);
  }
  function sameComposition(seed,coords){
    if(seed.length!==coords.length)return false;
    const counts=new Map();
    for(const a of seed)counts.set(a.element,(counts.get(a.element)||0)+1);
    for(const a of coords)counts.set(a.element,(counts.get(a.element)||0)-1);
    return [...counts.values()].every(n=>n===0);
  }
  function restore(p,saved){
    const g=blank(p.kind);
    if(saved==null)return g;
    if(!["scalar","geometry","custom"].includes(saved.mode)||typeof saved.unit!=="string")throw Error("项目中的评分模式或单位无效。");
    g.mode=saved.mode;g.unit=saved.unit;
    if(saved.custom!=null)g.custom=Rubrics.validate(saved.custom);
    if(g.mode==="custom"&&!g.custom)throw Error("项目缺少自定义评分标准。");
    const fields=g.mode==="custom"?g.custom.criteria:g.mode==="geometry"?Rubrics.geometry().criteria:[{field:"value",metric:"absolute"}];
    for(const c of fields){
      if(Object.hasOwn(saved.answers||{},c.field)){
        const value=saved.answers[c.field];
        if(c.metric==="rmsd"){
          if(!sameOrder(p.structure.atoms,value)||value.some(a=>![a.x,a.y,a.z].every(Number.isFinite)))throw Error("项目中参考构型的元素顺序或坐标无效。");
          g.answers[c.field]=value.map(({element,x,y,z})=>({element,x,y,z}));
        }else if(typeof value==="number"||typeof value==="string")g.answers[c.field]=value;
        else throw Error("参考数值无效。");
      }
      const src=saved.sources?.[c.field];
      if(src){
        if(!["filename","program","job","property","unit"].every(k=>typeof src[k]==="string")||!Number.isSafeInteger(src.line)||src.line<1)throw Error("参考答案来源信息无效。");
        g.sources[c.field]=Object.fromEntries(["filename","program","job","property","unit","line"].map(k=>[k,src[k]]));
      }
    }
    return g;
  }
  function compile(p){
    const g=p.grading||blank(p.kind), rubric=rule(p),values={},sources={};
    for(const c of rubric.criteria){
      const v=g.mode==="scalar"?p.expected:g.answers[c.field];
      if(c.metric==="rmsd"){
        if(!v)throw Error("请导入「"+c.label+"」的参考坐标。");
        if(!sameOrder(p.structure.atoms,v))throw Error("参考构型须与输入结构的原子数和元素顺序一致。");
        values[c.field]=v;
      }else values[c.field]=numeric(v,c.label);
      const src=g.sources[c.field];
      if(src){
        if(equivalentUnit(c.unit)!==equivalentUnit(src.unit))throw Error("「"+c.label+"」的参考来源和评分单位不一致，请重新绑定。");
        if(p.assets.some(a=>a.name.toLowerCase()===src.filename.toLowerCase()))throw Error("参考文件 "+src.filename+" 也在公开补充材料中。请从公开材料移除后导出。");
        sources[c.field]={...src};
      }
    }
    return {rubric,answers:Rubrics.validateAnswers(rubric,values),answerSources:sources};
  }
  function instruction(source, language=globalThis.ChemI18n?.lang){
    if(!source)return "";
    if(language==="en"){
      const property=globalThis.ChemI18n?.t(source.property,"en")??source.property;
      return "Using the supplied structure and calculation settings, determine "+property+" and submit a value in "+source.unit+".";
    }
    return "按随题结构和计算设置求出"+source.property+"，以 "+source.unit+" 为单位提交数值。";
  }
  function apply(p,c,property,job,file){
    if(!job.complete)throw Error("该作业尚未正常完成，无法写入标准答案。");
    if((c.metric==="rmsd")!==(property.kind==="geometry"))throw Error("所选结果与评分项的数据类型不匹配。");
    if((c.unit||p.grading.mode==="custom")&&equivalentUnit(c.unit)!==equivalentUnit(property.unit))throw Error("单位不匹配："+property.unit+" → "+c.unit+"。");
    if(property.kind==="geometry"){
      if(!sameOrder(p.structure.atoms,property.value))throw Error("参考坐标与输入结构的原子数或元素顺序不同。");
      if(p.kind==="optimized-geometry"&&file.program!=="XYZ"&&job.optimization!=="converged")throw Error("优化构型任务需要有几何收敛记录的计算步，或由出题人提供独立参考 XYZ。");
    }
    if(p.grading.mode==="scalar"){
      p.expected=String(property.value);if(!p.grading.unit)p.grading.unit=property.unit;
    }else p.grading.answers[c.field]=property.value;
    p.grading.sources[c.field]={filename:file.filename,program:file.program,job:job.label,property:property.label,unit:property.unit,line:property.line};
  }
  return {blank,rule,compile,restore,apply,instruction,sameOrder,sameComposition,equivalentUnit};
})();
