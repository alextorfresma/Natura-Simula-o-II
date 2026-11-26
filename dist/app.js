import {createDistributor} from './distributor.js?v=14';
import {parseStopTime,stopActive} from './stops.js?v=14';
import {defaultConfig,prepare,supportsAlternative} from './model.js?v=14';
import {normalizeZones,zoneCapacity,levelDistance,insideZones,initialPositions} from './accumulations.js?v=14';
import {createAnalytics} from './charts.js?v=14';
import {createLayoutEditor} from './layout-editor.js?v=14';
import {layoutBounds,validateLayoutSeed,layoutFromSeed,compileLayout,configForLayout} from './layout-data.js?v=14';
const $=id=>document.getElementById(id),num=(x,n=2)=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:n,minimumFractionDigits:n}),int=x=>Number(x).toLocaleString('pt-BR'),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=t=>{t=Math.max(0,Math.floor(t||0));return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');};
const state={seed:null,originalSeed:null,config:null,result:null,prepared:null,selected:11,frame:0,time:0,playing:false,worker:null,zoom:1,pan:{x:0,y:0},drag:null,recording:false,history:[]};
const zoneEdit={target:'main',pick:null};
const formKeys=['durationHours','speed','branchSpeed','inflow','cycle','mainLength','mainInitial','branchInitial','startMode','control','recovery','waitMargin','alternative'];
let toastTimer;
function toast(message,error=false){$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function seekPlayback(t,line=null){
 if(!state.result)return;state.playing=false;$('play').textContent='▶';if(line!==null)state.selected=line;state.time=t;state.frame=frameAt(t);$('timeline').value=state.frame;renderLines();draw();$('mapStage').scrollIntoView?.({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
}
const analytics=createAnalytics({get:$,notify:toast,download:(name,text)=>download(name,new Blob([text],{type:'text/csv;charset=utf-8'})),onSeek:seekPlayback});
const distributor=createDistributor({get:$,onSeek:seekPlayback});
const layoutEditor=createLayoutEditor({get:$,notify:toast,download:(name,text)=>download(name,new Blob([text],{type:'application/json'})),makeDefault:defaultConfig,onApply:({seed,config})=>{
 prepare(config,seed);if(state.seed&&state.config){state.history.push({id:crypto.randomUUID(),name:'Antes de editar · '+(state.seed.name||state.config.name),date:new Date().toISOString(),seed:structuredClone(state.seed),config:structuredClone(state.config),summary:summary(state.result)});if(state.history.length>20)state.history.shift();}
 state.seed=seed;state.config=config;state.selected=0;state.zoom=1;state.pan={x:0,y:0};zoneEdit.target='main';$('zoneEditor').hidden=true;syncForm();invalidate();updateSaved();stopEdit.id=null;stopEdit.pick=false;toast('Layout aplicado. Os trajetos e acúmulos serão usados no próximo ensaio. Reprograme as paradas para o novo desenho.');
}});
function modal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').showModal();}
$('closeModal').onclick=()=>$('modal').close();$('modal').addEventListener('click',e=>{if(e.target===$('modal'))$('modal').close();});
function persist(){try{localStorage.setItem('natura-ii-fbra-config',JSON.stringify(state.config));localStorage.setItem('natura-ii-fbra-layout',JSON.stringify(state.seed));localStorage.setItem('natura-ii-fbra-history',JSON.stringify(state.history));}catch{}}
function syncForm(){const c=state.config,alternatives=supportsAlternative(state.seed);$('alternative').innerHTML=alternatives?'<option value="G22">G22 · E18 desligada</option><option value="E18">E18 · G22 desligada</option>':'<option value="none">Sem alternativa vinculada</option>';$('alternative').disabled=!alternatives;for(const k of formKeys)$(k).value=c[k];$('mainPitch').value=Math.round(c.mainPitch*1000);$('branchPitch').value=Math.round(c.branchPitch*1000);$('mainPct').textContent=c.mainInitial+'%';$('branchPct').textContent=c.branchInitial+'%';$('presetEmpty').classList.toggle('selected',c.mainInitial===0&&c.branchInitial===0);$('presetFull').classList.toggle('selected',c.mainInitial===100&&c.branchInitial===100);$('layoutName').textContent=state.seed.name||'LAYOUT FBRA / REV. 16';}
function readForm(){for(const k of formKeys)state.config[k]=['startMode','control','alternative'].includes(k)?$(k).value:Number($(k).value);state.config.mainPitch=Number($('mainPitch').value)/1000;state.config.branchPitch=Number($('branchPitch').value)/1000;}
function preview(){try{state.prepared=prepare(state.config,state.seed);return true;}catch(e){state.prepared=null;return false;}}
function invalidate(){$('splitNote').hidden=true;if(state.recording&&recorder?.state==='recording'){recorder.stop();state.recording=false;}state.playing=false;state.result=null;analytics.clear();distributor.setResult(null);state.time=0;state.frame=0;$('play').disabled=true;$('play').textContent='▶';$('timeline').disabled=true;$('dirtyNote').textContent='Alterações prontas. Execute um novo ensaio.';$('dirtyNote').classList.add('dirty');$('consumedValue').textContent='—';$('missedValue').textContent='—';$('periodNote').textContent='Resultado disponível após simular';$('startNote').textContent='Espera inicial calculada separadamente';$('scenarioLabel').textContent='Cenário em edição';preview();updateConfigured();renderLines();renderStops();if(!$('zoneEditor').hidden)renderZones();draw();persist();}
function updateConfigured(){const c=state.config;$('flowLegend').hidden=!state.seed.dual;$('startModeHelp').hidden=c.startMode!=='main';const demand=(state.prepared?.stations||c.stations).reduce((a,s)=>a+(s.enabled?+s.rate:0),0);$('demandValue').textContent=num(demand);$('supplyNote').textContent='Alimentação nominal de '+num(c.inflow,1)+' cx/min';$('mainPct').textContent=c.mainInitial+'%';$('branchPct').textContent=c.branchInitial+'%';$('presetEmpty').classList.toggle('selected',c.mainInitial===0&&c.branchInitial===0);$('presetFull').classList.toggle('selected',c.mainInitial===100&&c.branchInitial===100);$('totalClock').textContent='/ '+clock(c.durationHours*3600);$('mapMode').textContent=c.mainInitial===100&&c.branchInitial===100?'ACÚMULOS CHEIOS':c.mainInitial===0&&c.branchInitial===0?'PARTIDA DO ZERO':'ESTOQUE PERSONALIZADO';}
function editableStation(j){if(supportsAlternative(state.seed)&&j===10&&state.config.alternative==='E18'){state.config.e18Station??={...state.config.stations[10],name:'E18 (alternativa a G22)',length:state.seed.e18Station?.length??4.112,uWidth:0,auto:true};state.config.e18Station.enabled=state.config.stations[j].enabled;return state.config.e18Station;}return state.config.stations[j];}
function renderLines(){
 const c=state.config,P=state.prepared?.stations;const frag=document.createDocumentFragment();
 c.stations.forEach((base,j)=>{
  const s=editableStation(j);
  const p=P?.[j],r=state.result?.lines[j];const tr=document.createElement('tr');tr.classList.toggle('active-row',state.selected===j);
  tr.innerHTML=`<td><div class="line-name"><label><input type="checkbox" data-j="${j}" data-key="enabled" ${s.enabled?'checked':''} aria-label="Ativar ${esc(s.name)}"></label><button class="line-id" data-select="${j}" aria-label="Selecionar linha ${j+1}">${String(j+1).padStart(2,'0')} ↗</button><input class="line-name-edit" type="text" value="${esc(s.name)}" data-j="${j}" data-key="name" aria-label="Nome da linha ${j+1}"></div></td><td><input class="cell-input" type="number" min="0" max="300" step=".01" value="${s.rate}" data-j="${j}" data-key="rate" aria-label="Consumo de ${esc(s.name)}"></td><td><input class="cell-input" type="number" min=".001" step=".001" value="${p?.length??s.length}" data-j="${j}" data-key="length" aria-label="Comprimento de ${esc(s.name)}"></td><td class="number">${p?.capacity??'—'}</td><td><input class="cell-input small" type="number" min="1" step="1" value="${p?.minimum??s.minimum}" data-j="${j}" data-key="minimum" aria-label="Mínimo de ${esc(s.name)}"><span class="auto-tag">${s.auto?'A':''}</span></td><td><input class="cell-input small" type="number" min="2" step="1" value="${p?.maximum??s.maximum}" data-j="${j}" data-key="maximum" aria-label="Máximo de ${esc(s.name)}"></td><td class="sensor-number">${p?num(p.minSensor,3)+' / '+num(p.maxSensor,3):'—'}</td><td class="number">${r?int(r.consumed)+' / <span class="'+(r.missed?'misses':'')+'">'+int(r.missed)+'</span>':'—'}</td>`;
  frag.appendChild(tr);
 });$('linesBody').replaceChildren(frag);
}
$('linesBody').addEventListener('click',e=>{const button=e.target.closest('[data-select]');if(button){state.selected=+button.dataset.select;renderLines();draw();}});
$('linesBody').addEventListener('change',e=>{
 const el=e.target;if(!el.dataset.key)return;const j=+el.dataset.j,key=el.dataset.key,s=editableStation(j);
 if(key==='minimum'||key==='maximum'){
  const p=state.prepared?.stations[j];if(s.auto&&p){s.minimum=p.minimum;s.maximum=p.maximum;}s.auto=false;
 }
 s[key]=key==='enabled'?el.checked:key==='name'?el.value:Number(el.value);
 if(key==='enabled')state.config.stations[j].enabled=el.checked;
 if(key==='length'&&j===10&&state.config.alternative==='E18')s.e18Edited=true;
 invalidate();
});
for(const k of [...formKeys,'mainPitch','branchPitch'])$(k).addEventListener(['mainInitial','branchInitial'].includes(k)?'input':'change',()=>{readForm();invalidate();});
document.querySelectorAll('[data-hours]').forEach(b=>b.onclick=()=>{state.config.durationHours=Number(b.dataset.hours);syncForm();invalidate();});
$('presetEmpty').onclick=()=>{state.config.mainInitial=0;state.config.branchInitial=0;syncForm();invalidate();};
$('presetFull').onclick=()=>{state.config.mainInitial=100;state.config.branchInitial=100;syncForm();invalidate();};
$('restore').onclick=()=>{state.config=defaultConfig(state.seed);syncForm();invalidate();toast('Configuração original restaurada.');};
$('autoSensors').onclick=()=>{for(const s of state.config.stations)s.auto=true;if(state.config.e18Station)state.config.e18Station.auto=true;invalidate();toast('Níveis recalculados a partir das capacidades e do tempo de reposição.');};
$('configForm').onsubmit=e=>{e.preventDefault();run();};
function run(){
 if(!state.seed||!state.config)return toast('Aguarde o carregamento do layout.');
 if(state.recording)return toast('Encerre a gravação antes de iniciar outro ensaio.');
 readForm();try{state.prepared=prepare(state.config,state.seed);}catch(e){toast(e.message,true);return;}
 state.playing=false;$('play').textContent='▶';state.worker?.terminate();
 $('progressOverlay').hidden=false;$('progressFill').style.width='0%';$('progressText').textContent='Calculando '+num(state.config.durationHours,2)+' horas de produção…';
 try{state.worker=new Worker(new URL('./worker.js?v=14',import.meta.url),{type:'module'});}catch(e){$('progressOverlay').hidden=true;toast('O navegador não conseguiu iniciar o cálculo: '+e.message,true);return;}
 state.worker.onmessage=({data})=>{
  if(data.type==='progress'){$('progressFill').style.width=Math.round(data.value*100)+'%';$('progressText').textContent=Math.round(data.value*100)+'% · caixas, sensores e consumo sendo calculados';}
  if(data.type==='error'){$('progressOverlay').hidden=true;toast(data.message,true);state.worker.terminate();state.worker=null;}
  if(data.type==='result'){
   state.result=data.result;state.frame=0;state.time=0;distributor.setResult(state.result);state.worker.terminate();state.worker=null;$('progressOverlay').hidden=true;
   $('play').disabled=false;$('timeline').disabled=false;$('timeline').max=data.result.snapshots.length-1;$('timeline').value=0;
   $('consumedValue').textContent=int(data.result.consumed);$('missedValue').textContent=int(data.result.missed);
   $('missedValue').closest('.metric').classList.toggle('alert',data.result.missed>0);
   $('periodNote').textContent=num(data.result.duration/3600,2)+' h · '+num(data.result.rateMeasured,2)+' cx/min após aquecimento';
   $('startNote').textContent=data.result.allStart===null?'Nem todas as máquinas foram liberadas':'Todas liberadas em '+clock(data.result.allStart);
   const splitNote=$('splitNote');
   splitNote.hidden=data.result.filledAt===undefined;
   const preloadNote=data.result.config.startMode==='precharge'&&data.result.branchFillAt!=null?
    'Acúmulos completos em '+clock(data.result.branchFillAt)+' · ':'';
   const incomplete=data.result.config.startMode==='precharge'&&data.result.branchFillAt!=null?
    'O período terminou antes de completar a reserva dos transportadores.':
    'O período terminou antes de todos os acúmulos atingirem o máximo.';
   splitNote.textContent=preloadNote+(data.result.filledAt===null?incomplete:
    'Produção por consumo a partir de '+clock(data.result.filledAt));
   if(data.result.groupSent){
    const sides=[0,1].map(group=>data.result.lines.filter(s=>s.enabled&&s.group===group)
     .reduce((a,s)=>({rate:a.rate+s.rate,missed:a.missed+s.missed}),{rate:0,missed:0}));
    splitNote.textContent+=' · Superior '+num(sides[0].rate,2)+' cx/min, '+int(sides[0].missed)+' faltas'+
     ' · Inferior '+num(sides[1].rate,2)+' cx/min, '+int(sides[1].missed)+' faltas';
   }
   $('scenarioLabel').textContent=data.result.outsideAccumMax>0?'Fila fora dos acúmulos':data.result.allStart===null?'Pré-enchimento incompleto':data.result.missed?'Ensaio com faltas de caixas':'Ensaio concluído';
   $('dirtyNote').textContent='Resultado atualizado. Ajuste os dados para comparar.';$('dirtyNote').classList.remove('dirty');
   $('sampleNote').textContent=(state.seed.dual?'Reprodução por caixa · amostras de até ':'Reprodução com amostras a cada ')+num(data.result.sampleInterval,1)+' s · cálculo a cada 0,1 s';
   state.playing=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;$('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pausar':'Reproduzir');lastTick=0;
   renderLines();renderZones();renderStops();analytics.setResult(data.result);draw();persist();toast(data.result.outsideAccumMax>0?'Atenção: a fila ultrapassou os trechos de acúmulo definidos.':data.result.allStart===null?'O período terminou antes da liberação de todas as máquinas.':'Simulação concluída. '+int(data.result.missed)+' ciclos de consumo sem caixa.');
  }
 };
 state.worker.onerror=e=>{$('progressOverlay').hidden=true;toast('Não foi possível concluir o cálculo: '+e.message,true);state.worker?.terminate();state.worker=null;};
 try{state.worker.postMessage({config:structuredClone(state.config),seed:state.seed});}catch(e){$('progressOverlay').hidden=true;state.worker.terminate();state.worker=null;toast('Não foi possível enviar os dados para o cálculo: '+e.message,true);}
}
$('cancelRun').onclick=()=>{state.worker?.terminate();state.worker=null;$('progressOverlay').hidden=true;toast('Cálculo cancelado.');};

const canvas=$('map'),ctx=canvas.getContext('2d');let viewport={w:0,h:0,scale:1,ox:0,oy:0};
function world(p){return [(p[0]-(viewport.minX??220))*viewport.scale+viewport.ox,(p[1]-(viewport.minY??165))*viewport.scale+viewport.oy];}
function pathPoint(points,distances,m){let a=0,b=distances.length-1;while(a+1<b){const k=(a+b)>>1;if(distances[k]<=m)a=k;else b=k;}a=Math.min(a,points.length-2);const u=Math.max(0,Math.min(1,(m-distances[a])/(distances[a+1]-distances[a])));const dx=points[a+1][0]-points[a][0],dy=points[a+1][1]-points[a][1],len=Math.hypot(dx,dy)||1;return {p:[points[a][0]+u*dx,points[a][1]+u*dy],u:[dx/len,dy/len]};}
function branchGeometry(points){let d=[0];for(let k=1;k<points.length;k++)d.push(d[k-1]+Math.hypot(points[k][0]-points[k-1][0],points[k][1]-points[k-1][1])*state.seed.scale);return d;}
function route(points,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>{const [x,y]=world(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}
function flowArrow(a,b,offset=8){
 const [ax,ay]=world(a),[bx,by]=world(b),span=Math.hypot(bx-ax,by-ay);
 if(span<9)return;
 const ux=(bx-ax)/span,uy=(by-ay)/span;
 const x=(ax+bx)/2-uy*offset,y=(ay+by)/2+ux*offset;
 ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(uy,ux));
 ctx.strokeStyle='#a9d2d7';ctx.lineWidth=1.15;ctx.beginPath();
 ctx.moveTo(-5,0);ctx.lineTo(5,0);ctx.moveTo(1.5,-3.1);ctx.lineTo(5,0);ctx.lineTo(1.5,3.1);
 ctx.stroke();ctx.restore();
}
function drawFlow(S){
 flowArrow(...state.seed.path);
 for (const {points} of state.seed.trunks) {
  for (let k=1;k<points.length;k++) {
   const a=points[k-1],b=points[k];
   if(Math.hypot(b[0]-a[0],b[1]-a[1])>=65)flowArrow(a,b);
  }
 }
 for (const s of S) {
  if(!s.enabled)continue;
  const [a,b]=s.branch;
  if(Math.hypot(b[0]-a[0],b[1]-a[1])>=30)flowArrow(a,b,7);
 }
}
function box(point,tangent,length,width,color){const [x,y]=world(point),s=viewport.scale/state.seed.scale;ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(tangent[1],tangent[0]));ctx.fillStyle=color;ctx.fillRect(-length*s/2,-width*s/2,Math.max(1.3,length*s),Math.max(1.7,width*s));ctx.restore();}
function snapshot(){return state.result?.snapshots[state.frame]||null;}
// A comparação é feita só entre caixas com o mesmo ID no mesmo trecho.
function drawMovingBoxes(positions,ids,laterPositions,laterIds,progress,paint){
 if(!positions)return;
 if(!ids?.length||!laterIds||progress<=0){positions.forEach(paint);return;}
 const targets=new Map();
 laterIds.forEach((id,index)=>targets.set(id,laterPositions[index]));
 ctx.save();
 positions.forEach((position,index)=>{
  const target=targets.get(ids[index]);
  ctx.globalAlpha=target===undefined?1-progress:1;
  paint(target===undefined?position:position+(Math.max(position,target)-position)*progress,index);
 });
 ctx.restore();
}
let lastAnalyticsFrame=null;

function draw(){
 if(!state.seed)return;const stage=$('mapStage'),w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 const bounds=state.seed.custom?layoutBounds(state.seed):{minX:220,minY:165,maxX:2200,maxY:1525},spanX=Math.max(1,bounds.maxX-bounds.minX),spanY=Math.max(1,bounds.maxY-bounds.minY),base=Math.min((w-60)/spanX,(h-100)/spanY),scale=base*state.zoom;
 viewport={w,h,scale,minX:bounds.minX,minY:bounds.minY,ox:(w-spanX*scale)/2+state.pan.x,oy:(h-spanY*scale)/2+40+state.pan.y};
 ctx.strokeStyle='#ffffff06';ctx.lineWidth=1;for(let x=0;x<w;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=24){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 const S=state.result?.lines||state.prepared?.stations||state.seed.stations,c=state.result?.config||state.config,snap=snapshot();
 const next=state.seed.dual?state.result?.snapshots[state.frame+1]:null;
 const progress=next&&snap?Math.max(0,Math.min(1,(state.time-snap.t)/(next.t-snap.t))):0;
 route(state.seed.path,'#69757d',6);route(state.seed.path,'#29353d',3);
 if(state.seed.dual){
  const split=state.seed.path.at(-1);
  for(const [i,trunk] of state.seed.trunks.entries()){
   const color=i===0?'#759cac':'#a99b79';
   route([split,trunk.points[0]],color,6);
   route(trunk.points,color,6);route(trunk.points,'#29353d',3);
   drawMovingBoxes(snap?.trunks?.[i],snap?.trunkIds?.[i],next?.trunks?.[i],next?.trunkIds?.[i],progress,m=>{
    const a=pathPoint(trunk.points,trunk.lengths,m);box(a.p,a.u,c.branchPitch,c.mainPitch,'#9ad1e5');
   });
  }
 }
 for(const s of S)route(s.branch,s.enabled===false?'#243d44':'#414b50',4);
 drawAccumulations(c,S);
 const mainPositions=snap?.positions;
 const mainZones=state.result?.mainZones||state.prepared?.mainZones||[{start:0,end:c.mainLength}];
 if(mainPositions){
  drawMovingBoxes(mainPositions,snap.positionIds,next?.positions,next?.positionIds,progress,(m,k)=>{
   const a=pathPoint(state.seed.path,state.seed.cum,m*state.seed.length/c.mainLength);
   const packed=(k&&mainPositions[k-1]-mainPositions[k]<c.mainPitch+.01)||m>=c.mainLength-c.mainPitch/2-.01;
   box(a.p,a.u,c.mainPitch,c.branchPitch,packed&&!insideZones(m,mainZones)?'#ff7266':packed?'#c1b191':'#d8dee1');
  });
 }
 else if(c.mainInitial){const n=Math.floor(zoneCapacity(mainZones,c.mainPitch)*c.mainInitial/100);for(const m of initialPositions(mainZones,c.mainPitch,n)){const a=pathPoint(state.seed.path,state.seed.cum,m*state.seed.length/c.mainLength);box(a.p,a.u,c.mainPitch,c.branchPitch,'#d8dee1');}}
 for(let j=0;j<S.length;j++){
  const s=S[j],stock=snap?snap.stock[j]:Math.floor(s.capacity*c.branchInitial/100),b=s.branch,dist=branchGeometry(b),total=dist.at(-1);
   const zones=s.storageZones||[{start:0,end:s.length}];
   const count=Math.min(stock,180);for(let k=0;k<count;k++){const m=levelDistance(zones,(k+.5)*(stock/count),c.branchPitch);const a=pathPoint(b,dist,s.useGeometryTravel?total-m:total*(1-m/s.length));box(a.p,a.u,c.branchPitch,c.mainPitch,'#c0ff00');}
   drawMovingBoxes(snap?.branchPositions?.[j],snap?.branchIds?.[j],next?.branchPositions?.[j],next?.branchIds?.[j],progress,m=>{
    const a=pathPoint(b,dist,m);box(a.p,a.u,c.branchPitch,c.mainPitch,'#c0ff00');
   });
   if(state.seed.dual&&s.enabled!==false){
    const [endX,endY]=world(b.at(-1));
    const [prevX,prevY]=world(b.at(-2));
    const length=Math.hypot(endX-prevX,endY-prevY)||1;
    const dx=3*(endY-prevY)/length,dy=3*(prevX-endX)/length;
    ctx.strokeStyle='#a4c385';ctx.lineWidth=1;ctx.beginPath();
    ctx.moveTo(endX-dx,endY-dy);ctx.lineTo(endX+dx,endY+dy);ctx.stroke();
   }
  const [x,y]=world(s.xy),selected=j===state.selected,active=snap?.active[j];
  if(selected){ctx.strokeStyle='#c0ff00';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.stroke();}
  if(active){ctx.strokeStyle='#ed996b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle=s.enabled===false?'#445c64':selected?'#c0ff00':'#9cb8bc';ctx.beginPath();ctx.arc(x,y,selected?3:2.5,0,Math.PI*2);ctx.fill();
  let dy=state.seed.dual?(s.group===0?-12:15):j<11?15:-12;if(!state.seed.dual&&[1,2,3].includes(j))dy=15+(j-1)*15;
  ctx.font='10px IBM Plex Mono,monospace';ctx.textAlign='center';ctx.fillStyle=selected?'#d6ff5f':'#7999a3';ctx.fillText(String(j+1).padStart(2,'0'),x,y+dy);
  if(state.seed.custom&&!state.seed.dual){const machine=world(s.branch.at(-1));ctx.textAlign='left';ctx.font='11px DM Sans,sans-serif';ctx.fillText(s.name,machine[0]+8,machine[1]+4);}
 }
 if(state.seed.dual){
  drawFlow(S);
  if(state.result){
   distributor.anchor(...world(state.seed.path.at(-1)),w,h);
   distributor.update(state.time);
  }
 }
 if(state.recording){ctx.fillStyle='#102832ee';ctx.fillRect(0,h-36,w,36);ctx.fillStyle='#d3efc5';ctx.font='13px IBM Plex Mono,monospace';ctx.textAlign='left';ctx.fillText('FLUXO  ·  '+clock(snap?.t||0)+'  ·  '+c.speed+' m/min  ·  '+c.inflow+' cx/min',15,h-13);}
 const scheduledStop=drawStops(S,c,snap);
 updateSelected(S,snap,c);
 if(snap!==lastAnalyticsFrame){analytics.updatePlayback(snap);lastAnalyticsFrame=snap;}
 $('clock').textContent=clock(state.seed.dual?state.time:snap?.t||0);
 const producing=snap?S.every((s,j)=>s.enabled===false||snap.running[j]):false;
 $('phaseBadge').textContent=!snap?'Pronto para simular':scheduledStop?'PARADA PROGRAMADA EM CURSO':
  state.seed.dual?(snap.filled?'REPOSIÇÃO POR CONSUMO':'ENCHIMENTO POR DEMANDA'):
  producing?'PRODUÇÃO EM ANDAMENTO':'PRÉ-ENCHIMENTO / AGUARDANDO CAIXAS';
}
function updateSelected(S,snap,c){
 const j=state.selected,s=S[j];if(!s)return;
 const stock=snap?snap.stock[j]:s.enabled===false?0:Math.floor((s.capacity||0)*c.branchInitial/100),cap=s.capacity||0;
 $('selectedName').textContent=s.name;$('selectedStock').textContent=stock;$('selectedCapacity').textContent=cap;
 $('stockFill').style.width=Math.min(100,stock/Math.max(1,cap)*100)+'%';$('minMark').style.left=(s.minimum||0)/Math.max(1,cap)*100+'%';$('maxMark').style.left=(s.maximum||0)/Math.max(1,cap)*100+'%';
 $('selectedMin').textContent='Mínimo '+s.minimum;$('selectedMax').textContent='Máximo '+s.maximum;
 $('selectedStatus').textContent=s.enabled===false?'Linha desligada':!snap?'Consumo: '+num(s.rate)+' cx/min':snap.active[j]?'Transferência em curso · freio ativo':!snap.running[j]?'Aguardando estoque para iniciar':snap.calls[j]?'Pedido de reposição aberto':'Produzindo · estoque disponível';
}
new ResizeObserver(()=>{draw();analytics.resize();}).observe($('mapStage'));
new ResizeObserver(()=>layoutEditor.resize()).observe($('ldStage'));
new ResizeObserver(()=>distributor.resize()).observe($('distributorPanel'));
$('editLayout').onclick=()=>{if(!state.seed||state.recording)return toast('Aguarde o carregamento ou encerre a gravação.');if(state.seed.dual)return toast('Use Definir acúmulos e a tabela de linhas para ajustar o Layout 03. O editor de desenho trabalha com uma única principal.');state.playing=false;$('play').textContent='▶';layoutEditor.open({seed:state.seed,config:state.prepared||state.config});};
$('newLayout').onclick=()=>{if(!state.seed||state.recording)return toast('Aguarde o carregamento ou encerre a gravação.');state.playing=false;$('play').textContent='▶';layoutEditor.open({seed:state.seed,config:state.config,blank:true});};
$('fitMap').onclick=()=>{state.zoom=1;state.pan={x:0,y:0};draw();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('mapStage').requestFullscreen?.().catch(()=>toast('Tela cheia indisponível neste navegador.'));};
canvas.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.8,Math.min(5,state.zoom*(e.deltaY<0?1.12:1/1.12)));draw();},{passive:false});
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);state.drag={x:e.clientX,y:e.clientY,px:state.pan.x,py:state.pan.y};});
canvas.addEventListener('pointermove',e=>{if(state.drag){state.pan.x=state.drag.px+e.clientX-state.drag.x;state.pan.y=state.drag.py+e.clientY-state.drag.y;draw();}});
canvas.addEventListener('pointerup',e=>{
 if(stopEdit.pick&&state.drag&&Math.hypot(e.clientX-state.drag.x,e.clientY-state.drag.y)<5){pickStopPoint(e);state.drag=null;return;}
 if(zoneEdit.pick&&state.drag&&Math.hypot(e.clientX-state.drag.x,e.clientY-state.drag.y)<5){pickAccumulationPoint(e);state.drag=null;return;}
 if(state.drag&&Math.hypot(e.clientX-state.drag.x,e.clientY-state.drag.y)<5){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;const S=state.result?.lines||state.prepared?.stations||state.seed.stations;let best=-1,d=20;S.forEach((s,j)=>{const q=world(s.xy),dist=Math.hypot(q[0]-x,q[1]-y);if(dist<d){best=j;d=dist;}});if(best>=0){state.selected=best;renderLines();draw();}}
 state.drag=null;
});
let lastTick=0;
function frameAt(t){const a=state.result.snapshots;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m].t<=t)lo=m;else hi=m-1;}return lo;}
let lastMotionDraw=-Infinity;
function tick(now){
 if(state.playing&&state.result&&!state.recording){
  if(lastTick)state.time+=(now-lastTick)/1000*Number($('playSpeed').value);
  const max=state.result.snapshots.at(-1).t;
  if(state.time>=max){state.time=max;state.playing=false;$('play').textContent='▶';}
  const k=frameAt(state.time),changed=k!==state.frame;
  if(changed){state.frame=k;$('timeline').value=k;}
  if(changed||(state.seed.dual&&now-lastMotionDraw>=33)){
   draw();lastMotionDraw=now;
  }
 }
 lastTick=now;requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
$('play').onclick=()=>{if(!state.result)return;if(state.time>=state.result.snapshots.at(-1).t)state.time=0;state.playing=!state.playing;$('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pausar':'Reproduzir');};
$('timeline').oninput=()=>{state.playing=false;$('play').textContent='▶';state.frame=Number($('timeline').value);state.time=state.result.snapshots[state.frame].t;draw();};

function download(name,blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
$('exportCSV').onclick=()=>{
 const S=state.result?.lines||state.prepared?.stations;if(!S)return toast('Corrija os parâmetros antes de exportar.',true);
 const rows=[['Linha','Ativa','Demanda cx/min','Comprimento ramal m','Capacidade de acumulo cx','Minimo cx','Maximo cx','Sensor minimo m','Sensor maximo m','Caixas consumidas','Ciclos sem caixa','Primeira caixa s','Liberacao s','Trechos de acumulo m desde a maquina']];
 for(const s of S)rows.push([s.name,s.enabled?'sim':'não',num(s.rate),num(s.length,3),s.capacity,s.minimum,s.maximum,num(s.minSensor,3),num(s.maxSensor,3),s.consumed??'',s.missed??'',s.firstArrival??'',s.start??'',(s.storageZones||[]).map(z=>num(z.start,3)+' a '+num(z.end,3)).join(' / ')]);
 const csv=rows.map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(';')).join('\r\n');download('fluxo-resultados.csv',new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
};
$('exportJSON').onclick=()=>{const r=state.result;const data={format:'fluxo-caixas-v2',seed:state.seed,config:state.config,result:r?{...r,snapshots:undefined,telemetry:undefined,shortageEvents:undefined,diversions:undefined}:null};download('torfresma-layout-e-cenario.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));};
$('importJSON').onclick=()=>$('importFile').click();
$('importFile').onchange=async()=>{
 const f=$('importFile').files[0];if(!f)return;try{if(f.size>5e6)throw Error('Use um arquivo de até 5 MB.');const data=JSON.parse(await f.text());
 if(data.format==='torfresma-layout-v1'){layoutEditor.open({layout:data.layout,config:state.config});$('importFile').value='';return;}
 if(!['fluxo-caixas-v1','fluxo-caixas-v2'].includes(data.format)||!data.config?.stations)throw Error('Arquivo de cenário inválido.');const seed=data.seed?latestReference(validateLayoutSeed(data.seed)):state.originalSeed;prepare(data.config,seed);state.seed=seed;state.config=data.config;state.selected=0;state.zoom=1;state.pan={x:0,y:0};zoneEdit.target='main';syncForm();invalidate();toast('Layout e cenário importados. Execute o ensaio para recalcular.');}catch(e){toast(e.message,true);}$('importFile').value='';
};
function latestReference(seed){return seed?.id===state.originalSeed.id?structuredClone(state.originalSeed):seed;}
function summary(r){return r?{duration:r.duration,demand:r.demand,consumed:r.consumed,missed:r.missed,allStart:r.allStart,rateMeasured:r.rateMeasured,mainEnd:r.mainEnd,branchEnd:r.branchEnd,mainCapacity:r.mainCapacity,outsideAccumMax:r.outsideAccumMax}:null;}
function updateSaved(){$('savedCount').textContent=state.history.length;}
$('saveScenario').onclick=()=>{
 modal('Salvar este cenário',`<label class="field">Nome do cenário<input class="modal-input" id="scenarioNameInput" maxlength="80" value="${esc(state.config.name||'Novo cenário')}"></label><button class="button" id="confirmSave">Salvar no navegador</button><p class="record-note" style="margin-top:14px">Os cenários ficam neste navegador. Exporte o arquivo para guardar uma cópia ou levar para outro computador.</p>`);
 $('confirmSave').onclick=()=>{const name=$('scenarioNameInput').value.trim()||'Novo cenário';state.config.name=name;state.history.push({id:crypto.randomUUID(),name,date:new Date().toISOString(),seed:structuredClone(state.seed),config:structuredClone(state.config),summary:summary(state.result)});if(state.history.length>20)state.history.shift();persist();updateSaved();$('modal').close();toast('Cenário salvo neste navegador.');};
};
$('compare').onclick=()=>{
 if(!state.history.length){toast('Salve dois cenários para comparar os resultados.');return;}
 modal('Cenários salvos',`<div class="scenario-list">${state.history.map((s,i)=>`<div class="scenario-row"><div><label><input type="checkbox" class="compare-check" value="${i}" ${i>=state.history.length-2?'checked':''}> ${esc(s.name)}</label><br><small>${num(s.config.durationHours,1)} h · ${s.config.speed} m/min · estoque ${s.config.mainInitial}% / ${s.config.branchInitial}%</small></div><div><button class="button" data-load="${i}">Carregar</button><button class="button ghost" data-remove="${i}" aria-label="Excluir cenário ${esc(s.name)}">×</button></div></div>`).join('')}</div><button class="button" id="doCompare" style="margin-top:18px">Comparar selecionados</button><div id="comparisonResult"></div>`);
 $('modalBody').querySelectorAll('[data-load]').forEach(b=>b.onclick=()=>{const s=state.history[+b.dataset.load];state.seed=latestReference(structuredClone(s.seed||state.originalSeed));state.config=structuredClone(s.config);state.selected=0;state.zoom=1;state.pan={x:0,y:0};zoneEdit.target='main';syncForm();invalidate();$('modal').close();toast('Layout e cenário carregados. Execute para reproduzir.');});
 $('modalBody').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.history.splice(+b.dataset.remove,1);persist();updateSaved();$('modal').close();$('compare').click();});
 $('doCompare').onclick=()=>{
  const chosen=[...document.querySelectorAll('.compare-check:checked')].map(el=>state.history[+el.value]);if(chosen.length<2||chosen.length>4)return toast('Selecione de 2 a 4 cenários.');
  const rows=[['Duração',s=>num(s.config.durationHours,1)+' h'],['Principal',s=>s.config.speed+' m/min'],['Alimentação',s=>s.config.inflow+' cx/min'],['Estoque inicial principal / ramais',s=>s.config.mainInitial+'% / '+s.config.branchInitial+'%'],['Caixas consumidas',s=>s.summary?int(s.summary.consumed):'Sem ensaio'],['Ciclos sem caixa',s=>s.summary?int(s.summary.missed):'Sem ensaio'],['Liberação de todas',s=>s.summary?(s.summary.allStart===null?'Não concluída':clock(s.summary.allStart)):'Sem ensaio'],['Taxa em regime',s=>s.summary?num(s.summary.rateMeasured)+' cx/min':'Sem ensaio']];
  $('comparisonResult').innerHTML=`<div class="compare-table" style="margin-top:20px"><table><thead><tr><th>Parâmetro</th>${chosen.map(s=>'<th>'+esc(s.name)+'</th>').join('')}</tr></thead><tbody>${rows.map(([label,get])=>'<tr><td>'+label+'</td>'+chosen.map(s=>'<td>'+esc(get(s))+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`;
 };
};
$('original').onclick=()=>{
 modal('Desenho cotado · Layout 03','<img id="layoutReferenceImage" class="modal-image" alt="Layout 03 com cotas dos transportadores.">');
 const img=$('layoutReferenceImage');img.onerror=()=>{img.onerror=null;img.src='layout03-cotado.svg';};img.src='assets/layout-cotado.png?v=14';
};
$('openAssumptions').onclick=()=>modal('Hipóteses e critérios do modelo',`<div class="modal-copy"><h3>Layout 03 e caixas</h3><p>Uma entrada e dois transportadores de distribuição. As caixas seguem em frente e são retiradas na transferência da máquina que precisa de reposição. A caixa de 464 × 290 × 214 mm ocupa 290 mm no sentido da entrada e 464 mm nos ramais. Nos três trechos longos cotados, usa-se 53,5607 m, 31,3373 m e 28,138 m. Os demais trechos seguem as linhas de centro aproximadas. A capacidade usa caixas inteiras no comprimento de acúmulo útil configurado. E18 e G22 são saídas alternativas.</p><h3>Partida e reposição</h3><p>O desvio reparte as caixas conforme o consumo dos lados ativos desde a partida. Quando um lado fica sem espaço, o outro pode receber a próxima caixa. No pré-enchimento global, as máquinas de cada lado recebem em rodízio até seus máximos, enquanto as caixas livres completam a reserva dos transportadores. Quando a produção começa, o desvio distribui novas caixas de acordo com o consumo das máquinas ativas em cada percurso. A liberação de cada máquina é determinada pela opção da barra lateral.</p><p>Como no FBRA, a reposição abre ao atingir o mínimo e fecha no máximo. As caixas em trânsito no ramal já contam para o limite de reposição. A taxa da tabela já inclui os 5% da planilha.</p><h3>Paradas e consumo</h3><p>As paradas contam desde o começo do ensaio. Caixas a jusante continuam e as máquinas usam suas reservas. A falta é um ciclo de consumo de uma máquina liberada sem caixa disponível.</p></div>`);

let recorder=null;
$('recordVideo').onclick=()=>{
 if(state.recording){recorder?.stop();return;}
 if(!state.result)return toast('Execute um ensaio antes de gravar.');
 if(!canvas.captureStream||!window.MediaRecorder)return toast('A gravação não está disponível neste navegador. Exporte o cenário ou o CSV.',true);
 modal('Gravar um trecho da simulação',`<div class="record-note">Gravação de 30 segundos, começando no instante selecionado e avançando até 30 minutos simulados. O arquivo será MP4 se o navegador suportar; caso contrário, WebM. A janela precisa permanecer visível durante a captura.</div><button class="button" id="startRecording" style="margin-top:20px">Iniciar gravação</button>`);
 $('startRecording').onclick=()=>{
  $('modal').close();state.playing=false;$('play').textContent='▶';
  const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime)return toast('Nenhum formato de gravação compatível foi encontrado.',true);
  const stream=canvas.captureStream(24),chunks=[];let finished=false;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1800000});}catch(e){stream.getTracks().forEach(t=>t.stop());return toast('Não foi possível iniciar a captura.',true);}
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{finished=true;stream.getTracks().forEach(t=>t.stop());state.recording=false;$('recordVideo').textContent='Gravar vídeo';download('fluxo-simulacao.'+(mime.startsWith('video/mp4')?'mp4':'webm'),new Blob(chunks,{type:mime}));toast('Trecho gravado.');};
  recorder.onerror=()=>{finished=true;state.recording=false;stream.getTracks().forEach(t=>t.stop());$('recordVideo').textContent='Gravar vídeo';toast('A captura foi interrompida pelo navegador.',true);};
  state.recording=true;$('recordVideo').textContent='Parar gravação';const begin=performance.now(),start=state.time,end=Math.min(state.result.snapshots.at(-1).t,start+1800);
  recorder.start();
  function capture(now){if(finished||!state.recording||!state.result)return;const u=Math.min(1,(now-begin)/30000);state.time=start+(end-start)*u;state.frame=frameAt(state.time);$('timeline').value=state.frame;draw();if(u===1){recorder.stop();}else requestAnimationFrame(capture);}
  requestAnimationFrame(capture);
 };
};

