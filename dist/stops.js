// Scheduled faults use elapsed production time, including the initial preload.
export function parseStopTime(value){
 const match=/^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(String(value).trim());
 if(!match)throw Error('Informe o tempo como HH:MM:SS, por exemplo 04:30:00.');
 return +match[1]*3600+ +match[2]*60+ +match[3];
}
export function normalizeStops(raw,c,stations,trunks){
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.length>100)throw Error('Use até 100 paradas programadas.');
 const ids=new Set();
 return raw.map((s,i)=>{
  if(!s||!['main','branch','transfer','trunk'].includes(s.target))throw Error('Escolha o local da parada '+(i+1)+'.');
  const q={id:String(s.id??'stop-'+i),name:String(s.name||'Parada '+(i+1)),target:s.target,line:Number(s.line??-1),position:Number(s.position??0),start:Number(s.start),duration:Number(s.duration)};
  if(ids.has(q.id))throw Error('Identificadores de paradas duplicados.');ids.add(q.id);
  if(!Number.isFinite(q.start)||q.start<0||q.start>=c.durationHours*3600)throw Error(q.name+': o início precisa estar dentro do período simulado.');
  if(!Number.isFinite(q.duration)||q.duration<.1||q.duration>168*3600)throw Error(q.name+': informe uma duração de 0,1 s a 168 h.');
  if(q.target==='trunk'&&!trunks?.[q.line])throw Error(q.name+': ramal de distribuição inválido.');
  if((q.target==='branch'||q.target==='transfer')&&(!Number.isInteger(q.line)||q.line<0||q.line>=stations.length))throw Error(q.name+': linha inválida.');
  const limit=q.target==='main'?c.mainLength:q.target==='branch'?stations[q.line].travelLength:q.target==='trunk'?trunks[q.line].length:0;
  if(!Number.isFinite(q.position)||q.position<0||q.position>limit+1e-8)throw Error(q.name+': a posição precisa estar entre 0 e '+limit.toFixed(3)+' m.');
  q.end=q.start+q.duration;return q;
 }).sort((a,b)=>a.start-b.start);
}
export const stopActive=(s,t)=>t+1e-8>=s.start&&t<s.end-1e-8;
// A branch stores inventory as a finite aggregate. Travel events keep their order
// at stopped points; downstream boxes continue and upstream boxes queue in transit.
export function branchArrivalPlanner(stops,stations,pitch,speed){
 const byLine=stations.map((s,j)=>{
  const groups=new Map();for(const e of stops.filter(e=>e.target==='branch'&&e.line===j)){
   const key=String(e.position);if(!groups.has(key))groups.set(key,{position:e.position,windows:[],next:-Infinity});groups.get(key).windows.push(e);
  }return [...groups.values()].sort((a,b)=>a.position-b.position);
 });
 const velocity=speed/60;
 return (line,departure)=>{
  let time=departure,distance=0;
  for(const gate of byLine[line]){
   time+=(gate.position-distance)/velocity;time=Math.max(time,gate.next);
   // Overlapping and consecutive outages behave as their union.
   for(const e of gate.windows)if(stopActive(e,time))time=e.end;
   gate.next=time+pitch/velocity;distance=gate.position;
  }
  return time+(stations[line].travelLength-distance)/velocity;
 };
}
export function createStopRecovery(stops,stations,active,countMain){
 const records=stops.map(s=>({...s,started:false,ended:false,referenceMain:null,mainRecoveredAt:null,lines:[],recoveredAt:null,missed:null}));
 function capture(t,n,stock,missed){
  let changed=false;
  for(const r of records){
   if(!r.started&&t+1e-8>=r.start){
    changed=true;r.started=true;r.referenceMain=r.target==='main'?countMain(n):null;
    r.lines=(r.target==='main'?active:active.filter(j=>r.target==='trunk'?stations[j].group===r.line:j===r.line)).map(j=>({line:j,name:stations[j].name,reference:stock[j],minimum:stock[j],atEnd:null,recoveredAt:null,missedBefore:missed[j],missed:null}));
   }
   if(!r.started||r.recoveredAt!==null)continue;
   for(const x of r.lines)x.minimum=Math.min(x.minimum,stock[x.line]);
   if(t+1e-8<r.end)continue;
   if(!r.ended){changed=true;r.ended=true;for(const x of r.lines)x.atEnd=stock[x.line];}
   if(r.referenceMain!==null&&r.mainRecoveredAt===null&&countMain(n)>=r.referenceMain)r.mainRecoveredAt=t;
   for(const x of r.lines)if(x.recoveredAt===null&&stock[x.line]>=x.reference){x.recoveredAt=t;x.missed=missed[x.line]-x.missedBefore;}
   if((r.referenceMain===null||r.mainRecoveredAt!==null)&&r.lines.every(x=>x.recoveredAt!==null)){
    changed=true;r.recoveredAt=t;r.missed=r.lines.reduce((a,x)=>a+missed[x.line]-x.missedBefore,0);
   }
  }
  return changed;
 }
 function finish(T,missed){for(const r of records){if(!r.started)continue;if(r.missed===null)r.missed=r.lines.reduce((a,x)=>a+missed[x.line]-x.missedBefore,0);for(const x of r.lines){if(x.missed===null)x.missed=missed[x.line]-x.missedBefore;}r.recoverySeconds=r.recoveredAt===null?null:Math.max(0,r.recoveredAt-r.end);r.observedUntil=r.recoveredAt??T;}return records;}
 return {capture,finish};
}
