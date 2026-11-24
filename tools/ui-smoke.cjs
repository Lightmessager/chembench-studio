// Run with node tools/ui-smoke.cjs [path-to-HTML] [output-directory].
// CHROME_BIN selects the Chromium executable on macOS or Linux.
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {spawn} = require("node:child_process");
const {pathToFileURL} = require("node:url");
const {once} = require("node:events");
const assert = require("node:assert/strict");

async function main() {
  const startedAt=Date.now();
  const html = path.resolve(process.argv[2] || "web/index.html");
  const output = path.resolve(process.argv[3] || path.join(os.tmpdir(),"chembench-ui-review"));
  await fs.mkdir(output,{recursive:true});
  const profile = await fs.mkdtemp(path.join(os.tmpdir(),"chembench-browser-"));
  const bins={win32:"C:/Program Files/Google/Chrome/Application/chrome.exe",darwin:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",linux:"chromium"};
  const bin=process.env.CHROME_BIN||bins[process.platform];
  const proc = spawn(bin,["--headless","--disable-gpu","--disable-extensions","--no-first-run","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
  let errors="",seq=0,ws;
  proc.stderr.on("data",buf=>errors+=buf.toString());
  const watchdog=setTimeout(()=>{console.error("Browser tests timed out.",errors.slice(-2000));proc.kill();process.exit(1)},90000);
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  try {
    let port;
    for(let i=0;i<120;i++){
      try{port=(await fs.readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0];break}catch{}
      if(proc.exitCode!==null)throw Error(errors);await pause(100);
    }
    if(!port)throw Error("DevToolsActivePort missing. "+errors);
    const [target]=await fetch("http://127.0.0.1:"+port+"/json/list").then(r=>r.json());
    ws=new WebSocket(target.webSocketDebuggerUrl);await once(ws,"open");
    const events=[],requests=new Map();
    ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const r=requests.get(m.id);requests.delete(m.id);m.error?r.reject(Error(m.error.message)):r.resolve(m.result)}else events.push(m)};
    const cmd=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
    const js=async expression=>{const r=await cmd("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const metrics=(width,height,mobile)=>cmd("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile});
    const shot=async name=>{await pause(160);const r=await cmd("Page.captureScreenshot",{format:"png"});await fs.writeFile(path.join(output,name+".png"),Buffer.from(r.data,"base64"))};
    const shotDialog=async name=>{
      await pause(100);
      const clip=await js('(()=>{const r=document.querySelector("#dialog").getBoundingClientRect();return {x:r.x-12,y:r.y-12,width:r.width+24,height:r.height+24,scale:1}})()');
      const r=await cmd("Page.captureScreenshot",{format:"png",clip});
      await fs.writeFile(path.join(output,name+".png"),Buffer.from(r.data,"base64"));
    };
    const upload=async (selector,files)=>{const {root}=await cmd("DOM.getDocument");const {nodeId}=await cmd("DOM.querySelector",{nodeId:root.nodeId,selector});await cmd("DOM.setFileInputFiles",{nodeId,files:files.map(f=>path.resolve(f))});await pause(150)};
    await cmd("Runtime.enable");await cmd("Page.enable");await metrics(1440,900,false);await cmd("Page.navigate",{url:pathToFileURL(html).href});
    for(let i=0;i<100;i++){if(await js('document.getElementById("file-name")?.textContent==="phenol.gjf"'))break;await pause(70)}
    const issues=()=>events.filter(m=>m.method==="Runtime.exceptionThrown").map(m=>m.params.exceptionDetails.exception?.description);
    const language=async lang=>{
      await js('document.querySelector("button[data-lang='+lang+']").click()');
      await pause(100);
      assert.equal(await js("document.documentElement.lang"),lang==="en"?"en":"zh-CN");
    };
    assert.deepEqual(issues(),[]);assert.equal(await js('document.querySelector("#natoms").textContent'),"13 个原子");
    const originalSource=await js('document.querySelector("#raw").textContent');
    await language("en");
    assert.match(await js('document.querySelector("#natoms").textContent'),/13 atoms/i);
    assert.doesNotMatch(await js('document.querySelector("#structure h1").innerText'),/[\u3400-\u9fff]/);
    assert.equal(await js('document.querySelector("#raw").textContent'),originalSource);
    await shot("desktop-en");
    await metrics(390,844,true);
    assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"),true,"English layout overflows on mobile");
    await metrics(1440,900,false);
    await cmd("Page.reload");await pause(300);
    assert.equal(await js("document.documentElement.lang"),"en","Reload should retain the saved UI language");
    await language("zh");
    await shot("desktop");await metrics(390,844,true);await shot("mobile");
    assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"),true);
    await metrics(1440,900,false);await js('document.querySelector("[data-mode=coords]").click()');assert.equal(await js('document.querySelectorAll("#coords tbody tr").length'),13);
    await js('document.querySelector("[data-mode=source]").click()');assert.match(await js('document.querySelector("#raw").innerText'),/B3LYP/);
    await js('document.querySelector("[data-page=task]").click()');await shot("task");await metrics(390,844,true);await shot("mobile-task");assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"),true);await metrics(1440,900,false);
    await js('document.querySelector("[data-page=export]").click()');
    for(let i=0;i<4;i++){
      await js('document.querySelectorAll(".profile")['+i+'].click()');
      assert.equal(await js('document.querySelector("#download").disabled'),false,await js('document.querySelector("#preview").innerText'));
      assert.ok(await js('document.querySelectorAll(".tree button").length')>6);
    }
    await shot("export");await metrics(390,844,true);await shot("mobile-export");assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"),true);await metrics(1440,900,false);
    await cmd("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:output});
    await js('document.querySelector("#download").click()');
    for(let i=0;i<50;i++){const zs=(await fs.readdir(output)).filter(x=>x.endsWith(".zip"));let found=false;for(const z of zs){if((await fs.stat(path.join(output,z))).mtimeMs>=startedAt){found=true;break}}if(found)break;await pause(100)}
    const saved=(await Promise.all((await fs.readdir(output)).filter(x=>x.endsWith(".zip")).map(x=>fs.stat(path.join(output,x))))).some(x=>x.mtimeMs>=startedAt);
    assert.ok(saved,"Expected a newly downloaded ZIP");
    await js('document.querySelector("[data-page=structure]").click()');
    await upload("#file",["examples/phenol.xyz"]);assert.equal(await js('document.querySelector("#file-name").textContent'),"phenol.xyz");
    await js('document.querySelector("#edit").click();const i=document.querySelector("#dialog input");i.value="PBE0";i.dispatchEvent(new Event("input"));document.querySelector("#dialog form").requestSubmit()');
    assert.match(await js('document.querySelector("#properties").innerText'),/PBE0/);
    await js('document.querySelector("[data-page=task]").click()');
    await js('const k=document.querySelector("#kind");k.value="bond-length";k.dispatchEvent(new Event("change"));');
    assert.ok(Number(await js('document.querySelector("#expected").value'))>1);
    await js('const b=document.querySelectorAll("#kind-fields input")[1];b.value="7";b.dispatchEvent(new Event("input"));');
    assert.ok(Math.abs(Number(await js('document.querySelector("#expected").value'))-1.364)<1e-6);
    await js('document.querySelector("[data-page=export]").click()');assert.equal(await js('document.querySelector("#download").disabled'),false);
    await js('document.querySelector("[data-page=task]").click()');
    await upload("#type-file",["examples/bond-distance.task-type.json"]);assert.ok(await js('!!document.querySelector("#kind option[value=bond-distance]")'));
    await js('document.querySelector("[data-page=structure]").click()');
    await cmd("Page.reload");await pause(450);assert.equal(await js('document.querySelector("#file-name").textContent'),"phenol.xyz");assert.deepEqual(issues(),[]);
    // Exercise both reference presets and an imported multi-field scoring rule.
    await upload("#file",["examples/water-seed.xyz"]);
    await js('document.querySelector("[data-page=task]").click()');
    const select=async(selector,value)=>js('(()=>{const s=document.querySelector('+JSON.stringify(selector)+');s.value='+JSON.stringify(value)+';s.dispatchEvent(new Event("change"));})()');
    const click=id=>js("document.querySelector("+JSON.stringify(id)+").click()");
    await select("#kind","energy");await upload("#result-file",["examples/gaussian-water.log"]);
    await select("#bind-value","scf-energy");await click("#apply-results");
    assert.equal(Number(await js('document.querySelector("#expected").value')),-76.4012345678);
    assert.match(await js('document.querySelector("#reference-sources").textContent'),/gaussian-water.log/);
    await select("#rubric-mode","geometry");await click("#dialog-body button.primary");await upload("#result-file",["examples/orca-water.out"]);
    await click("#apply-results");assert.match(await js('document.querySelector("#criterion-answers").textContent'),/3 个原子/);
    await upload("#rubric-file",["examples/energy-geometry.rubric.json"]);
    await click("#dialog-body button.primary");await upload("#result-file",["examples/orca-water.out"]);
    await select("#bind-energy","final-energy");await select("#bind-geometry","geometry");await shotDialog("answer-import");
    await click("#apply-results");
    assert.match(await js('document.querySelector("#reference-sources").textContent'),/最终单点能/);
    await language("en");
    await upload("#rubric-file",["examples/energy-geometry.en.rubric.json"]);
    await click("#dialog-body button.primary");
    await upload("#result-file",["examples/orca-water.out"]);
    await select("#bind-energy","final-energy");await select("#bind-geometry","geometry");
    assert.match(await js('document.querySelector("#dialog-body").innerText'),/Final electronic energy/);
    assert.doesNotMatch(await js('document.querySelector("#apply-results").innerText'),/[\u3400-\u9fff]/);
    await shotDialog("answer-import-en");
    await click("#apply-results");
    assert.match(await js('document.querySelector("#reference-sources").textContent'),/orca-water.out/);
    await language("zh");
    await shot("grading");await metrics(390,844,true);
    assert.equal(await js("document.documentElement.scrollWidth <= innerWidth"),true);
    await metrics(1440,900,false);
    await click("#grade-kit");
    for(let i=0;i<40&&!((await fs.readdir(output)).some(n=>n.includes("-grader")&&n.endsWith(".zip")));i++)await pause(75);
    assert.ok((await fs.readdir(output)).some(n=>n.includes("-grader")&&n.endsWith(".zip")));
    await click("[data-page=export]");
    for(let i=0;i<4;i++){await js('document.querySelectorAll(".profile")['+i+'].click()');assert.equal(await js('document.querySelector("#download").disabled'),false,await js('document.querySelector("#preview").textContent'))}
    await cmd("Page.reload");await pause(225);await click("[data-page=task]");
    assert.match(await js('document.querySelector("#criterion-answers").textContent'),/3 个原子/);
    assert.match(await js('document.querySelector("#reference-sources").textContent'),/orca-water.out/);
    await click("[data-page=structure]");
    await js(`const largeFile=new File(["4001\\nPeriodic grid\\n"+Array.from({length:4001},(_,i)=>"H "+(i%31)*3+" "+(Math.floor(i/31)%31)*3+" "+Math.floor(i/961)*3).join("\\n")],"grid.xyz");
      const transfer=new DataTransfer();transfer.items.add(largeFile);const input=document.querySelector("#file");input.files=transfer.files;input.dispatchEvent(new Event("change"));`);
    for(let i=0;i<30&&!await js('document.querySelector("#style").disabled');i++)await pause(60);
    assert.equal(await js('document.querySelector("#style").disabled'),true);
    await js('document.querySelector("[data-mode=coords]").click()');
    assert.equal(await js('document.querySelectorAll("#coords tbody tr").length'),250);
    await js('document.querySelector("#coords .cardhead button:last-child").click()');
    assert.equal(await js('document.querySelector("#coords tbody td").textContent'),"251");
    console.log("Desktop, narrow layout, XYZ import, coordinates, source, parameter editing, four export previews, ZIP download, custom rule, Gaussian and ORCA answer binding, independent grader download and draft restore passed.");console.log(output);
  } finally {clearTimeout(watchdog);ws?.close();proc.kill();await Promise.race([once(proc,"exit").catch(()=>{}),pause(1500)]);await fs.rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})}
}
main().catch(e=>{console.error(e);process.exitCode=1});
