"use strict";
globalThis.AnswerUI = (() => {
  const automatic=new Set(["heavy-atoms","choice","bond-length"]);
  const metrics={absolute:"绝对误差",relative:"相对误差（比例）",rmsd:"对齐 RMSD"};
  const example={
    version:1,id:"energy_and_geometry",name:"能量与优化构型",
    criteria:[
      {field:"energy",label:"最终电子能量",metric:"absolute",unit:"Eh",tolerance:0.00001,weight:40},
      {field:"geometry",label:"优化构型",metric:"rmsd",unit:"Å",tolerance:0.10,weight:60}
    ]
  };
  const authorGuide=[
    "请为我的化学任务生成一份可直接导入 Chembench Studio 的 UTF-8 JSON。仅返回 JSON 对象。",
    "顶层包含 version（数字 1）、id（英文标识符）、name、criteria。每个评分项包含唯一的英文字段 field、显示名 label、metric、unit、非负数 tolerance 和正数 weight。",
    "absolute 使用同单位的绝对误差；relative 使用相对误差，0.01 代表 1%，零参考值要求恰好为零；rmsd 使用 Å，按相同原子顺序进行无镜像刚体对齐。每项达标即得该项全部权重，总分按权重归一化。",
    "规则文件仅描述评分方法。标准答案另由出题人从计算输出绑定或填写。题目使用何种方法、物理量、单位和容差请在生成前确认。",
    "以下是可导入的格式示例。"
  ].join("\n\n")+"\n\n"+JSON.stringify(example,null,2);
  const t=(text,lang)=>globalThis.ChemI18n?.t(text,lang)??text;
  const english=()=>globalThis.ChemI18n?.lang==="en";
  function exampleRule(){
    if(!english())return example;
    return {...example,name:t(example.name),criteria:example.criteria.map(c=>({...c,label:t(c.label)}))};
  }
  function guideText(){
    if(!english())return authorGuide;
    return [
      "Generate a UTF-8 JSON grading rule for my chemistry task, suitable for importing into Chembench Studio. Return only one JSON object.",
      "Include version (the number 1), id (an ASCII identifier), name, and criteria. Each criterion must have a unique ASCII field name, a display label, metric, unit, a nonnegative tolerance, and a positive weight.",
      "Use absolute for absolute error in the submitted units. Use relative for fractional error (0.01 means 1%); a zero reference requires an exact zero. Use rmsd for geometry in Å, preserving atom order and allowing translation and proper rotation. Each passing criterion earns its full weight. Divide the earned weight by the total weight for the overall score.",
      "Describe the grading method only. The author will provide reference values separately. Check the task's calculation method, quantities, units and thresholds before generating the rubric.",
      "Example importable rule", JSON.stringify(exampleRule(),null,2)
    ].join("\n\n");
  }
  function setup(api){
    const {$,el,btn,modal,error,toast,saveJson,download,picked,read,project,commit,close,storage}=api;
    // Mixed text can contain author-defined field names, filenames, or units.
    function literal(tag,text,cls){
      const node=el(tag,null,cls);node.setAttribute("data-no-i18n","");node.textContent=text;return node;
    }
    function option(label,value){const o=new Option(label,value);o.setAttribute("data-no-i18n","");return o}
    function withUnit(label,unit){return unit?label+(english()?" ("+unit+")":"（"+unit+"）"):label}
    function withError(fn){return ()=>{try{fn()}catch(e){error(e)}}}
    function refreshSource(){
      const p=project(),rows=Object.entries(p.grading.sources);
      $("reference-sources").replaceChildren(...rows.map(([key,s])=>literal("p",key+" ← "+s.filename+" · "+t(s.job)+" · "+t(s.property)+" · "+t("第 "+s.line+" 行"),"hint")));
    }
    function selectRule(next,imported){
      const p=structuredClone(project()),custom=imported||p.grading.custom;
      if(next==="custom"&&!custom)throw Error("请先导入评分规则。");
      const kind=next==="geometry"?"optimized-geometry":next==="custom"?"observables":"scalar";
      // Preserve authored task-specific fields when a custom definition owns the prompt.
      if(Studio.kinds.some(k=>k.id===p.kind))Studio.switchKind(p,kind);
      p.grading=AnswerBook.blank(p.kind);p.grading.mode=next;p.grading.custom=custom||null;
      p.expected="";p.tolerance=next==="geometry"?"0.10":"0";
      commit(p);
    }
    function activeCriteria(p){
      if(p.grading.mode==="custom")return p.grading.custom.criteria;
      if(p.grading.mode==="geometry")return Rubrics.geometry().criteria;
      return [{field:"value",label:"参考数值",metric:"absolute",unit:p.grading.unit}];
    }
    function render(){
      const p=project(),g=p.grading,scalar=g.mode==="scalar",custom=g.mode==="custom";
      const selector=$("rubric-mode");selector.replaceChildren(option(t("数值 · 容差判定"),"scalar"),option(t("完整构型 · 对齐 RMSD"),"geometry"));
      if(g.custom)selector.add(option((english()?"Imported · ":"导入 · ")+g.custom.name,"custom"));selector.value=g.mode;
      $("scalar-reference").hidden=!scalar;$("unit-row").hidden=!scalar||["choice","heavy-atoms"].includes(p.kind);
      $("answer-unit").value=g.unit;$("answer-unit").readOnly=p.kind==="bond-length";
      $("tolerance-row").hidden=custom;$("tolerance-label").textContent=g.mode==="geometry"?t("RMSD 容差（Å）"):withUnit(t("绝对容差"),g.unit);
      const host=$("criterion-answers");host.replaceChildren();
      if(!scalar)for(const c of activeCriteria(p)){
        const box=el("div",null,"reference-item"),value=g.answers[c.field],title=custom?c.label:t(c.label);
        if(c.metric==="rmsd"){
          box.append(literal("strong",title+" · "+t(value?value.length+" 个原子":"待写入坐标")));
          if(value){const detail=el("details");detail.append(el("summary",t("查看参考 XYZ")),literal("pre",[value.length,title,...value.map(a=>[a.element,a.x,a.y,a.z].join(" "))].join("\n")));box.append(detail)}
        }else{
          const label=literal("label",title+" · "+c.unit),input=el("input");input.inputMode="decimal";input.value=value??"";input.placeholder=t("填写数值或读取计算输出");
          input.oninput=()=>{g.answers[c.field]=input.value;delete g.sources[c.field];refreshSource();storage()};label.append(input);box.append(label);
        }
        if(custom)box.append(literal("small",c.field+" · "+t(metrics[c.metric])+" ≤ "+c.tolerance+(c.metric==="relative"?"":" "+c.unit)+" · "+t("权重")+" "+c.weight));
        else box.append(el("small","按输入原子顺序进行刚体对齐，直接比较坐标的 RMSD。"));
        host.append(box);
      }
      refreshSource();
    }
    $("rubric-mode").onchange=withError(()=>{
      const p=project(),next=$("rubric-mode").value;
      if(Object.keys(p.grading.answers).length||Object.keys(p.grading.sources).length||(p.expected!==""&&!["heavy-atoms","bond-length"].includes(p.kind))){
        $("rubric-mode").value=p.grading.mode;
        modal("切换评分标准",el("p","切换后需要按新标准重新填写或绑定参考答案。种子结构和补充材料会保留。"),
          btn("切换并重新绑定",withError(()=>{selectRule(next);close()}),"btn primary"),btn("保留当前标准",close));
      }else selectRule(next);
    });
    $("answer-unit").oninput=()=>{const p=project();p.grading.unit=$("answer-unit").value.trim();$("tolerance-label").textContent=withUnit(t("绝对容差"),p.grading.unit);storage()};
    $("import-rubric").onclick=()=>$("rubric-file").click();
    picked("rubric-file",async([f])=>{const r=Rubrics.validate(await read(f));
      modal("导入评分标准",literal("h3",r.name),el("p","将为下列评分项重新绑定参考答案。"),...r.criteria.map(c=>literal("p",c.label+" · "+t(metrics[c.metric])+" ≤ "+c.tolerance+" · "+t("权重")+" "+c.weight,"hint")),
        btn("应用评分标准",withError(()=>{selectRule("custom",r);close();toast("评分标准已应用，请绑定参考答案")}),"btn primary"));
    });
    $("save-rubric").onclick=withError(()=>{const r=AnswerBook.rule(project());saveJson(r.id+".rubric.json",r)});
    $("rule-guide").onclick=()=>{const code=el("textarea");code.rows=12;code.readOnly=true;code.value=guideText();
      modal("给 AI 的评分标准格式",el("p","可将下面的说明和你的题目一起交给 AI。生成的 JSON 可通过「导入规则 JSON」载入。"),code,
        btn("选中说明",()=>{code.focus();code.select()}),btn("下载示例规则",()=>saveJson("energy-and-geometry.rubric.json",exampleRule())));
    };
    $("grade-kit").onclick=withError(()=>{
      const p=project(),def=[...Studio.kinds,...p.customKinds].find(k=>k.id===p.kind);
      const a=Studio.prepare(p,def,{fields:[]}),privateKey={rubric:a.rubric,answers:a.answers,answerSources:a.answerSources};
      const readme=[
        "# "+p.title,"本包供出题人离线评分。rubric.json 可公开复用，private-reference.json 仅供评分方。",
        "使用 Python 3.11 或更高版本。在解压目录运行：",
        "    python grade.py submission.json private-reference.json",
        "输出 JSON 含 0–1 总分、全部通过标记以及各评分项的误差和判定。多次运行可分别保存 JSON 作为独立评分记录。",
        "提交 JSON 按下列字段填写：",...a.rubric.criteria.map(c=>"- "+c.field+" · "+(p.grading.mode==="custom"?c.label:t(c.label))+" · "+c.unit+" · "+t(c.metric==="rmsd"?"按输入原子顺序提交 [{element,x,y,z}, ...]":"有限数值")),
        "只有一个 RMSD 项时，也可用 submission.xyz 替换 submission.json。框架评测请使用对应的框架任务包。"
      ].map(line=>line.startsWith("# ")||line.startsWith("- ")?line:t(line)).join("\n\n");
      const files={"grade.py":Rubrics.pythonSource,"rubric.json":JSON.stringify(a.rubric,null,2),"private-reference.json":JSON.stringify(privateKey,null,2),"README.md":readme};
      download(Studio.zip(files),(p.id||"chembench")+"-grader.zip");toast("已生成独立评分包，内含私有参考答案");
    });
    function pickList(title,id){const l=el("label"),s=el("select");s.id=id;l.append(literal("span",title),s);return {label:l,select:s}}
    function outputDialog(file,result){
      const p=project(),automaticTask=automatic.has(p.kind)&&p.grading.mode==="scalar",jobs=result.jobs;
      if(!jobs.length)throw Error("文件中没有检测到计算步骤。");
      const choices=pickList(t("计算步骤"),"result-job");
      for(const [i,j] of jobs.entries())choices.select.add(option(t(j.label)+" · "+t(j.complete?"已完成":"未完成"),String(i)));
      choices.select.value=String(jobs.length-1);
      const bindings=el("div"),notice=el("div"),context=literal("p",result.program+" · "+file.name,"hint");
      const apply=btn("写入标准答案",null,"btn primary");apply.id="apply-results";
      let chosen=[];
      function display(){
        const job=jobs[Number(choices.select.value)];chosen=[];bindings.replaceChildren();notice.replaceChildren();
        const flags=[...(job.warnings||[])];
        if(job.optimization==="none"&&job.properties.some(v=>v.kind==="geometry"))flags.push("本步没有几何优化收敛记录，坐标表示该计算步的构型。");
        const xyz=job.properties.find(x=>x.kind==="geometry");
        const mismatch=xyz&&!AnswerBook.sameComposition(p.structure.atoms,xyz.value);
        if(mismatch)flags.push("本计算步的元素组成与当前输入结构不符。请核对计算文件和输入结构。");
        if(automaticTask)flags.push("当前题型使用自动答案。写入后将按所选物理量切换题型。");
        for(const warning of flags)notice.append(el("p",warning,"rule-message"));
        let accept;
        if(mismatch){
          const label=el("label","我已核对题面，此标量评分项使用不同体系的参考值");accept=el("input");accept.type="checkbox";accept.className="reference-confirm";label.prepend(accept);notice.append(label);accept.onchange=sync;
        }
        const items=automaticTask?[{field:"value",label:"所需结果",metric:"choose",unit:""}]:activeCriteria(p);
        for(const c of items){
          const displayLabel=p.grading.mode==="custom"?c.label:t(c.label);
          const box=el("div",null,"binding-block"),{label,select}=pickList(withUnit(displayLabel,c.unit),"bind-"+c.field),detail=el("div",null,"binding-result");
          const candidates=job.properties.filter(prop=>{
            if(c.metric!=="choose"&&((c.metric==="rmsd")!==(prop.kind==="geometry")))return false;
            if(prop.kind==="geometry"&&!AnswerBook.sameOrder(p.structure.atoms,prop.value))return false;
            return (!c.unit&&p.grading.mode!=="custom")||AnswerBook.equivalentUnit(c.unit)===AnswerBook.equivalentUnit(prop.unit);
          });
          select.add(option(t(items.length>1?"跳过此项":"请选择要写入的结果"),""));
          for(const prop of candidates)select.add(option(t(prop.label)+" · "+prop.unit+" · L"+prop.line,prop.id));
          if(candidates.length===1&&(items.length===1||candidates[0].kind==="geometry"&&job.optimization==="converged"))select.value=candidates[0].id;
          if(!candidates.length)detail.textContent="当前步骤没有类型、单位和原子顺序匹配的结果。";
          box.append(label,detail);bindings.append(box);chosen.push({c,select,candidates,detail});select.onchange=sync;
        }
        function sync(){
          let any=false,blocked=!job.complete;
          for(const row of chosen){const prop=row.candidates.find(v=>v.id===row.select.value);if(!prop){if(row.candidates.length)row.detail.textContent="";continue}any=true;
            const blockedOpt=prop.kind==="geometry"&&(automaticTask||p.kind==="optimized-geometry")&&result.program!=="XYZ"&&job.optimization!=="converged";
            row.detail.textContent=blockedOpt?t("未找到该步几何优化收敛记录。"):prop.kind==="geometry"?t(prop.value.length+" 个原子")+" · Å · "+t("元素顺序已核对"):String(prop.value)+" "+prop.unit;
            if(blockedOpt)blocked=true;
          }
          apply.disabled=!any||blocked||(mismatch&&!accept.checked);
        }
        sync();
      }
      choices.select.onchange=display;
      apply.onclick=withError(()=>{
        const job=jobs[Number(choices.select.value)],draft=structuredClone(p);
        for(const row of chosen){
          const prop=row.candidates.find(v=>v.id===row.select.value);if(!prop)continue;
          let criterion=row.c;
          if(automaticTask){
            const next=prop.kind==="geometry"?"optimized-geometry":prop.unit==="Eh"?"energy":AnswerBook.equivalentUnit(prop.unit)==="cm⁻¹"?"frequency":"scalar";
            Studio.switchKind(draft,next);criterion=activeCriteria(draft)[0];
          }
          const previousSource=draft.grading.sources.value;
          AnswerBook.apply(draft,criterion,prop,job,{filename:file.name,program:result.program});
          const def=Studio.kinds.find(k=>k.id===draft.kind);
          const defaultInstruction=def&&(Studio.isDefaultInstruction?Studio.isDefaultInstruction(def,draft.instructions):draft.instructions===def.instructions);
          const sourceInstruction=["zh","en"].some(lang=>draft.instructions===AnswerBook.instruction(previousSource,lang));
          if(draft.grading.mode==="scalar"&&def&&(!draft.instructions.trim()||defaultInstruction||sourceInstruction)){
            draft.instructions=AnswerBook.instruction(draft.grading.sources.value);
          }
        }
        commit(draft);close();toast("标准答案已写入，来源已记录");
      });
      display();modal("从计算结果写入答案",context,choices.label,notice,bindings,apply);
    }
    $("load-output").onclick=()=>$("result-file").click();
    picked("result-file",async([f])=>{
      const bytes=new Uint8Array(await f.arrayBuffer());
      let text;
      if(bytes[0]===255&&bytes[1]===254)text=new TextDecoder("utf-16le").decode(bytes);
      else if(bytes[0]===254&&bytes[1]===255)text=new TextDecoder("utf-16be").decode(bytes);
      else{
        try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}
        catch{text=new TextDecoder("windows-1252").decode(bytes)}
      }
      if(/\.xyz$/i.test(f.name)){
        const s=Chemistry.parse(f.name,text);
        outputDialog(f,{program:"XYZ",jobs:[{label:"参考构型",complete:true,optimization:"author-supplied",warnings:["独立 XYZ 的优化状态由出题人确认。"],properties:[{id:"geometry",kind:"geometry",value:s.atoms,label:"参考笛卡尔坐标",unit:"Å",line:3}]}]});
      }else outputDialog(f,ChemResults.parse(f.name,text));
    });
    return {render,refreshSource};
  }
  return {setup};
})();
