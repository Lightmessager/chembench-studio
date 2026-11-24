"use strict";
globalThis.MoleculeView = (() => {
  const colors = {C:"#57d8ef",H:"#d5dffc",O:"#ef6bb2",N:"#9691ff",S:"#e4c15d",F:"#8bc9a0",Cl:"#75cc93",P:"#e9a26a",Fe:"#d39b77",Br:"#b6736a",I:"#b786ca"};
  const radii = {H:.31,He:.28,Li:1.28,Be:.96,B:.84,C:.76,N:.71,O:.66,F:.57,Ne:.58,Na:1.66,Mg:1.41,Al:1.21,Si:1.11,P:1.07,S:1.05,Cl:1.02,Ar:1.06,K:2.03,Ca:1.76,Fe:1.32,Co:1.26,Ni:1.24,Cu:1.32,Zn:1.22,Br:1.2,I:1.39,Pt:1.36,Pd:1.39,Au:1.36};
  const tint=(hex,n)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return "rgb("+rgb.map(c=>Math.round(n>=0?c+(255-c)*n:c*(1+n))).join(",")+")"};
  function setup(canvas,axis) {
    const ctx=canvas.getContext("2d"), ac=axis.getContext("2d");
    let pointCloud=false;
    let pts=[],links=[],spanX=1,spanY=1,rotX=.83,rotY=-.29,rotZ=-.23,zoom=1,space=false,pointer=null,frame=0;
    function turn(x,y,z){const a=x*Math.cos(rotZ)-y*Math.sin(rotZ), b=x*Math.sin(rotZ)+y*Math.cos(rotZ), c=a*Math.cos(rotY)+z*Math.sin(rotY), d=-a*Math.sin(rotY)+z*Math.cos(rotY);return [c,b*Math.cos(rotX)-d*Math.sin(rotX),b*Math.sin(rotX)+d*Math.cos(rotX)]}
    // Light is confined to the optical viewport. The rings mark the projector
    // surface and never participate in atom coordinates or bond inference.
    function projector(w,h){
      ctx.save();
      const x=w*.50, y=h*(w<440?.760:.825), rx=Math.min(w*.30,h*.62), ry=Math.max(8,h*.043);
      const light=ctx.createRadialGradient(x,y,1,x,y,rx*1.36);
      light.addColorStop(0,"rgba(112,98,255,.19)");light.addColorStop(.55,"rgba(54,208,255,.10)");light.addColorStop(1,"rgba(10,20,60,0)");
      ctx.save();ctx.translate(0,y*.79);ctx.scale(1,.21);ctx.fillStyle=light;ctx.fillRect(x-rx*1.4,y-rx*1.4,rx*2.8,rx*2.8);ctx.restore();
      const beam=ctx.createLinearGradient(0,h*.13,0,y);
      beam.addColorStop(0,"rgba(64,166,246,0)");beam.addColorStop(.65,"rgba(69,164,255,.03)");beam.addColorStop(1,"rgba(62,214,255,.115)");
      ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(x-rx*1.15,h*.13);ctx.lineTo(x+rx*1.15,h*.13);ctx.lineTo(x+rx*.93,y);ctx.quadraticCurveTo(x,y+ry*1.6,x-rx*.93,y);ctx.closePath();ctx.fill();
      for(const [k,opacity] of [[1.15,.18],[1,.62],[.95,.26],[.84,.31],[.52,.20]]){
        ctx.strokeStyle="rgba(98,219,246,"+opacity+")";ctx.lineWidth=k===1?1.45:1;
        ctx.beginPath();ctx.ellipse(x,y,rx*k,ry*k,0,0,2*Math.PI);ctx.stroke();
      }
      ctx.strokeStyle="rgba(154,130,255,.62)";ctx.beginPath();ctx.ellipse(x,y,rx*1.08,ry*1.08,0,.2,2.05);ctx.stroke();
      ctx.strokeStyle="rgba(131,230,246,.42)";
      for(let i=0;i<56;i++){
        const a=i*Math.PI/28,k=i%7===0?1.14:1.065;
        ctx.beginPath();ctx.moveTo(x+rx*1.02*Math.cos(a),y+ry*1.02*Math.sin(a));ctx.lineTo(x+rx*k*Math.cos(a),y+ry*k*Math.sin(a));ctx.stroke();
      }
      ctx.restore();
    }
    function draw(){
      frame=0;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
      const d=Math.min(2,devicePixelRatio||1);
      if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d)}
      ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);projector(w,h);
      const scale=Math.min(w*(w<450?.80:.71)/spanX,h*(w<440?.55:.68)/spanY)*zoom;
      ctx.save();
      ctx.strokeStyle="rgba(117,212,244,.40)";ctx.lineWidth=1;ctx.beginPath();
      for(let i=1;i<20;i++){
        const y=Math.round(h*i/20)+.5, tick=i%5===0?9:4;
        ctx.moveTo(0,y);ctx.lineTo(tick,y);ctx.moveTo(w-tick,y);ctx.lineTo(w,y);
      }
      for(let i=1;i<32;i++){
        const x=Math.round(w*i/32)+.5,tick=i%8===0?8:3;
        ctx.moveTo(x,0);ctx.lineTo(x,tick);ctx.moveTo(x,h-tick);ctx.lineTo(x,h);
      }
      ctx.stroke();
      if(w>460&&scale>0&&Number.isFinite(scale)){
        const target=w*.11/scale,magnitude=10**Math.floor(Math.log10(target));
        const multiple=target/magnitude,units=(multiple>=5?5:multiple>=2?2:1)*magnitude;
        const start=w*.22,end=start+units*scale,y=h-22.5;
        ctx.strokeStyle="rgba(225,233,240,.72)";ctx.beginPath();ctx.moveTo(start,y-3);ctx.lineTo(start,y+1);ctx.lineTo(end,y+1);ctx.lineTo(end,y-3);ctx.stroke();
        ctx.fillStyle="#cfdae8";ctx.font="10px Consolas, Menlo, monospace";ctx.textAlign="center";ctx.fillText(units.toPrecision(2).replace(/\.0$/,"")+" Å",(start+end)/2,y-5);
      }
      ctx.restore();
      const projected=pts.map(p=>{const [x,y,z]=turn(p.x,p.y,p.z);return {x:w*.5+x*scale,y:h*(w<440?.44:.46)-y*scale,z,r:Math.max(1.3,(p.element==="H"?.214:.362)*(space?2.55:1)*scale),color:colors[p.element]||"#83b6b9"}});
      if(pointCloud){
        projected.sort((a,b)=>a.z-b.z);
        for(const a of projected){
          ctx.fillStyle=a.color;const size=Math.max(1.4,Math.min(a.r,4));
          ctx.fillRect(a.x-size/2,a.y-size/2,size,size);
        }
      }
      const pieces=pointCloud?[]:projected.map((p,index)=>({z:p.z,index}));
      if(!pointCloud&&!space)for(const [i,j] of links){const a=projected[i],b=projected[j];for(let k=0;k<2;k++)pieces.push({z:a.z+(b.z-a.z)*(k+.5)/2-.012,a,b,k})}
      pieces.sort((a,b)=>a.z-b.z);
      for(const p of pieces){
        if(p.index!==undefined){
          const a=projected[p.index];const g=ctx.createRadialGradient(a.x-a.r*.30,a.y-a.r*.42,a.r*.035,a.x,a.y,a.r*1.08);
          g.addColorStop(0,tint(a.color,.96));g.addColorStop(.13,tint(a.color,.61));g.addColorStop(.32,tint(a.color,.05));g.addColorStop(.64,tint(a.color,-.46));g.addColorStop(.85,tint(a.color,-.65));g.addColorStop(1,tint(a.color,.15));
          ctx.fillStyle=g;ctx.beginPath();ctx.arc(a.x,a.y,a.r,0,2*Math.PI);
          if(pts.length<120){ctx.shadowColor=a.color;ctx.shadowBlur=7}
          ctx.fill();ctx.shadowBlur=0;
          if(a.r>6&&pts.length<300){
            ctx.save();ctx.clip();
            const rim=ctx.createLinearGradient(a.x-a.r,a.y-a.r,a.x+a.r,a.y+a.r);
            rim.addColorStop(0,"rgba(220,254,255,.86)");rim.addColorStop(.50,"rgba(87,197,255,.12)");rim.addColorStop(1,"rgba(186,139,255,.88)");
            ctx.strokeStyle=rim;ctx.lineWidth=1.15;ctx.stroke();
            ctx.strokeStyle="rgba(175,239,255,.12)";ctx.lineWidth=.65;ctx.beginPath();
            for(let line=Math.ceil((a.y-a.r)/3)*3;line<a.y+a.r;line+=3){ctx.moveTo(a.x-a.r,line);ctx.lineTo(a.x+a.r,line)}
            ctx.stroke();
            ctx.strokeStyle="rgba(208,252,255,.19)";ctx.beginPath();ctx.ellipse(a.x,a.y+a.r*.12,a.r*.94,a.r*.30,-.42,.15,3.0);ctx.stroke();
            ctx.restore();
          }
        }else{
          const {a,b,k}=p, dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.1)continue;
          const half=Math.max(.9,scale*.084),nx=-dy/len*half,ny=dx/len*half;
          const start=k===0?Math.min(.5,a.r*.86/len):.5;
          const end=k===0?.5:Math.max(.5,1-b.r*.86/len);
          const x=a.x+dx*start,y=a.y+dy*start,ex=a.x+dx*end,ey=a.y+dy*end;
          const g=ctx.createLinearGradient(x-nx,y-ny,x+nx,y+ny),c=k?b.color:a.color;g.addColorStop(0,tint(c,-.48));g.addColorStop(.38,tint(c,.27));g.addColorStop(1,tint(c,-.33));
          ctx.strokeStyle=g;ctx.lineWidth=half*2;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
        }
      }
      ac.clearRect(0,0,100,100);ac.font="19px monospace";ac.lineWidth=2.5;
      [[1,0,0,"X","#f7a99e"],[0,1,0,"Y","#9ed8bd"],[0,0,1,"Z","#b1b9fa"]].forEach(([x,y,z,l,c])=>{const [a,b]=turn(x,y,z);ac.strokeStyle=c;ac.fillStyle=c;ac.beginPath();ac.moveTo(41,54);ac.lineTo(41+29*a,54-29*b);ac.stroke();ac.fillText(l,36+43*a,59-42*b)});
    }
    function redraw(){if(!frame)frame=requestAnimationFrame(draw)}
    function reset(){rotX=.83;rotY=-.29;rotZ=-.23;zoom=1;redraw()}
    function set(atoms){
      const mean={x:0,y:0,z:0};for(const a of atoms)for(const k of ["x","y","z"])mean[k]+=a[k]/atoms.length;
      pts=atoms.map(a=>({...a,x:a.x-mean.x,y:a.y-mean.y,z:a.z-mean.z}));links=[];reset();let maxX=.45,maxY=.45;
      pointCloud=pts.length>4000;space=false;
      const cells=new Map(),size=5;
      for(const [i,a] of pts.entries()){
        const [ix,iy]=turn(a.x,a.y,a.z);
        maxX=Math.max(maxX,Math.abs(ix)+.24);maxY=Math.max(maxY,Math.abs(iy)+.24);
        if(pointCloud)continue;
        const pos=[a.x,a.y,a.z].map(v=>Math.floor(v/size));
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const j of cells.get([pos[0]+x,pos[1]+y,pos[2]+z].join(","))||[]){
          const b=pts[j],dist=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
          if(dist>.22&&dist<=1.20*((radii[a.element]||1.35)+(radii[b.element]||1.35)))links.push([i,j]);
        }
        const key=pos.join(",");if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
      }
      spanX=2*maxX;spanY=2*maxY;redraw();return pointCloud;
    }
    function magnify(f){zoom=Math.max(.22,Math.min(5,zoom*f));redraw()}
    canvas.addEventListener("pointerdown",e=>{pointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener("pointermove",e=>{if(pointer){rotY+=(e.clientX-pointer[0])*.011;rotX+=(e.clientY-pointer[1])*.011;pointer=[e.clientX,e.clientY];redraw()}});
    canvas.onlostpointercapture=()=>pointer=null;
    canvas.addEventListener("wheel",e=>{e.preventDefault();magnify(e.deltaY<0?1.09:1/1.09)},{passive:false});
    canvas.onkeydown=e=>{const f={ArrowLeft:()=>rotY-=.12,ArrowRight:()=>rotY+=.12,ArrowUp:()=>rotX-=.12,ArrowDown:()=>rotX+=.12,"+":()=>magnify(1.15),"-":()=>magnify(1/1.15)}[e.key];if(f){e.preventDefault();f();redraw()}};
    new ResizeObserver(redraw).observe(canvas);
    return {set,reset,redraw,magnify,toggle:()=>{space=!space;redraw();return space}};
  }
  return {colors,setup};
})();