function zoneScope(){
 const c=state.config;
 if(zoneEdit.target==='main')return {kind:'main',limit:c.mainLength,points:state.seed.path,dist:state.seed.cum,pitch:c.mainPitch,label:'Principal',raw:c.accumulations?.main};
 const j=Number(zoneEdit.target.split(':')[1]),s=editableStation(j),seed=state.seed.stations[j],e18=supportsAlternative(state.seed)&&j===10&&c.alternative==='E18';
 const points=e18?state.seed.e18_branch:seed.branch,key=e18?'e18':String(j);
 return {kind:'branch',j,key,limit:s.length,geometric:!!seed.useGeometryTravel,points,dist:branchGeometry(points),pitch:c.branchPitch,label:s.name||seed.name,raw:c.accumulations?.branches?.[key]};
}
function setZoneRaw(scope,value){
 const c=state.config;c.accumulations??={};
 if(scope.kind==='main'){if(value===undefined)delete c.accumulations.main;else c.accumulations.main=value;}
 else{c.accumulations.branches??={};if(value===undefined)delete c.accumulations.branches[scope.key];else c.accumulations.branches[scope.key]=value;}
}
function renderZones(){
 if(!state.seed||!state.config)return;
 const selected=zoneEdit.target;
 $('zoneTarget').innerHTML='<option value="main">Esteira principal</option>'+(state.seed.dual?state.seed.trunks.map((_,i)=>'<option value="trunk:'+i+'">'+trunkLabel(i)+'</option>').join(''):'')+state.config.stations.map((s,j)=>'<option value="branch:'+j+'">Ramal · '+esc(state.prepared?.stations[j]?.name||s.name)+'</option>').join('');
 $('zoneTarget').value=selected;
 const scope=zoneScope();let zones;
 try{zones=normalizeZones(scope.raw,scope.limit,scope.label);}catch(e){$('zoneList').textContent=e.message;$('zoneCapacity').textContent='Ajuste os limites';return;}
 $('zoneReference').textContent=scope.kind==='main'?'Referência: 0 m na alimentação; distâncias ao longo da principal.':'Referência: 0 m na entrada da máquina; distâncias no sentido contrário ao fluxo do ramal.';
 $('zoneStart').max=scope.limit;$('zoneEnd').max=scope.limit;
 if(!$('zoneEnd').value)$('zoneEnd').value=String(scope.limit);
 $('zoneList').innerHTML=zones.length?zones.map((z,i)=>`<div class="zone-item"><span><b>${esc(z.name||'Trecho '+(i+1))}</b> ${num(z.start,3)} → ${num(z.end,3)} m <small>${Math.floor((z.end-z.start+1e-9)/scope.pitch)} cx</small></span><div><button data-zone-edit="${i}">Editar</button><button data-zone-remove="${i}" aria-label="Remover trecho ${i+1}">×</button></div></div>`).join(''):'<div class="zone-empty">Nenhum trecho definido. Marque início e fim para adicionar.</div>';
 $('zoneCapacity').textContent='Capacidade considerada: '+int(zoneCapacity(zones,scope.pitch))+' caixas';
 const r=state.result;$('zoneResult').textContent=r?(r.outsideAccumMax>0?'A fila ultrapassou os trechos da principal: até '+int(r.outsideAccumMax)+' caixas retidas fora da área. Revise os pontos ou o controle.':'Nenhuma retenção fora dos trechos da principal foi registrada neste ensaio.'):'Simule novamente após mudar os pontos.';
 $('zoneResult').classList.toggle('warning',!!r?.outsideAccumMax);
 $('zoneList').querySelectorAll('[data-zone-edit]').forEach(b=>b.onclick=()=>{const z=zones[+b.dataset.zoneEdit];zoneEdit.editId=z.id;$('zoneStart').value=z.start;$('zoneEnd').value=z.end;$('addZone').textContent='Salvar trecho';draw();});
 $('zoneList').querySelectorAll('[data-zone-remove]').forEach(b=>b.onclick=()=>{zones.splice(+b.dataset.zoneRemove,1);setZoneRaw(scope,zones);zoneEdit.editId=null;$('addZone').textContent='Adicionar trecho';invalidate();});
}
function openZoneEditor(){
 $('zoneEditor').hidden=false;$('editAccumulations').setAttribute('aria-expanded','true');state.playing=false;$('play').textContent='▶';renderZones();draw();
}
$('editAccumulations').onclick=()=>{if($('zoneEditor').hidden)openZoneEditor();else $('closeZones').click();};
$('closeZones').onclick=()=>{$('zoneEditor').hidden=true;zoneEdit.pick=null;canvas.classList.remove('picking');$('editAccumulations').setAttribute('aria-expanded','false');draw();};
$('zoneTarget').onchange=()=>{zoneEdit.target=$('zoneTarget').value;zoneEdit.editId=null;zoneEdit.pick=null;$('addZone').textContent='Adicionar trecho';const s=zoneScope();$('zoneStart').value=0;$('zoneEnd').value=String(s.limit);if(s.j!==undefined)state.selected=s.j;renderZones();draw();};
for(const key of ['zoneStart','zoneEnd'])$(key).addEventListener('input',()=>draw());
$('pickZone').onclick=()=>{zoneEdit.pick='start';canvas.classList.add('picking');state.playing=false;toast('Clique no início do acúmulo; depois clique no fim, no mesmo transportador.');};
$('addZone').onclick=()=>{
 const scope=zoneScope();const a=Number($('zoneStart').value),b=Number($('zoneEnd').value);
 if(!$('zoneStart').value||!$('zoneEnd').value)return toast('Informe o início e o fim do trecho.',true);
 const z={id:zoneEdit.editId||crypto.randomUUID(),name:'Acúmulo',start:Math.min(a,b),end:Math.max(a,b)};
 const list=scope.raw?scope.raw.filter(q=>q.id!==zoneEdit.editId):[];list.push(z);
 try{normalizeZones(list,scope.limit,scope.label);}catch(e){return toast(e.message,true);}
 setZoneRaw(scope,list);zoneEdit.editId=null;zoneEdit.pick=null;canvas.classList.remove('picking');$('addZone').textContent='Adicionar trecho';invalidate();toast('Trecho definido. Execute o ensaio para avaliar o acúmulo.');
};
$('resetZones').onclick=()=>{setZoneRaw(zoneScope(),undefined);zoneEdit.editId=null;$('addZone').textContent='Adicionar trecho';invalidate();toast('O transportador selecionado voltou a usar todo o trecho.');};
function pickAccumulationPoint(event){
 const scope=zoneScope(),rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
 let best={distance:Infinity,m:0};
 for(let k=0;k<scope.points.length-1;k++){
  const a=world(scope.points[k]),b=world(scope.points[k+1]),dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))),d=Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy);
  if(d<best.distance){const t=scope.dist[k]+u*(scope.dist[k+1]-scope.dist[k]);best={distance:d,m:scope.kind==='main'?t*scope.limit/state.seed.length:scope.geometric?scope.dist.at(-1)-t:(1-t/scope.dist.at(-1))*scope.limit};}
 }
 if(best.distance>35)return toast('Clique perto do transportador selecionado. Use o zoom se necessário.');
 if(best.m>scope.limit+.001)return toast('Esse ponto fica fora do acúmulo útil. Ajuste o ramal no editor de layout.');
 $(zoneEdit.pick==='start'?'zoneStart':'zoneEnd').value=String(Math.max(0,Math.min(scope.limit,Number(best.m.toFixed(3)))));
 if(zoneEdit.pick==='start'){zoneEdit.pick='end';toast('Início marcado. Agora clique no fim do acúmulo.');}else{zoneEdit.pick=null;canvas.classList.remove('picking');toast('Pontos marcados. Clique em Adicionar trecho para aplicar.');}
 draw();
}
function drawSubpath(points,dist,start,end,color,width){
 if(end<=start)return;const part=[pathPoint(points,dist,start).p];for(let k=1;k<points.length-1;k++)if(dist[k]>start&&dist[k]<end)part.push(points[k]);part.push(pathPoint(points,dist,end).p);route(part,color,width);
}
function drawAccumulations(c,S){
 const editing=!$('zoneEditor').hidden;
 let main;try{main=normalizeZones(c.accumulations?.main,c.mainLength);}catch{return;}
 ctx.save();ctx.globalAlpha=editing ? .48 : .22;
 if(editing||c.accumulations?.main)for(const z of main)drawSubpath(state.seed.path,state.seed.cum,z.start*state.seed.length/c.mainLength,z.end*state.seed.length/c.mainLength,'#c0ff00',10);
 for(let j=0;j<S.length;j++){
  const s=S[j],key=supportsAlternative(state.seed)&&j===10&&c.alternative==='E18'?'e18':String(j);if(!editing&&!c.accumulations?.branches?.[key])continue;
  const dist=branchGeometry(s.branch),total=dist.at(-1);for(const z of s.storageZones||[])drawSubpath(s.branch,dist,s.useGeometryTravel?total-z.end:(1-z.end/s.length)*total,s.useGeometryTravel?total-z.start:(1-z.start/s.length)*total,'#c0ff00',9);
 }
 ctx.restore();
 if(editing){
  const scope=zoneScope();const a=Number($('zoneStart').value),b=Number($('zoneEnd').value);
  if(Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>=0&&a<=scope.limit&&b<=scope.limit){
   const m=value=>scope.kind==='main'?value*state.seed.length/scope.limit:scope.geometric?scope.dist.at(-1)-value:(1-value/scope.limit)*scope.dist.at(-1);
   drawSubpath(scope.points,scope.dist,Math.min(m(a),m(b)),Math.max(m(a),m(b)),'#c0ff00',3);
   for(const [value,label] of [[a,'A'],[b,'B']]){const p=world(pathPoint(scope.points,scope.dist,m(value)).p);ctx.fillStyle='#c0ff00';ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fill();ctx.font='bold 12px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillText(label,p[0],p[1]-12);}
  }
 }
}

// Scheduled outages: editing and result inspection share the simulation layout.
const stopEdit={id:null,pick:false};
function stopScope(){
 const value=$('stopTarget').value||'main',target=value.split(':')[0],line=target==='main'?-1:Number(value.split(':')[1]);
 if(target==='main')return {target,line,limit:state.config.mainLength,points:state.seed.path,dist:state.seed.cum,label:'Esteira principal'};
 if(target==='trunk'){
  const trunk=state.seed.trunks[line];
  return {target,line,limit:trunk.length,points:trunk.points,dist:trunk.lengths,label:trunkLabel(line)};
 }
 let S=state.prepared?.stations;try{S??=prepare({...state.config,stops:[]},state.seed).stations;}catch{}
 const s=S?.[line]||state.seed.stations[line],dist=branchGeometry(s.branch);
 return {target,line,limit:target==='transfer'?0:s.travelLength||s.length,points:s.branch,dist,label:(target==='transfer'?'Transferência · ':'Ramal · ')+s.name};
}
const trunkLabel=i=>i===0?'Ramal de distribuição superior':'Ramal de distribuição inferior';
function stopLabel(s){if(s.target==='trunk')return trunkLabel(s.line)+' · '+num(s.position,3)+' m';return s.target==='main'?'Principal · '+num(s.position,3)+' m':(s.target==='transfer'?'Transferência · ':'Ramal · ')+(state.prepared?.stations[s.line]?.name||state.config.stations[s.line]?.name||'Linha removida')+(s.target==='branch'?' · '+num(s.position,3)+' m':'');}
function renderStops(){
 if(!state.seed)return;
 const value=$('stopTarget').value||'main';$('stopTarget').innerHTML='<option value="main">Esteira principal</option>'+(state.seed.dual?state.seed.trunks.map((_,i)=>'<option value="trunk:'+i+'">'+trunkLabel(i)+'</option>').join(''):'')+state.config.stations.map((_,j)=>{const name=esc(editableStation(j).name);return `<option value="branch:${j}">Ramal · ${name}</option><option value="transfer:${j}">Transferência · ${name}</option>`;}).join('');
 $('stopTarget').value=[...$('stopTarget').options].some(o=>o.value===value)?value:'main';
 const scope=stopScope();$('stopPosition').disabled=scope.target==='transfer';$('pickStop').disabled=scope.target==='transfer';$('stopPosition').max=scope.limit;
 $('stopReference').textContent=scope.target==='transfer'?'Impede iniciar novas transferências nessa máquina; o ciclo já iniciado termina normalmente.':'Referência: 0 m '+(scope.target==='main'?'na alimentação da principal.':scope.target==='trunk'?'no desvio, seguindo o ramal de distribuição.':'na transferência, seguindo o ramal até a máquina.')+' Percurso: '+num(scope.limit,3)+' m.';
 $('stopList').innerHTML=(state.config.stops||[]).map((s,i)=>`<div class="zone-item"><span><b>${esc(s.name)}</b> · ${esc(stopLabel(s))}<small>${clock(s.start)} · duração ${clock(s.duration)} · fim ${clock(s.start+s.duration)}</small></span><div><button data-stop-edit="${i}">Editar</button><button data-stop-remove="${i}" aria-label="Remover parada ${i+1}">×</button></div></div>`).join('')||'<p>Nenhuma parada programada.</p>';
 $('addStop').textContent=stopEdit.id?'Salvar parada':'Adicionar parada';$('cancelStopEdit').hidden=!stopEdit.id;
 $('stopList').querySelectorAll('[data-stop-remove]').forEach(b=>b.onclick=()=>{state.config.stops.splice(+b.dataset.stopRemove,1);stopEdit.id=null;invalidate();});
 $('stopList').querySelectorAll('[data-stop-edit]').forEach(b=>b.onclick=()=>{const s=state.config.stops[+b.dataset.stopEdit];stopEdit.id=s.id;$('stopName').value=s.name;$('stopTarget').value=s.target==='main'?'main':s.target+':'+s.line;$('stopPosition').value=s.position;$('stopStart').value=clock(s.start);$('stopDuration').value=clock(s.duration);renderStops();});
 renderStopResults();
}
function renderStopResults(){
 const r=state.result,events=r?.stopResults||[];$('stopReport').hidden=!events.length;
 $('stopResults').innerHTML=events.map(e=>{
  const elapsed=e.recoverySeconds===null?'Não recuperou':clock(Math.ceil(e.recoverySeconds)),main=e.referenceMain===null?'':`<tr><td>Principal</td><td>${int(e.referenceMain)}</td><td>—</td><td>${e.mainRecoveredAt===null?'Não recuperou':clock(Math.max(0,Math.ceil(e.mainRecoveredAt-e.end)))}</td><td>—</td></tr>`;
  return `<article class="stop-card"><h3>${esc(e.name)} · ${esc(stopLabel(e))}</h3><p>${clock(e.start)} → ${clock(e.end)}${e.end>r.duration?' · parada continua após o fim do ensaio':''}</p><div class="stop-metrics"><span>Faltas na janela observada<b>${int(e.missed||0)} ciclos</b></span><span>Recuperação após retomada<b>${elapsed}</b></span><span>Referências dos ramais recuperadas<b>${e.lines.filter(x=>x.recoveredAt!==null).length} / ${e.lines.length}</b></span></div><button data-stop-seek="${e.start}">Ver início</button> <button data-stop-seek="${Math.min(e.end,r.duration)}">Ver retomada</button>${e.recoveredAt!==null?` <button data-stop-seek="${e.recoveredAt}">Ver recuperação</button>`:''}<details><summary>Estoque e recuperação por acúmulo</summary><table><thead><tr><th>Acúmulo</th><th>Caixas antes</th><th>Menor estoque</th><th>Tempo após retomada</th><th>Faltas até recuperar</th></tr></thead><tbody>${main}${e.lines.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.reference}</td><td>${x.minimum}</td><td>${x.recoveredAt===null?'Não recuperou':clock(Math.max(0,Math.ceil(x.recoveredAt-e.end)))}</td><td>${x.missed}</td></tr>`).join('')}</tbody></table></details>${e.lines.some(x=>x.reference===0)?'<p class="field-note">Referência de zero caixas: esse ramal não tinha reserva antes da parada.</p>':''}</article>`;
 }).join('');
 $('stopResults').querySelectorAll('[data-stop-seek]').forEach(b=>b.onclick=()=>{state.playing=false;state.time=+b.dataset.stopSeek;state.frame=frameAt(state.time);$('timeline').value=state.frame;$('play').textContent='▶';draw();$('mapStage').scrollIntoView?.({block:'center'});});
}
$('editStops').onclick=()=>{if(!state.seed)return;$('stopEditor').hidden=!$('stopEditor').hidden;$('editStops').setAttribute('aria-expanded',String(!$('stopEditor').hidden));renderStops();};
$('closeStops').onclick=()=>{$('stopEditor').hidden=true;stopEdit.pick=false;$('editStops').setAttribute('aria-expanded','false');canvas.classList.remove('picking');};
$('stopTarget').onchange=()=>{stopEdit.pick=false;$('stopPosition').value=0;renderStops();};
$('cancelStopEdit').onclick=()=>{stopEdit.id=null;renderStops();};
$('pickStop').onclick=()=>{stopEdit.pick=true;zoneEdit.pick=null;canvas.classList.add('picking');toast('Clique no transportador escolhido para marcar a parada.');};
$('addStop').onclick=()=>{
 try{
  const scope=stopScope(),q={id:stopEdit.id||crypto.randomUUID(),name:$('stopName').value.trim()||'Parada '+((state.config.stops?.length||0)+1),target:scope.target,line:scope.line,position:scope.target==='transfer'?0:Number($('stopPosition').value),start:parseStopTime($('stopStart').value),duration:parseStopTime($('stopDuration').value)};
  if(scope.target!=='transfer'&&!$('stopPosition').value.trim())throw Error('Informe a posição da parada.');
  const next={...state.config,stops:[...(state.config.stops||[]).filter(s=>s.id!==q.id),q]};prepare(next,state.seed);state.config=next;stopEdit.id=null;stopEdit.pick=false;canvas.classList.remove('picking');invalidate();toast('Parada programada. Simule novamente para calcular as faltas e a recuperação.');
 }catch(e){toast(e.message,true);}
};
function pickStopPoint(e){
 const scope=stopScope(),rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let best={distance:Infinity,m:0};
 for(let k=0;k<scope.points.length-1;k++){
  const a=world(scope.points[k]),b=world(scope.points[k+1]),dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1))),distance=Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy);
  if(distance<best.distance)best={distance,m:(scope.dist[k]+u*(scope.dist[k+1]-scope.dist[k]))/scope.dist.at(-1)*scope.limit};
 }
 if(best.distance>35)return toast('Clique perto do transportador selecionado.');
 $('stopPosition').value=Math.min(scope.limit,Number(best.m.toFixed(3)));stopEdit.pick=false;canvas.classList.remove('picking');draw();toast('Ponto marcado. Ajuste o horário e a duração, depois adicione a parada.');
}
function drawStops(S,c,snap){
 let any=false;const stops=state.result?.stops||state.config.stops||[];
 for(const e of stops){
  const active=snap&&stopActive(e,snap.t);any||=!!active;
  let point;if(e.target==='main')point=pathPoint(state.seed.path,state.seed.cum,e.position/c.mainLength*state.seed.length).p;
  else if(e.target==='trunk'){const g=state.seed.trunks?.[e.line];if(!g)continue;point=pathPoint(g.points,g.lengths,e.position).p;}
  else{const s=S[e.line];if(!s)continue;point=e.target==='transfer'?s.xy:pathPoint(s.branch,branchGeometry(s.branch),e.position/(s.travelLength||s.length)*branchGeometry(s.branch).at(-1)).p;}
  const [x,y]=world(point);ctx.strokeStyle=active?'#ff7266':'#ed996b';ctx.fillStyle=active?'#ff7266':'#ed996b';ctx.lineWidth=active?3:1.5;ctx.beginPath();ctx.arc(x,y,active?11:7,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke();ctx.font='11px DM Sans,sans-serif';ctx.textAlign='left';ctx.fillText(e.name+(active?' · PARADA':''),x+13,y-10);
 }
 return any;
}

async function init(){
 try{
  const response=await fetch('./seed.json');if(!response.ok)throw Error('Não foi possível carregar o layout.');state.originalSeed=await response.json();state.originalSeed.name??='Layout 03 / Simulação II';state.seed=structuredClone(state.originalSeed);state.config=defaultConfig(state.seed);
  try{const saved=JSON.parse(localStorage.getItem('natura-ii-fbra-config')),layout=JSON.parse(localStorage.getItem('natura-ii-fbra-layout'));const seed=layout?latestReference(validateLayoutSeed(layout)):state.originalSeed;if(saved?.stations?.length===seed.stations.length){prepare(saved,seed);state.seed=seed;state.config=saved;}const h=JSON.parse(localStorage.getItem('natura-ii-fbra-history'));if(Array.isArray(h))state.history=h.slice(-20);}catch{}
  state.selected=Math.min(11,state.seed.stations.length-1);
  syncForm();preview();updateConfigured();renderLines();renderStops();updateSaved();draw();$('runButton').disabled=false;
 }catch(e){toast(e.message,true);$('runButton').disabled=true;}
}
init();
