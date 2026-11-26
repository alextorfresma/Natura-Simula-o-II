import {emptyLayout,compileLayout,configForLayout,layoutFromSeed,lengths,projectPoint,moveMainPoint,moveBranchPoint,reconnectBranches,validateDraft,id} from './layout-data.js?v=14';
import {normalizeZones,zoneCapacity} from './accumulations.js?v=14';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=2)=>Number(x).toLocaleString('pt-BR',{maximumFractionDigits:n,minimumFractionDigits:n});
export function createLayoutEditor({get:$,notify,download,onApply,makeDefault}){
 let draft=emptyLayout(),baseConfig=null,tool='select',selection=null,pending=null,preview=null,view=null,drag=null,history=[],future=[],zoneTarget='main',zonePick=null,zoneEdit=null,lastZoneTarget=null,lastZoneLimit=null;
 const canvas=$('ldCanvas'),ctx=canvas.getContext('2d'),tools={select:'ldSelect',main:'ldMain',branch:'ldBranch',point:'ldPoint'};
 function checkpoint(){history.push(structuredClone(draft));if(history.length>60)history.shift();future=[];}
 function undo(){if(pending){if(pending.points.length>1)pending.points.pop();else pending=null;paint();return;}if(!history.length)return;future.push(structuredClone(draft));draft=history.pop();selection=null;paint();}
 function redo(){if(!future.length)return;history.push(structuredClone(draft));draft=future.pop();selection=null;paint();}
 function open({seed,config,blank=false,layout}={}){
  baseConfig=structuredClone(config);draft=layout?structuredClone(validateDraft(layout)):blank?emptyLayout():layoutFromSeed(seed,config);selection=null;pending=null;history=[];future=[];zoneTarget='main';zoneEdit=null;zonePick=null;view=null;lastZoneTarget=null;lastZoneLimit=null;
  $('layoutModal').showModal();setTool(blank?'main':'select');fit();paint();
 }
 function currentLine(){return selection?.line!==undefined?draft.stations[selection.line]:null;}
 function currentNode(){if(selection?.kind==='mainNode')return draft.main[selection.index];if(selection?.kind==='branchNode')return draft.stations[selection.line]?.points[selection.index];return null;}
 function world(p){return [p[0]*view.scale+view.x,p[1]*view.scale+view.y];}
 function inverse(x,y){return [(x-view.x)/view.scale,(y-view.y)/view.scale];}
 function fit(){
  const p=[...draft.main,...draft.stations.flatMap(s=>s.points)];let x0=0,y0=0,x1=40,y1=25;
  if(p.length){x0=Math.min(...p.map(v=>v[0]))-2;y0=Math.min(...p.map(v=>v[1]))-2;x1=Math.max(...p.map(v=>v[0]))+2;y1=Math.max(...p.map(v=>v[1]))+2;}
  const w=$('ldStage').clientWidth||900,h=$('ldStage').clientHeight||550,scale=Math.min((w-50)/Math.max(1,x1-x0),(h-70)/Math.max(1,y1-y0));view={scale,x:(w-(x1-x0)*scale)/2-x0*scale,y:(h-(y1-y0)*scale)/2-y0*scale};
 }
 function snap(p,last){let q=[...p];if($('ldSnap').checked){const unit=Number($('ldGrid').value)||.5;q=q.map(v=>Math.round(v/unit)*unit);}if(last&&$('ldOrtho').checked){if(Math.abs(q[0]-last[0])>=Math.abs(q[1]-last[1]))q[1]=last[1];else q[0]=last[0];}return q;}
 function path(points,color,width=2,dash=[]){if(!points.length)return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();points.forEach((p,j)=>{const q=world(p);if(j)ctx.lineTo(...q);else ctx.moveTo(...q);});ctx.stroke();ctx.setLineDash([]);}
 function node(p,color,r=4){const q=world(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.fill();}
 function paint(){
  if(!view)fit();const w=$('ldStage').clientWidth||900,h=$('ldStage').clientHeight||550,dpr=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  let unit=Number($('ldGrid').value)||.5;while(unit*view.scale<25)unit*=2;const a=inverse(0,0),b=inverse(w,h);ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;ctx.font='9px IBM Plex Mono,monospace';ctx.fillStyle='#76848c';
  for(let x=Math.floor(a[0]/unit)*unit;x<=b[0];x+=unit){const p=world([x,0]);ctx.beginPath();ctx.moveTo(p[0],0);ctx.lineTo(p[0],h);ctx.stroke();ctx.fillText(fmt(x,unit<1?1:0),p[0]+3,12);}
  for(let y=Math.floor(a[1]/unit)*unit;y<=b[1];y+=unit){const p=world([0,y]);ctx.beginPath();ctx.moveTo(0,p[1]);ctx.lineTo(w,p[1]);ctx.stroke();ctx.fillText(fmt(y,unit<1?1:0),4,p[1]-4);}
  drawZones();path(draft.main,'#d4dde1',4);draft.main.forEach((p,i)=>node(p,selection?.kind==='mainNode'&&selection.index===i?'#c0ff00':'#6c818c',selection?.kind==='mainNode'&&selection.index===i?6:3));
  draft.stations.forEach((s,j)=>{
   const selected=selection?.line===j;path(s.points,selected?'#c0ff00':'#7b9c54',selected?3:2);
   if(selected)s.points.forEach((p,i)=>node(p,selection?.kind==='branchNode'&&selection.index===i?'#fff':'#c0ff00',4));
   const p=world(s.points.at(-1));ctx.fillStyle=selected?'#c0ff00':'#b7c3c7';ctx.fillRect(p[0]-5,p[1]-5,10,10);ctx.font='11px DM Sans,sans-serif';ctx.textAlign='left';ctx.fillText(s.name||'Sem nome',p[0]+9,p[1]+4);
  });
  if(draft.main.length){const p=world(draft.main[0]);ctx.fillStyle='#c0ff00';ctx.font='10px DM Sans,sans-serif';ctx.fillText('ALIMENTAÇÃO / INÍCIO',p[0]+9,p[1]-10);}
  if(pending){path(pending.points,'#c0ff00',3);if(preview)path([pending.points.at(-1),preview],'#c0ff00',1,[5,4]);}
  else if(tool==='main'&&preview&&draft.main.length)path([draft.main.at(-1),preview],'#c0ff00',1,[5,4]);
  if(!draft.main.length){ctx.fillStyle='#a3b4bc';ctx.font='17px DM Sans,sans-serif';ctx.textAlign='center';ctx.fillText('Clique para iniciar a principal. Cada ponto cria um novo segmento.',w/2,h/2);ctx.textAlign='left';}
  inspector();$('ldUndo').disabled=!history.length&&!pending;$('ldRedo').disabled=!future.length;
 }
 function inspector(){
  $('ldProjectName').value=draft.name;$('ldSummary').textContent=fmt(lengths(draft.main).at(-1)||0)+' m de principal · '+draft.stations.length+' linhas';
  const p=currentNode(),line=currentLine();$('ldNodeProps').hidden=!p;$('ldLineProps').hidden=!line;
  if(p){$('ldX').value=Number(p[0].toFixed(6));$('ldY').value=Number(p[1].toFixed(6));}
  if(line){$('ldLineName').value=line.name;$('ldRate').value=line.rate;$('ldEnabled').checked=line.enabled!==false;$('ldAutoLength').checked=!!line.autoLength;$('ldUsable').value=line.autoLength?lengths(line.points).at(-1):line.usableLength;$('ldUsable').disabled=!!line.autoLength;$('ldBranchLength').textContent='Percurso desenhado: '+fmt(lengths(line.points).at(-1),3)+' m. O trânsito usa esta distância.';}
  $('ldLineList').innerHTML=draft.stations.map((s,j)=>`<button type="button" data-editor-line="${j}" class="${selection?.line===j?'active':''}"><span>${esc(s.name||'Sem nome')}</span><small>${fmt(s.rate)} cx/min</small></button>`).join('')||'<p class="layout-summary">Desenhe um ramal para adicionar a primeira máquina.</p>';
  $('ldLineList').querySelectorAll('[data-editor-line]').forEach(b=>b.onclick=()=>{selection={kind:'station',line:Number(b.dataset.editorLine)};zoneTarget='branch:'+selection.line;paint();});renderZones();
 }
 function setTool(value){tool=value;zonePick=null;preview=null;for(const [key,name]of Object.entries(tools))$(name).classList.toggle('active',key===tool);$('ldToolHint').textContent=value==='main'?'Clique para acrescentar pontos à principal; Concluir ou Enter termina o traçado.':value==='branch'?'Clique na principal para iniciar um ramal, desenhe seus pontos e clique em Concluir.':value==='point'?'Clique sobre um segmento para inserir um ponto; depois selecione e arraste.':'Arraste os pontos para mudar o desenho. Arraste uma área vazia para mover a vista.';canvas.style.cursor=value==='select'?'default':'crosshair';}
 function finish(){if(pending){if(pending.points.length<2)return notify('Desenhe pelo menos um segmento para o ramal.',true);checkpoint();let k=draft.stations.length+1;while(draft.stations.some(s=>s.name==='Linha '+k))k++;draft.stations.push({id:id(),name:'Linha '+k,rate:1,enabled:true,points:pending.points,usableLength:lengths(pending.points).at(-1),autoLength:true});selection={kind:'station',line:draft.stations.length-1};zoneTarget='branch:'+selection.line;pending=null;}setTool('select');paint();}
 function closestPath(p){let best=null;if(draft.main.length>1)best={...projectPoint(draft.main,p),kind:'main'};draft.stations.forEach((s,j)=>{const h=projectPoint(s.points,p);if(!best||h.distance<best.distance)best={...h,kind:'branch',line:j};});return best;}
 function hitNode(x,y){let best=null,d=12;draft.main.forEach((p,i)=>{const q=world(p),dist=Math.hypot(q[0]-x,q[1]-y);if(dist<d){best={kind:'mainNode',index:i};d=dist;}});draft.stations.forEach((s,j)=>s.points.forEach((p,i)=>{const q=world(p),dist=Math.hypot(q[0]-x,q[1]-y);if(dist<d){best={kind:'branchNode',line:j,index:i};d=dist;}}));return best;}
 function changeNode(p){if(selection?.kind==='mainNode')moveMainPoint(draft,selection.index,p);else if(selection?.kind==='branchNode')moveBranchPoint(draft,selection.line,selection.index,p);}
 function remove(){
  if(!selection)return;checkpoint();
  if(selection.kind==='station')draft.stations.splice(selection.line,1);
  else if(selection.kind==='branchNode'){const s=currentLine();if(selection.index===0){history.pop();return notify('Arraste a ligação para movê-la. Selecione a linha pelo painel para excluí-la.');}if(s.points.length<=2)draft.stations.splice(selection.line,1);else{const next=s.points.filter((_,i)=>i!==selection.index);if(next.some((p,i)=>i&&Math.hypot(p[0]-next[i-1][0],p[1]-next[i-1][1])<.01)){history.pop();return notify('A remoção sobreporia pontos do ramal.');}s.points=next;if(s.autoLength)s.usableLength=lengths(s.points).at(-1);}}
  else if(selection.kind==='mainNode'){if(draft.main.length<=2){history.pop();return notify('Mantenha pelo menos dois pontos na principal.');}const next=draft.main.filter((_,i)=>i!==selection.index);if(next.some((p,i)=>i&&Math.hypot(p[0]-next[i-1][0],p[1]-next[i-1][1])<.01)){history.pop();return notify('A remoção sobreporia pontos da principal.');}draft.main=next;reconnectBranches(draft);}
  selection=null;zoneTarget='main';paint();
 }
 function eventPoint(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 canvas.addEventListener('pointerdown',e=>{
  const q=eventPoint(e),p=inverse(q.x,q.y);canvas.setPointerCapture(e.pointerId);
  if(zonePick){pickZonePoint(p);return;}
  if(tool==='main'){const point=snap(p,draft.main.at(-1));if(draft.main.length&&Math.hypot(point[0]-draft.main.at(-1)[0],point[1]-draft.main.at(-1)[1])<.01)return;checkpoint();draft.main.push(point);selection={kind:'mainNode',index:draft.main.length-1};paint();return;}
  if(tool==='branch'){
   if(draft.main.length<2)return notify('Desenhe primeiro a principal.',true);
   if(!pending){const hit=projectPoint(draft.main,p);if(hit.distance*view.scale>22)return notify('Inicie o ramal clicando sobre a principal.');pending={points:[hit.point]};}
   else{const point=snap(p,pending.points.at(-1));if(Math.hypot(point[0]-pending.points.at(-1)[0],point[1]-pending.points.at(-1)[1])>.01)pending.points.push(point);}paint();return;
  }
  if(tool==='point'){const h=closestPath(p);if(!h||h.distance*view.scale>22)return notify('Clique sobre um segmento.');const points=h.kind==='main'?draft.main:draft.stations[h.line].points;if(Math.hypot(h.point[0]-points[h.segment][0],h.point[1]-points[h.segment][1])<.02||Math.hypot(h.point[0]-points[h.segment+1][0],h.point[1]-points[h.segment+1][1])<.02)return notify('Esse ponto já existe. Use Selecionar para arrastá-lo.');checkpoint();points.splice(h.segment+1,0,h.point);selection=h.kind==='main'?{kind:'mainNode',index:h.segment+1}:{kind:'branchNode',line:h.line,index:h.segment+1};setTool('select');paint();return;}
  const hit=hitNode(q.x,q.y);if(hit){selection=hit;zoneTarget=hit.line===undefined?'main':'branch:'+hit.line;drag={kind:'node',before:structuredClone(draft),moved:false};paint();return;}
  const h=closestPath(p);if(h?.kind==='branch'&&h.distance*view.scale<12){selection={kind:'station',line:h.line};zoneTarget='branch:'+h.line;paint();return;}
  selection=null;drag={kind:'pan',x:q.x,y:q.y,vx:view.x,vy:view.y};paint();
 });
 canvas.addEventListener('pointermove',e=>{const q=eventPoint(e),p=inverse(q.x,q.y);if(drag?.kind==='node'){const point=snap(p);if(Math.abs(point[0])>10000||Math.abs(point[1])>10000)return;try{changeNode(point);}catch{return;}drag.moved=true;paint();}else if(drag?.kind==='pan'){view.x=drag.vx+q.x-drag.x;view.y=drag.vy+q.y-drag.y;paint();}else if(pending||tool==='main'){preview=snap(p,pending?pending.points.at(-1):draft.main.at(-1));paint();}});
 canvas.addEventListener('pointerup',()=>{if(drag?.kind==='node'&&drag.moved){history.push(drag.before);future=[];}drag=null;});
 canvas.addEventListener('wheel',e=>{e.preventDefault();const q=eventPoint(e),p=inverse(q.x,q.y),scale=Math.max(.3,Math.min(200,view.scale*(e.deltaY<0?1.12:1/1.12)));view={scale,x:q.x-p[0]*scale,y:q.y-p[1]*scale};paint();},{passive:false});
 function zoneScope(){if(zoneTarget==='main')return {points:draft.main,limit:lengths(draft.main).at(-1)||0,raw:draft.mainZones};const j=Number(zoneTarget.split(':')[1]),line=draft.stations[j];if(!line){zoneTarget='main';return zoneScope();}return {j,points:line.points,limit:line.autoLength?lengths(line.points).at(-1):Number(line.usableLength),raw:line.zones};}
 function setZones(zones){const scope=zoneScope();if(scope.j===undefined)draft.mainZones=zones;else draft.stations[scope.j].zones=zones;}
 function renderZones(){
  $('ldZoneTarget').innerHTML='<option value="main">Principal</option>'+draft.stations.map((s,j)=>`<option value="branch:${j}">${esc(s.name)}</option>`).join('');$('ldZoneTarget').value=zoneTarget;
  const scope=zoneScope(),zones=scope.raw??(scope.limit>0?[{id:'full',name:'Todo o trecho',start:0,end:scope.limit}]:[]);
  if(lastZoneTarget!==zoneTarget){$('ldZoneStart').value=0;$('ldZoneEnd').value=scope.limit;zoneEdit=null;$('ldAddZone').textContent='Adicionar';}else if(!zoneEdit&&Math.abs(Number($('ldZoneEnd').value)-lastZoneLimit)<1e-6)$('ldZoneEnd').value=scope.limit;lastZoneTarget=zoneTarget;lastZoneLimit=scope.limit;
  $('ldZoneReference').textContent=scope.j===undefined?'Metros desde a alimentação. Extensão: '+fmt(scope.limit,3)+' m.':'Metros desde a entrada da máquina, contra o fluxo. Útil: '+fmt(scope.limit,3)+' m.';
  $('ldZoneList').innerHTML=zones.map((z,i)=>`<div><span>${fmt(z.start,3)} → ${fmt(z.end,3)} m</span><button type="button" data-edit-layout-zone="${i}">Editar</button><button type="button" data-remove-layout-zone="${i}" aria-label="Remover acúmulo">×</button></div>`).join('')||'<p class="layout-summary">Nenhum acúmulo definido.</p>';
  $('ldZoneList').querySelectorAll('[data-edit-layout-zone]').forEach(b=>b.onclick=()=>{const z=zones[+b.dataset.editLayoutZone];zoneEdit=z.id;$('ldZoneStart').value=z.start;$('ldZoneEnd').value=z.end;$('ldAddZone').textContent='Salvar';});
  $('ldZoneList').querySelectorAll('[data-remove-layout-zone]').forEach(b=>b.onclick=()=>{checkpoint();setZones(zones.filter((_,i)=>i!==+b.dataset.removeLayoutZone));paint();});
 }
 function sampleAt(points,m){const d=lengths(points),clamped=Math.max(0,Math.min(d.at(-1),m));let i=0;while(i<d.length-2&&d[i+1]<clamped)i++;const u=(clamped-d[i])/Math.max(.000001,d[i+1]-d[i]);return [points[i][0]+u*(points[i+1][0]-points[i][0]),points[i][1]+u*(points[i+1][1]-points[i][1])];}
 function drawZone(points,start,end,limit,reverse=false){if(points.length<2||!limit)return;const d=lengths(points),total=d.at(-1),a=reverse?total-end:start,b=reverse?total-start:end,part=[sampleAt(points,a)];for(let i=1;i<points.length-1;i++)if(d[i]>a&&d[i]<b)part.push(points[i]);part.push(sampleAt(points,b));ctx.save();ctx.globalAlpha=.32;path(part,'#c0ff00',11);ctx.restore();}
 function drawZones(){const length=lengths(draft.main).at(-1)||0;for(const z of draft.mainZones||[])drawZone(draft.main,z.start,z.end,length);draft.stations.forEach(s=>{for(const z of s.zones||[])drawZone(s.points,z.start,z.end,s.autoLength?lengths(s.points).at(-1):s.usableLength,true);});}
 function pickZonePoint(p){const scope=zoneScope();if(scope.points.length<2)return notify('Desenhe primeiro o transportador.');const hit=projectPoint(scope.points,p);if(hit.distance*view.scale>25)return notify('Clique no transportador escolhido no painel.');const value=scope.j===undefined?hit.s:lengths(scope.points).at(-1)-hit.s;if(value>scope.limit+.001)return notify('O ponto fica fora do comprimento útil. Ajuste esse comprimento nas propriedades da linha.');$(zonePick==='start'?'ldZoneStart':'ldZoneEnd').value=Number(value.toFixed(5));if(zonePick==='start'){zonePick='end';notify('Agora marque o fim do acúmulo.');}else{zonePick=null;notify('Pontos marcados. Clique em Adicionar para aplicar.');}paint();}
 for(const [key,name]of Object.entries(tools))$(name).onclick=()=>{if(pending&&key!=='branch')pending=null;setTool(key);paint();};
 $('ldFinish').onclick=finish;$('ldDelete').onclick=remove;$('ldUndo').onclick=undo;$('ldRedo').onclick=redo;$('ldFit').onclick=()=>{fit();paint();};
 $('ldCancel').onclick=()=>$('layoutModal').close();$('ldNewBlank').onclick=()=>{checkpoint();draft=emptyLayout();selection=null;pending=null;zoneTarget='main';view=null;setTool('main');fit();paint();};
 $('ldProjectName').onchange=()=>{checkpoint();draft.name=$('ldProjectName').value;};
 for(const key of ['ldX','ldY'])$(key).onchange=()=>{const p=currentNode();if(!p)return;const q=[Number($('ldX').value),Number($('ldY').value)];if(q.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))return notify('Coordenadas inválidas.',true);checkpoint();try{changeNode(q);}catch(e){history.pop();notify(e.message,true);}paint();};
 for(const [key,property]of [['ldLineName','name'],['ldRate','rate'],['ldUsable','usableLength'],['ldEnabled','enabled'],['ldAutoLength','autoLength']])$(key).onchange=()=>{const s=currentLine();if(!s)return;checkpoint();s[property]=property==='name'?$(key).value:property==='enabled'||property==='autoLength'?$(key).checked:Number($(key).value);if(s.autoLength)s.usableLength=lengths(s.points).at(-1);paint();};
 $('ldZoneTarget').onchange=()=>{zoneTarget=$('ldZoneTarget').value;zoneEdit=null;zonePick=null;$('ldZoneStart').value=0;$('ldZoneEnd').value=zoneScope().limit;paint();};
 $('ldMarkZone').onclick=()=>{zonePick='start';setTool('select');zonePick='start';notify('Marque o início e o fim no transportador selecionado.');};
 $('ldAddZone').onclick=()=>{const scope=zoneScope(),a=Number($('ldZoneStart').value),b=Number($('ldZoneEnd').value),z={id:zoneEdit||id(),name:'Acúmulo',start:Math.min(a,b),end:Math.max(a,b)},list=(scope.raw||[]).filter(q=>q.id!==zoneEdit);list.push(z);try{normalizeZones(list,scope.limit);}catch(e){return notify(e.message,true);}checkpoint();setZones(list);zoneEdit=null;$('ldAddZone').textContent='Adicionar';paint();};
 $('ldFullZone').onclick=()=>{checkpoint();setZones(undefined);paint();};
 $('ldApply').onclick=()=>{try{if(pending){if(pending.points.length<2)throw Error('Conclua ou cancele o ramal em andamento antes de aplicar.');finish();}const seed=compileLayout(draft,{mainPitch:baseConfig?.mainPitch||.29,branchPitch:baseConfig?.branchPitch||.464}),config=configForLayout(seed,draft,baseConfig,makeDefault);onApply({seed,config,draft:structuredClone(draft)});$('layoutModal').close();}catch(e){$('ldStatus').textContent=e.message;notify(e.message,true);}};
 $('ldExport').onclick=()=>{if(pending){if(pending.points.length<2)return notify('Conclua ou cancele o ramal em andamento antes de salvar.');finish();}download('torfresma-layout.json',JSON.stringify({format:'torfresma-layout-v1',layout:draft},null,2));};
 $('ldImport').onclick=()=>$('ldFile').click();$('ldFile').onchange=async()=>{const file=$('ldFile').files[0];if(!file)return;try{if(file.size>5e6)throw Error('Use um arquivo de até 5 MB.');const data=JSON.parse(await file.text());if(data.format!=='torfresma-layout-v1'||!data.layout||!Array.isArray(data.layout.main)||!Array.isArray(data.layout.stations))throw Error('Arquivo de desenho inválido.');if(data.layout.stations.length>100||data.layout.main.length>600)throw Error('O desenho ultrapassa os limites do editor.');for(const p of [...data.layout.main,...data.layout.stations.flatMap(s=>s.points||[])])if(!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)))throw Error('Coordenadas inválidas no desenho.');const loaded=validateDraft(data.layout);checkpoint();draft=loaded;selection=null;zoneTarget='main';pending=null;fit();paint();}catch(e){notify(e.message,true);}$('ldFile').value='';};
 $('layoutModal').addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target?.tagName))return;if(e.key==='Enter'){e.preventDefault();finish();}if(e.key==='Delete'){e.preventDefault();remove();}if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();e.shiftKey?redo():undo();}});
 $('layoutModal').addEventListener('cancel',e=>{if(pending){e.preventDefault();pending=null;setTool('select');paint();}});
 return {open,resize:()=>{if($('layoutModal').open){fit();paint();}},getDraft:()=>structuredClone(draft),setTool,undo,redo};
}
