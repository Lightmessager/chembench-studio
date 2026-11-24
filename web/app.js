"use strict";
(() => {
  const $=id=>document.getElementById(id), all=s=>Array.from(document.querySelectorAll(s));
  const paths={
    brand:'<path d="m4 8 7 4 9-5M11 12v8M4 8v8l7 4 9-5V7l-7-4z"/><path d="m7.5 6 8 4.5"/>',
    molecule:'<circle cx="5" cy="15" r="2.5"/><circle cx="12" cy="6" r="2.5"/><circle cx="19" cy="15" r="2.5"/><path d="m7 13 3.6-5m3 0 3.8 5M8 16h8"/>',
    cube:'<path d="m12 2 9 5v10l-9 5-9-5V7zm0 10L3 7m9 5 9-5m-9 5v10"/>',
    sliders:'<path d="M3 5h6m4 0h8M3 12h12m4 0h2M3 19h3m4 0h11"/><circle cx="11" cy="5" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
    package:'<path d="m3 7 9-5 9 5v10l-9 5-9-5zm0 0 9 5 9-5m-9 5v10M7.5 4.5l9 5v4"/>',
    drive:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
    book:'<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1zm9 1v14"/>',
    folder:'<path d="M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11H3z"/>',
    upload:'<path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5"/>', download:'<path d="M12 3v13m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    edit:'<path d="m4 16-1 5 5-1L20 8l-4-4zm9-9 4 4"/>',swap:'<path d="M3 8h17l-4-4m5 12H4l4 4"/>',
    file:'<path d="M6 2h8l5 5v15H6zm8 0v6h5M9 13h7m-7 4h5"/>',reset:'<path d="M3 11a9 9 0 1 1 1 6M3 5v6h6"/>',
    arrow:'<path d="M3 12h17m-6-6 6 6-6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'
  };
  for(const e of all("[data-icon]"))e.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24">'+paths[e.dataset.icon]+'</svg>';
  const profiles=[...BenchAdapters.profiles,HarborIndex.profile];
  const storageKey="chembench.studio.v1", authorKey=storageKey+".authored-text", demo=()=>Studio.fresh(Chemistry.parse("phenol.gjf",CHEMBENCH_SAMPLE));
  // Remember explicitly authored text even if it happens to match a built-in template.
  let authored={};
  let p=demo(),restoreError="";
  try{const saved=localStorage.getItem(storageKey);if(saved){p=Studio.checked(JSON.parse(saved));try{authored=JSON.parse(localStorage.getItem(authorKey))||{}}catch{authored={}}}}catch(e){restoreError="草稿恢复失败，已打开示例。可从项目文件恢复备份。"}
  if(!profiles.some(x=>x.id===p.profile))p.profile="asi";
  let mode="model",page="structure",timer,previewFiles={};
  const viewer=MoleculeView.setup($("canvas"),$("axis"));
  function el(tag,txt,cls){const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e}
  function verbatim(node){node.setAttribute("data-no-i18n","");return node}
  function btn(txt,action,cls="btn secondary"){const b=el("button",txt,cls);b.onclick=action;return b}
  function toast(s){$("toast").textContent=s;$("toast").hidden=false;clearTimeout(timer);timer=setTimeout(()=>$("toast").hidden=true,4400)}
  function storage(){
    const status=$("save-state");
    try{localStorage.setItem(storageKey,JSON.stringify(p));localStorage.setItem(authorKey,JSON.stringify(authored));status.removeAttribute("data-error");status.textContent="草稿已保存"}
    catch{status.setAttribute("data-error","");status.textContent="请另存项目备份"}
  }
  function modal(title,...children){$("dialog-title").removeAttribute("data-no-i18n");$("dialog-title").textContent=title;$("dialog-body").replaceChildren(...children);if(!$("dialog").open)$("dialog").showModal()}
  function error(e){modal("需要调整",el("p",e.message||String(e)))}
  $("close").onclick=()=>$("dialog").close();
  function download(blob,name){const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
  function saveJson(name,obj){download(new Blob([JSON.stringify(obj,null,2)],{type:"application/json;charset=utf-8"}),name)}
  function specs(){return [...Studio.kinds,...p.customKinds]}
  function activeDef(){return specs().find(x=>x.id===p.kind)}
  function activeProfile(){return profiles.find(x=>x.id===p.profile)}
  function show(next){
    page=next;for(const e of all("main .page"))e.hidden=e.id!==page;
    for(const b of all("[data-page]")){const on=b.dataset.page===page;b.classList.toggle("active",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")}
    $("crumb").textContent=({structure:"结构工作台",task:"任务配置",export:"打包导出"})[next];
    if(next==="export")renderExport();if(next==="task")renderTask();if(next==="structure")viewer.redraw();window.scrollTo(0,0);
  }
  for(const b of all("[data-page],[data-go]"))b.onclick=()=>show(b.dataset.page||b.dataset.go);
  function counts(){const m=new Map();for(const a of p.structure.atoms)m.set(a.element,(m.get(a.element)||0)+1);
    const score=k=>m.has("C")?(k==="C"?0:k==="H"?1:2):2;
    return [...m].sort(([a],[b])=>score(a)-score(b)||a.localeCompare(b))}
  function renderStructure(rebuildModel=true){
    const s=p.structure,countsArray=counts();$("formula").replaceChildren();$("legend").replaceChildren();
    for(const [symbol,n] of countsArray){$("formula").append(document.createTextNode(symbol));if(n>1)$("formula").append(el("sub",n));const item=el("span",null,"legend-item"),dot=el("span",null,"swatch");dot.style.backgroundColor=MoleculeView.colors[symbol]||"#83b6b9";item.append(dot,document.createTextNode(symbol));item.title=symbol+" × "+n;$("legend").append(item)}
    $("natoms").textContent=s.atoms.length+" 个原子";$("model-file").textContent=s.title||s.filename;$("file-name").textContent=s.filename;
    $("file-format").textContent=s.format.toUpperCase();$("file-detail").replaceChildren(el("span",s.format==="xyz"?"XYZ 笛卡尔坐标":"Gaussian 输入文件"),document.createTextNode(" · "+new Intl.NumberFormat("en").format(new TextEncoder().encode(s.raw).length)+" B"));
    $("route").textContent=s.route||ChemI18n.t("源文件未提供 Gaussian 路由");$("raw").textContent=s.raw;
    const props=[["计算方法","method"],["基组","basis"],["溶剂 / 模型",null],["电荷 / 多重度",null],["计算任务","calculation"]];
    if(s.link0?.nprocshared||s.link0?.mem)props.push(["源文件资源",null]);
    const rows=props.map(([name,k],i)=>{const row=el("div");const val=i===5?[s.link0.nprocshared?s.link0.nprocshared+" "+ChemI18n.t("核"):"",s.link0.mem].filter(Boolean).join(" / "):k?p.settings[k]:i===2?[p.settings.solvent,p.settings.solventModel].filter(Boolean).join(" / "):[p.settings.charge,p.settings.multiplicity].map(x=>x===""||x==null?"—":x).join(" / ");row.append(el("dt",name),val===""||val==null?el("dd","未指定"):verbatim(el("dd",val)));return row});
    $("properties").replaceChildren(...rows);$("warning").replaceChildren(...s.warnings.map(w=>el("div",w)));$("warning").hidden=!s.warnings.length;
    if(rebuildModel){
      $("coords").replaceChildren();
      const large=viewer.set(s.atoms);
      $("style").disabled=large;$("style").title=large?"超过 4000 个原子时以点云显示完整结构":"切换球棍或空间填充模型";
      $("style").firstChild.textContent=large?"点云模型 ":"球棍模型 ";
    }
    setMode(mode);
  }
  function renderCoordinates(start=0){
    const host=$("coords"),atoms=p.structure.atoms,pageSize=250,end=Math.min(start+pageSize,atoms.length);
    const table=el("table"),tr=el("tr");
    for(const title of ["#","元素","X / Å","Y / Å","Z / Å"])tr.append(el("th",title));
    table.createTHead().append(tr);
    const body=table.createTBody();
    for(let i=start;i<end;i++){
      const a=atoms[i],row=body.insertRow();
      for(const value of [i+1,a.element,a.x.toFixed(5),a.y.toFixed(5),a.z.toFixed(5)])row.insertCell().textContent=value;
    }
    host.replaceChildren();
    if(atoms.length>pageSize){
      const controls=el("div",null,"cardhead"),back=btn("上一页",()=>renderCoordinates(start-pageSize),"textbtn"),next=btn("下一页",()=>renderCoordinates(end),"textbtn");
      back.disabled=start===0;next.disabled=end>=atoms.length;
      controls.append(back,el("span",(start+1)+"–"+end+" / "+atoms.length),next);host.append(controls);
    }
    host.append(table);host.scrollTop=0;
  }
  function setMode(m){
    mode=m;
    for(const v of ["model","coords","source"])$(v).hidden=v!==m;
    for(const b of all("[data-mode]")){
      const active=b.dataset.mode===m;
      b.classList.toggle("active",active);b.setAttribute("aria-pressed",active);
    }
    if(m==="coords"&&!$("coords").children.length)renderCoordinates();
    if(m==="model")viewer.redraw();
  }
  for(const b of all("[data-mode]"))b.onclick=()=>setMode(b.dataset.mode);
  $("plus").onclick=()=>viewer.magnify(1.16);$("minus").onclick=()=>viewer.magnify(1/1.16);$("reset").onclick=viewer.reset;
  const modelCard=document.querySelector(".model-card");
  const enterFull=modelCard.requestFullscreen||modelCard.webkitRequestFullscreen;
  if(enterFull){
    const full=btn(null,async()=>{
      try{
        if(document.fullscreenElement||document.webkitFullscreenElement){
          const exitFull=document.exitFullscreen||document.webkitExitFullscreen;
          await exitFull.call(document);
        } else await enterFull.call(modelCard);
      }catch{toast("当前浏览器窗口限制了全屏显示。")}
    });
    full.id="fullscreen";full.className="";full.title="全屏观察";
    full.setAttribute("aria-label","全屏观察");
    full.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
    $("style").after(full);
    const changed=()=>{const active=!!(document.fullscreenElement||document.webkitFullscreenElement);full.title=active?"退出全屏":"全屏观察";full.setAttribute("aria-label",full.title);full.setAttribute("aria-pressed",active);viewer.redraw()};
    document.addEventListener("fullscreenchange",changed);
    document.addEventListener("webkitfullscreenchange",changed);
  }
  $("style").onclick=()=>{$("style").firstChild.textContent=(viewer.toggle()?"空间填充":"球棍模型")+" "};
  async function read(f){const buf=await f.arrayBuffer();let t;try{t=new TextDecoder("utf-8",{fatal:true}).decode(buf)}catch{throw Error("请使用 UTF-8 编码的文本文件。")}if(t.includes("\0"))throw Error("选择的文件包含二进制数据。");return t}
  function picked(id,handler){$(id).onchange=async e=>{const fs=Array.from(e.target.files);e.target.value="";if(!fs.length)return;try{await handler(fs)}catch(e){error(e)}}}
  async function importStructure(f){
    const s=Chemistry.parse(f.name,await read(f));
    Studio.replaceStructure(p,s);updateDistance();
    mode="model";renderStructure();storage();show("structure");toast("已读取 "+s.atoms.length+" 个原子");
  }
  picked("file",([f])=>importStructure(f));
  for(const b of all(".import"))b.onclick=()=>$("file").click();$("drop").onclick=()=>$("file").click();
  $("drop").onkeydown=e=>{if(["Enter"," "].includes(e.key)){e.preventDefault();$("file").click()}};
  $("drop").ondragover=e=>{e.preventDefault();$("drop").classList.add("over")};$("drop").ondragleave=()=>$("drop").classList.remove("over");
  $("drop").ondrop=async e=>{e.preventDefault();$("drop").classList.remove("over");try{if(e.dataTransfer.files.length!==1)throw Error("请一次拖入一个结构文件。");await importStructure(e.dataTransfer.files[0])}catch(e){error(e)}};
  function field(f,val,oninput,custom=false){const l=el("label",f.label+(f.required?" *":""));if(custom)verbatim(l);const i=el(f.type==="select"?"select":f.type==="textarea"?"textarea":"input");if(f.type==="select")for(const x of f.options||[])i.add(new Option(x.label??x,x.value??x));else if(f.type==="textarea")i.rows=3;else {i.type=f.type==="number"?"number":"text";if(i.type==="number")i.step="any"}
    if(f.placeholder)i.placeholder=f.placeholder;i.required=!!f.required;i.value=val??f.default??(f.type==="select"?i.options[0]?.value:"")??"";i.oninput=()=>oninput(i.value);l.append(i);return l}
  $("edit").onclick=()=>{
    const tmp={...p.settings},form=el("form"),note=el("p","这里填写本题采用的参数，导出时写入 calculation.json。原始路由可在「原文」中核对。","hint");form.append(note);
    for(const [k,label] of Object.entries({method:"计算方法",basis:"基组",solvent:"溶剂",solventModel:"溶剂模型",charge:"电荷",multiplicity:"自旋多重度",calculation:"计算任务 / 选项"}))form.append(field({key:k,label},tmp[k],v=>tmp[k]=v.trim()));
    const msg=el("div",null,"error");msg.hidden=true;form.append(msg,el("button","应用参数","btn primary"));
    form.onsubmit=e=>{e.preventDefault();if((tmp.charge!==""&&!Number.isSafeInteger(Number(tmp.charge)))||(tmp.multiplicity!==""&&(!Number.isSafeInteger(Number(tmp.multiplicity))||Number(tmp.multiplicity)<1))){msg.hidden=false;msg.textContent="电荷须为整数，多重度须为正整数。";return}for(const k of ["charge","multiplicity"])if(tmp[k]!=="")tmp[k]=Number(tmp[k]);p.settings=tmp;renderStructure();storage();$("dialog").close()};modal("编辑计算参数",form);
  };
  function renderDynamic(host,fields,values,refresh,custom=false){host.replaceChildren();for(const f of fields||[]){if(values[f.key]===undefined&&f.type==="select")values[f.key]=f.default??f.options[0]?.value??f.options[0]??"";host.append(field(f,values[f.key],v=>{values[f.key]=v;storage();if(refresh)preview();else if(p.kind===Measurement.definition.id){updateDistance();storage()}},custom))}}
  function updateDistance(){
    if(p.kind!==Measurement.definition.id)return;
    const values=p.kindData[p.kind]??={first:"1",second:"2"};
    try{p.expected=Measurement.evaluate(p.structure,values).expected;$("kind-hint").textContent=Measurement.definition.description}
    catch(e){p.expected="";$("kind-hint").textContent=e.message}
    $("expected").value=p.expected;
  }
  function renderTask(){
    const def=activeDef(), custom=p.customKinds.includes(def);$("kind").replaceChildren(...specs().map(x=>{const option=new Option(x.name,x.id);return p.customKinds.includes(x)?verbatim(option):option}));$("kind").value=p.kind;$("kind-hint").toggleAttribute("data-no-i18n",custom);$("kind-hint").textContent=def.description;
    for(const [id,k] of [["title","title"],["task-id","id"],["instructions","instructions"],["expected","expected"],["tolerance","tolerance"]]){$(id).value=p[k];$(id).oninput=()=>{p[k]=$(id).value;if(k==="title"||k==="instructions")authored[k]=p[k];if(k==="expected")delete p.grading.sources.value;answerControls.refreshSource();storage()}}
    updateDistance();$("expected").readOnly=["heavy-atoms",Measurement.definition.id].includes(p.kind);$("tolerance").readOnly=["choice","heavy-atoms"].includes(p.kind);
    const auto=p.kind==="heavy-atoms"||p.kind===Measurement.definition.id;
    let indicator=$("reference-mode");
    if(!indicator){indicator=el("small","由结构计算","reference-mode");indicator.id="reference-mode";$("expected").before(indicator)}
    indicator.hidden=!auto;
    answerControls.render();
    const vals=p.kindData[p.kind]??={};renderDynamic($("kind-fields"),def.fields,vals,false,custom);
    $("assets").replaceChildren(...p.assets.map((a,i)=>{const row=el("div",null,"asset");row.append(verbatim(el("span",a.name)),btn("移除",()=>{p.assets.splice(i,1);renderTask();storage()},"textbtn"));return row}));
  }
  $("kind").onchange=()=>{Studio.switchKind(p,$("kind").value);renderTask();storage()};
  const answerControls=AnswerUI.setup({
    $,el,btn,modal,error,toast,saveJson,download,picked,read,
    project:()=>p,
    commit:next=>{p=next;renderTask();storage()},
    close:()=>$("dialog").close(),storage
  });
  $("add-kind").onclick=()=>$("type-file").click();picked("type-file",async ([f])=>{const d=Studio.definition(JSON.parse(await read(f)));if(specs().some(x=>x.id===d.id))throw Error("此任务类型 ID 已存在。");p.customKinds.push(d);renderTask();storage();toast("类型已添加，可在列表中选择")});
  $("add-assets").onclick=()=>$("asset-files").click();picked("asset-files",async fs=>{const vals=await Promise.all(fs.map(async f=>({name:f.name,text:await read(f)})));const names=new Set();for(const a of [...p.assets,...vals]){const key=a.name.normalize("NFC").toLowerCase();if(names.has(key))throw Error("材料文件重名："+a.name);names.add(key)}p.assets.push(...vals);renderTask();storage()});
  function build(){const project=Studio.prepare(p,activeDef(),activeProfile());return p.profile===HarborIndex.profile.id?HarborIndex.build(project):BenchAdapters.build(p.profile,project)}
  function preview(){
    const host=$("preview");host.replaceChildren();try{previewFiles=build();const paths=Object.keys(previewFiles).sort(),list=el("div",null,"tree");host.append(el("p",paths.length+" 个文件 · 点击路径查看内容","hint"),list);
      for(const path of paths)list.append(btn(path,()=>{modal(path,el("pre",previewFiles[path]));verbatim($("dialog-title"))},"treeitem"));$("download").disabled=false;
    }catch(e){previewFiles={};host.append(el("p",e.message,"error"));$("download").disabled=true}
  }
  function renderExport(){const host=$("profiles");host.replaceChildren(...profiles.map(pr=>{const b=btn(null,()=>{p.profile=pr.id;renderExport();storage()},"profile"+(pr.id===p.profile?" selected":""));b.setAttribute("aria-pressed",pr.id===p.profile);b.append(el("strong",pr.name),el("span",pr.description));return b}));const pr=activeProfile();renderDynamic($("extra-fields"),pr.fields,p.profileData[p.profile]??={},true);preview()}
  $("download").onclick=()=>{try{const files=build();const root=p.profile==="asi"?p.id.replace(/-/g,"_"):p.id;download(Studio.zip(Object.fromEntries(Object.entries(files).map(([k,v])=>[root+"/"+k,v]))),p.id+"-"+p.profile+".zip");toast("已生成任务 ZIP")}catch(e){error(e)}};
  function guide(){modal("使用指南",el("p","导入 GJF、COM 或单帧 XYZ 后，在分子视图中拖动旋转，或切换到坐标与原文核对输入。连线由原子间距估算。"),el("p","在任务配置中选择评分标准，点击「读取计算输出」从 ORCA、Gaussian 或参考 XYZ 写入答案。「AI 编写格式」提供可移植规则示例。「下载独立评分包」可离线批改。打包导出支持四种目标框架。"),el("p","本工具在浏览器内离线处理文件。草稿保存在当前浏览器，项目 JSON 可在两台电脑间继续编辑。项目含私有答案，正式分发请使用目标框架的任务加载器。"),el("p","任务类型支持 JSON 定义。发布包的 examples 目录中含有可直接导入的示例。"))}
  $("help").onclick=guide;
  $("project-menu").onclick=()=>{modal("项目文件",p.title?verbatim(el("p",p.title)):el("p","当前项目"),btn("保存项目 JSON",()=>saveJson((p.id||"project")+".chembench.json",p)),btn("打开项目",()=>$("json-file").click()),btn("使用指南",guide))};
  picked("json-file",async ([f])=>{const restored=Studio.checked(JSON.parse(await read(f)));if(!profiles.some(pr=>pr.id===restored.profile))throw Error("项目使用了未知的导出框架。");p=restored;authored={title:p.title,instructions:p.instructions};mode="model";$("dialog").close();renderStructure();show("structure");storage();toast("项目已恢复")});
  window.addEventListener("chembench:languagechange",()=>{
    const keep={};
    for(const k of ["title","instructions"])if(p[k]===authored[k])keep[k]=p[k];
    Studio.refreshDefaultText?.(p);
    Object.assign(p,keep);
    renderStructure(false);
    if(page==="task")renderTask();
    if(page==="export")renderExport();
    storage();ChemI18n.render(document);
  });
  renderStructure();show(page);if(restoreError)toast(restoreError);
  ChemI18n.start(document);
})();
