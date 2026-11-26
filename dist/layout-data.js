import {normalizeZones} from './accumulations.js?v=14';
export const id=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
export function lengths(points){const d=[0];for(let i=1;i<points.length;i++)d.push(d[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));return d;}
export function projectPoint(points,p){
 if(points.length<2)throw Error('Desenhe primeiro uma principal com pelo menos dois pontos.');
 const d=lengths(points);let best={distance:Infinity};
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;if(den<1e-12)continue;const u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)),q=[a[0]+u*dx,a[1]+u*dy],distance=Math.hypot(q[0]-p[0],q[1]-p[1]);if(distance<best.distance)best={point:q,distance,segment:i,u,s:d[i]+u*Math.sqrt(den)};}
 if(!best.point)throw Error('O trajeto precisa de pontos distintos.');return best;
}
export function emptyLayout(){return {version:1,id:id(),name:'Meu layout',main:[],stations:[],mainZones:undefined};}
export function layoutFromSeed(seed,config){
 const factor=config.mainLength/seed.length,scale=seed.scale;
 return {version:1,id:id(),name:seed.name||config.name||'Layout FBRA',main:seed.path.map(p=>p.map(v=>v*scale*factor)),mainZones:structuredClone(config.accumulations?.main),
  stations:config.stations.map((s,j)=>{
   if(j===10&&config.alternative==='E18'&&Number.isFinite(seed.e18_s)&&!s.branch)s={...s,...config.e18Station,branch:seed.e18_branch};
   const base=s.branch?s:seed.stations[j],anchor=base.branch[0].map(v=>v*scale*factor),points=base.branch.map(p=>p.map((v,k)=>anchor[k]+(v-base.branch[0][k])*scale));
   return {id:base.id||id(),name:s.name||base.name,rate:s.rate,enabled:s.enabled!==false,points,usableLength:s.length,autoLength:false,
    zones:structuredClone(s.storageZones?.length===1&&s.storageZones[0].start===0&&Math.abs(s.storageZones[0].end-s.length)<1e-7?undefined:s.storageZones??config.accumulations?.branches?.[String(j)])};
  })};
}
function validatePoints(points,label){
 if(!Array.isArray(points)||points.length<2||points.length>600)throw Error(label+': use de 2 a 600 pontos.');
 for(let i=0;i<points.length;i++){if(!Array.isArray(points[i])||points[i].length!==2||points[i].some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error(label+': coordenadas inválidas.');if(i&&Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<.01)throw Error(label+': existem pontos consecutivos sobrepostos.');}
}
export function compileLayout(draft,{branchPitch=.464,mainPitch=.29}={}){
 validatePoints(draft.main,'Principal');const cum=lengths(draft.main),length=cum.at(-1);
 if(length<1||length>10000)throw Error('A principal deve ter entre 1 e 10.000 m.');
 if(!Array.isArray(draft.stations)||!draft.stations.length||draft.stations.length>100)throw Error('Adicione de 1 a 100 linhas ao layout.');
 const names=new Set(),stations=draft.stations.map((s,j)=>{
  const name=String(s.name||'').trim();if(!name)throw Error('Informe o nome da linha '+(j+1)+'.');if(names.has(name.toLocaleLowerCase()))throw Error('Use nomes distintos para as linhas: '+name+'.');names.add(name.toLocaleLowerCase());
  validatePoints(s.points,name);const hit=projectPoint(draft.main,s.points[0]),delta=[hit.point[0]-s.points[0][0],hit.point[1]-s.points[0][1]],branch=s.points.map(p=>p.map((v,k)=>v+delta[k]));
  if(hit.s<.5||hit.s>length-.5)throw Error(name+': afaste a ligação pelo menos 0,5 m das extremidades da principal.');
  const travel_length=lengths(branch).at(-1),usable=s.autoLength?travel_length:Number(s.usableLength);
  if(!Number.isFinite(usable)||usable<branchPitch*2-.000001||usable>travel_length+.001)throw Error(name+': o acúmulo útil deve comportar duas caixas e não ultrapassar o percurso de '+travel_length.toFixed(3)+' m.');
  const zones=normalizeZones(s.zones,usable,name),capacity=zones.reduce((a,z)=>a+Math.floor((z.end-z.start+1e-9)/branchPitch),0);
  if(capacity<2)throw Error(name+': os trechos de acúmulo devem comportar pelo menos duas caixas.');
  const rate=Number(s.rate);if(!Number.isFinite(rate)||rate<0||rate>300)throw Error(name+': consumo entre 0 e 300 cx/min.');
  return {id:s.id||id(),name,rate,enabled:s.enabled!==false,s:hit.s,xy:hit.point,branch,length:usable,u_width:0,travel_length,useGeometryTravel:true,capacity,minimum:1,maximum:Math.min(2,capacity)};
 });
 const ordered=[...stations].sort((a,b)=>a.s-b.s);for(let i=1;i<ordered.length;i++)if(ordered[i].s-ordered[i-1].s<mainPitch+.02)throw Error('Separe as ligações de '+ordered[i-1].name+' e '+ordered[i].name+' em pelo menos '+(mainPitch+.02).toFixed(2)+' m.');
 normalizeZones(draft.mainZones,length,'Principal');
 return {id:draft.id||id(),name:String(draft.name||'Meu layout'),custom:true,supportsAlternative:false,scale:1,path:structuredClone(draft.main),cum,length,stations};
}
export function configForLayout(seed,draft,config,makeDefault){
 const defaults=makeDefault(seed),next={...defaults,...structuredClone(config),name:draft.name,mainLength:seed.length,alternative:'none',stations:defaults.stations,accumulations:{branches:{}}};
 next.stations.forEach((s,j)=>{s.enabled=draft.stations[j].enabled!==false;s.auto=true;if(draft.stations[j].zones!==undefined)next.accumulations.branches[String(j)]=structuredClone(draft.stations[j].zones);});
 next.stops=[];next.e18Station=null;if(draft.mainZones!==undefined)next.accumulations.main=structuredClone(draft.mainZones);return next;
}
export function moveMainPoint(draft,index,point){
 if((index>0&&Math.hypot(point[0]-draft.main[index-1][0],point[1]-draft.main[index-1][1])<.01)||(index<draft.main.length-1&&Math.hypot(point[0]-draft.main[index+1][0],point[1]-draft.main[index+1][1])<.01))throw Error('Não sobreponha pontos consecutivos.');
 const links=draft.stations.map(s=>projectPoint(draft.main,s.points[0]));draft.main[index]=[...point];
 draft.stations.forEach((s,j)=>{const hit=links[j],a=draft.main[hit.segment],b=draft.main[hit.segment+1],p=[a[0]+hit.u*(b[0]-a[0]),a[1]+hit.u*(b[1]-a[1])],delta=[p[0]-s.points[0][0],p[1]-s.points[0][1]];s.points=s.points.map(q=>q.map((v,k)=>v+delta[k]));});
}
export function moveBranchPoint(draft,line,index,point){
 const points=draft.stations[line].points;if(index>0&&((Math.hypot(point[0]-points[index-1][0],point[1]-points[index-1][1])<.01)||(index<points.length-1&&Math.hypot(point[0]-points[index+1][0],point[1]-points[index+1][1])<.01)))throw Error('Não sobreponha pontos consecutivos.');
 const s=draft.stations[line];if(index===0){const hit=projectPoint(draft.main,point),delta=[hit.point[0]-s.points[0][0],hit.point[1]-s.points[0][1]];s.points=s.points.map(p=>p.map((v,k)=>v+delta[k]));}else s.points[index]=[...point];
 if(s.autoLength)s.usableLength=lengths(s.points).at(-1);
}
export function reconnectBranches(draft){for(const s of draft.stations){const hit=projectPoint(draft.main,s.points[0]),delta=[hit.point[0]-s.points[0][0],hit.point[1]-s.points[0][1]];s.points=s.points.map(p=>p.map((v,k)=>v+delta[k]));}}
export function layoutBounds(seed){const p=[...seed.path,...(seed.trunks||[]).flatMap(route=>route.points),...(seed.e18_branch||[]),...seed.stations.flatMap(s=>s.branch)];return {minX:Math.min(...p.map(q=>q[0])),maxX:Math.max(...p.map(q=>q[0])),minY:Math.min(...p.map(q=>q[1])),maxY:Math.max(...p.map(q=>q[1]))};}
export function validateLayoutSeed(seed){
 if(!seed||!Number.isFinite(seed.scale)||seed.scale<=0||!Array.isArray(seed.stations)||!seed.stations.length||seed.stations.length>100)throw Error('Layout inválido.');
 validatePoints(seed.path,'Principal');const cum=lengths(seed.path).map(v=>v*seed.scale);
 if(!Array.isArray(seed.cum)||seed.cum.length!==cum.length||cum.some((v,i)=>Math.abs(v-seed.cum[i])>1e-5)||Math.abs(cum.at(-1)-seed.length)>1e-5)throw Error('As distâncias do layout não correspondem ao traçado.');
 for(const s of seed.stations){validatePoints(s.branch,s.name||'Ramal');if(!Number.isFinite(s.s)||s.s<0||s.s>seed.length)throw Error('Ligação inválida de um ramal.');}
 return seed;
}
export function validateDraft(draft){
 if(!draft||!Array.isArray(draft.main)||!Array.isArray(draft.stations)||draft.main.length>600||draft.stations.length>100)throw Error('Arquivo de desenho inválido.');
 if(draft.stations.some(s=>!s||!Array.isArray(s.points)||s.points.length<2))throw Error('Cada ramal salvo precisa de pelo menos dois pontos.');
 for(const points of [draft.main,...draft.stations.map(s=>s.points)]){
  if(!Array.isArray(points)||points.length>600)throw Error('Trajeto inválido.');
  for(let i=0;i<points.length;i++)if(!Array.isArray(points[i])||points[i].length!==2||points[i].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||i&&Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])<.01)throw Error('O desenho contém coordenadas inválidas ou pontos sobrepostos.');
 }
 return draft;
}
