import {createStopRecovery,stopActive} from './stops.js?v=13';
import {initialPositions,insideZones,levelDistance,zoneCapacity} from './accumulations.js?v=13';

const DT = .1;
const EPS = 1e-7;

function advanceCadence(t,scheduled,period) {
 return (t-scheduled>DT+EPS?t:scheduled)+period;
}

function barrierLimit(position, limit, barriers, half) {
 for (const point of barriers) {
  const boundary = Math.max(half,point-half);
  if (position<=boundary+EPS) limit=Math.min(limit,boundary);
 }
 return limit;
}

export function runDualModel(input,c,seed,progress=()=>{}) {
 const steps=Math.round(c.durationHours*3600/DT), duration=steps*DT;
 const feedPeriod=60/c.inflow, mainHalf=c.mainPitch/2, branchHalf=c.branchPitch/2;
 const mainEnd=c.mainLength-mainHalf, mainMove=c.speed/60*DT, branchMove=c.branchSpeed/60*DT;
 let nextId=1;
 const groups=seed.trunks.map(route=>({route,queue:[],lines:[],sent:0,demand:0,credit:0,cursor:0,
  capacity:Math.floor((route.length+EPS)/c.branchPitch)}));
 const lines=c.stations.map((s,j)=>{
  const buffer=s.enabled?Math.floor(s.capacity*c.branchInitial/100):0;
  const lead=s.travelLength*60/c.branchSpeed+c.cycle;
  const exit=Math.min(groups[s.group].route.length-branchHalf,Math.max(branchHalf,s.junction));
  const line={...s,j,stock:buffer,initial:buffer,queue:[],reserved:0,expected:0,used:0,missed:0,received:0,sent:0,
   start:null,firstArrival:buffer?0:null,ready:0,nextDispatch:0,nextUse:Infinity,lead,exit,minObserved:buffer,maxObserved:buffer,
   reached:buffer>=s.maximum,call:false,gap:null,
   storage:Array.from({length:s.capacity},(_,i)=>s.travelLength-levelDistance(s.storageZones,i+.5,c.branchPitch))};
  if (s.enabled) {
   groups[s.group].lines.push(line);
   groups[s.group].demand+=s.rate;
  }
  return line;
 });
 const active=lines.filter(s=>s.enabled), activeIndices=active.map(s=>s.j);
 const inletCapacity=zoneCapacity(c.mainZones,c.mainPitch);
 const main=Array.from(initialPositions(c.mainZones,c.mainPitch,Math.floor(inletCapacity*c.mainInitial/100)));
 const mainIds=main.map(()=>nextId++);
 for(const group of groups){
  group.lines.sort((a,b)=>b.exit-a.exit);
  if(!group.lines.length)continue;
  const count=Math.floor(group.capacity*c.mainInitial/100);
  group.queue=Array.from({length:count},(_,i)=>({position:group.route.length-(i+.5)*c.branchPitch,id:nextId++}));
 }
 const groupInitial=groups.map(g=>g.queue.length);
 const mainCapacity=inletCapacity+groups.reduce((n,g)=>n+(g.lines.length?g.capacity:0),0);
 const transportStock=()=>main.length+groups.reduce((n,g)=>n+g.queue.length,0);
 const inletInitial=main.length, mainInitial=transportStock(), branchInitial=lines.reduce((sum,s)=>sum+s.initial,0);
 const totalDemand=active.reduce((sum,s)=>sum+s.rate,0);
 const supplyRatio=Math.min(1,c.inflow/totalDemand);
 let branchFillAt=active.every(s=>s.stock>=s.maximum)?0:null;
 const snapshots=[], telemetryRows=[], trend=[], shortageEvents=[], diversions=groups.map(()=>[]);
 const sampling=Math.max(30,Math.ceil(steps/1800)), trendSampling=Math.max(600,Math.ceil(steps/1440));
 const telemetryInterval=[5,10,30,60,120].find(s=>duration/s<=10000)??Math.ceil(duration/10000);
 const telemetryStep=Math.round(telemetryInterval/DT);
 const warm=Math.min(1800,duration/4);
 let admitted=0, nextFeed=0, nextSplit=0, allStart=null, filledAt=null, redirected=0, heldSeconds=0;
 let warmUsed=0, warmMissed=0, maxSimultaneous=0, outsideMax=0, outsideSeconds=0, outsideFirst=null;
 const rangeMin=Int32Array.from(lines,s=>s.stock),rangeMax=rangeMin.slice();
 const initialStock=()=>Int32Array.from(lines,s=>s.stock);
 const counts=()=>Uint32Array.from(lines,s=>s.missed);
 const storageCount=()=>main.reduce((sum,p)=>sum+Number(insideZones(p,c.mainZones)),0);
 const recovery=createStopRecovery(c.stops,lines,activeIndices,transportStock);
 function capture(t){
  return {t,main:transportStock(),admitted,groupSent:groups.map(g=>g.sent),stock:initialStock(),transit:Int32Array.from(lines,s=>s.queue.length),
   consumed:Uint32Array.from(lines,s=>s.used),missed:counts(),running:Uint8Array.from(lines,s=>s.start!==null?1:0)};
 }
 function record(t, snapshot, telemetry) {
  if (!snapshot&&!telemetry) return;
  const row=capture(t);
  if (snapshot) snapshots.push({...row,positions:Float32Array.from(main),positionIds:Uint32Array.from(mainIds),trunks:groups.map(g=>Float32Array.from(g.queue,b=>b.position)),
   trunkIds:groups.map(g=>Uint32Array.from(g.queue,b=>b.id)),
   branchPositions:lines.map(s=>Float32Array.from(s.queue,b=>b.position)),
   branchIds:lines.map(s=>Uint32Array.from(s.queue,b=>b.id)),
   active:Uint8Array.from(lines,s=>s.ready>t?1:0),calls:Uint8Array.from(lines,s=>s.call?1:0),filled:filledAt!==null});
  if (telemetry) {
   telemetryRows.push({...row,stockMin:rangeMin.slice(),stockMax:rangeMax.slice(),expected:Float64Array.from(lines,s=>s.expected)});
   rangeMin.set(row.stock);
   rangeMax.set(row.stock);
  }
 }
 function release(t){
  if (allStart!==null) return;
  const mainFull=storageCount()>=inletCapacity&&groups.every(g=>!g.lines.length||g.queue.length>=g.capacity);
  const everyoneFull=active.every(s=>s.stock>=s.maximum);
  for (const s of active) {
   if (s.start!==null) continue;
   const ready=c.startMode==='first'?s.stock>0:c.startMode==='individual'?s.stock>=s.maximum:mainFull&&(c.startMode==='main'||everyoneFull);
   if (ready){s.start=t;s.nextUse=c.startMode==='precharge'?t:t+60/s.rate;}
  }
  if (active.every(s=>s.start!==null)) allStart=t;
 }
 function prefillTarget(group,t){
  for(let offset=0;offset<group.lines.length;offset++){
   const i=(group.cursor+offset)%group.lines.length,s=group.lines[i];
   const arrival=t+s.exit*60/c.branchSpeed;
   if(s.stock+s.queue.length+s.reserved<s.maximum&&!transferStops[s.j].some(e=>stopActive(e,arrival)))return {station:s,index:i};
  }
  return null;
 }
 function canTake(s,t,starting,reservedFill){
  if(s.stock+s.queue.length>=s.capacity||s.ready>t+EPS)return false;
  if(reservedFill)return s.stock+s.queue.length+s.reserved<s.maximum;
  if(starting){
   const due=s.start===null?0:Math.max(0,1+Math.floor((t+s.lead-s.nextUse+EPS)/(60/s.rate)));
   return s.stock+s.queue.length-due<s.maximum;
  }
  // No FBRA, o sensor mínimo abre a chamada e o máximo encerra a reposição.
  if(s.stock>=s.maximum)s.call=false;
  else if(s.stock<=s.minimum)s.call=true;
  return s.call&&s.stock+s.queue.length<s.maximum&&
   ((c.control==='level'&&supplyRatio===1)||t+EPS>=s.nextDispatch);
 }
 function isFilled(){
  return c.startMode==='precharge'?allStart!==null:active.every(s=>s.reached);
 }
 release(0);
 if(isFilled())filledAt=0;
 record(0,true,true);
 const indexedStops=target=>lines.map(s=>c.stops.filter(e=>e.target===target&&e.line===s.j));
 const branchStops=indexedStops('branch'), transferStops=indexedStops('transfer');
 const mainStops=c.stops.filter(e=>e.target==='main');
 const trunkStops=groups.map((_,i)=>c.stops.filter(e=>e.target==='trunk'&&e.line===i));
 const points=(events,t)=>events.filter(e=>stopActive(e,t)).map(e=>e.position);
 function closeGap(s,t,openEnd=false){
  if (!s.gap) return;
  shortageEvents.push({...s.gap,end:t,openEnd});
  s.gap=null;
 }
 for (let k=1;k<=steps;k++){
  const t=k*DT;
  const stopBoundary=c.stops.length&&recovery.capture(t,transportStock(),initialStock(),counts());
  for (const s of active) {
   if (s.start!==null) s.expected+=s.rate*DT/60;
   if (t+EPS>=s.nextUse) {
    if (s.stock){
     s.stock--;
     s.used++;
     // Repõe a primeira retirada na passagem do pré-enchimento para a produção.
     if(c.startMode==='precharge'&&s.used===1)s.call=true;
    }
    else {
     s.gap??={line:s.j,start:t,cycles:0};
     s.gap.cycles++;
     s.missed++;
    }
    s.nextUse+=60/s.rate;
   }
   const queue=s.queue;
   if (!queue.length) continue;
   const barriers=branchStops[s.j].length?points(branchStops[s.j],t):[];
   let limit=s.storage[s.stock]??branchHalf, received=0;
   for (let i=0;i<queue.length;i++){
    const box=queue[i];
    const goal=s.storage[s.stock]??branchHalf;
    if (box.release<=t+EPS&&!barriers.some(p=>p<=EPS&&box.position<=branchHalf+EPS)){
     box.position=Math.max(box.position,Math.min(box.position+branchMove,barrierLimit(box.position,limit,barriers,branchHalf)));
     if (received===i&&s.stock<s.maximum&&box.position>=goal-EPS&&!barriers.some(p=>Math.abs(p-branchHalf-goal)<EPS)){
      s.stock++;s.received++;received++;
      maxStock(s,t);
      limit=s.storage[s.stock]??branchHalf;
      continue;
     }
    }
    limit=box.position-c.branchPitch;
   }
   if (received) queue.splice(0,received);
  }
  const justBranchesFull=branchFillAt===null&&active.every(s=>s.stock>=s.maximum);
  if(justBranchesFull)branchFillAt=t;
  const wasReleased=allStart!==null;
  release(t);
  const justReleased=!wasReleased&&allStart!==null;
  const justFilled=filledAt===null&&isFilled();
  if (justFilled) filledAt=t;
  const globalRelease=justReleased&&c.startMode==='precharge';
  if(globalRelease)record(t,true,false);
  const reservedFill=c.startMode==='precharge'&&allStart===null&&branchFillAt===null;
  for (let g=0;g<groups.length;g++){
   const group=groups[g], {queue,route}=group;
   const barriers=trunkStops[g].length?points(trunkStops[g],t):[];
   const available=c.startMode==='main'&&allStart===null?[]:group.lines.filter(s=>
    canTake(s,t,filledAt===null,reservedFill)&&!transferStops[s.j].some(e=>stopActive(e,t)));
   const end=route.length-branchHalf;
   let leader=route.length, kept=0, scan=0;
   for (const box of queue) {
    const old=box.position;
    while(scan<available.length&&available[scan].exit+branchHalf>=old-EPS)scan++;
    let next=scan-1;
    while(next>=0&&available[next].ready>t+EPS)next--;
    // A reserva da partida atravessa os primeiros ramais até a transferência escolhida.
    if(box.destination&&old+branchMove>=box.destination.exit-branchHalf-EPS&&
       transferStops[box.destination.j].some(e=>stopActive(e,t))){
     box.destination.reserved--;
     box.destination=null;
    }
    const station=box.destination??available[next];
    const exit=station?.exit??end;
    const limit=barrierLimit(old,Math.min(exit,leader),barriers,branchHalf);
    box.position=Math.max(old,Math.min(old+branchMove,limit));
    const canTransfer=station&&(box.destination?
     station.ready<=t+EPS&&station.stock+station.queue.length<station.maximum&&
     !transferStops[station.j].some(e=>stopActive(e,t)):true);
    if (canTransfer&&Math.abs(box.position-exit)<=branchHalf+EPS&&!barriers.some(p=>{
     const boundary=Math.max(branchHalf,p-branchHalf);
     return old<=boundary+EPS&&exit>=boundary-EPS;
    })) {
     station.ready=t+c.cycle;
     station.queue.push({position:branchHalf,release:station.ready,id:box.id});
     station.sent++;
     if(box.destination)station.reserved--;
     if(filledAt!==null){
      const factor=supplyRatio<1?supplyRatio:1+c.recovery/100;
      station.nextDispatch=advanceCadence(t,station.nextDispatch,60/(station.rate*factor));
     }
    }else{
     queue[kept++]=box;
     leader=box.position-c.branchPitch;
    }
   }
   queue.length=kept;
  }
  const mainBarriers=mainStops.length?points(mainStops,t):[];
  let limit=mainEnd, outside=0;
  for (let i=0;i<main.length;i++) {
   const old=main[i];
   main[i]=Math.max(old,Math.min(old+mainMove,barrierLimit(old,limit,mainBarriers,mainHalf)));
   limit=main[i]-c.mainPitch;
   if(main[i]-old<mainMove*.1&&!insideZones(main[i],c.mainZones)) outside++;
  }
  if(outside){outsideMax=Math.max(outsideMax,outside);outsideSeconds+=outside*DT;outsideFirst??=t;}
  if (t+EPS>=nextSplit&&main[0]>=mainEnd-EPS&&!mainBarriers.some(p=>p>=c.mainLength-EPS)) {
   const targets=reservedFill?groups.map(group=>prefillTarget(group,t)):[];
   const ready=groups.map((group,g)=>{
    const tail=group.queue.at(-1);
    return group.lines.length>0&&group.queue.length<group.capacity&&
     (!tail||tail.position>=branchHalf+c.branchPitch-EPS)&&
     !trunkStops[g].some(e=>e.position<=EPS&&stopActive(e,t));
   });
   const entitled=groups.map(g=>g.credit+g.demand/totalDemand);
   const desired=Number(entitled[1]>entitled[0]);
   const chosen=ready[desired]?desired:1-desired;
   if (ready[chosen]) {
    const group=groups[chosen];
    // As caixas sem destino reservado continuam pelo transportador e completam a reserva.
    const target=targets[chosen];
    group.queue.push({position:branchHalf,id:mainIds.shift(),destination:target?.station});
    if(target){
     target.station.reserved++;
     group.cursor=(target.index+1)%group.lines.length;
    }
    group.sent++;
    diversions[chosen].push(t);
    main.shift();
    nextSplit=advanceCadence(t,nextSplit,feedPeriod);
    if (chosen!==desired&&groups[desired].lines.length) redirected++;
    groups.forEach((g,i)=>{g.credit=Math.max(-1,Math.min(1,entitled[i]-Number(i===chosen)));});
   }else heldSeconds+=DT;
  }
  if (t+EPS>=nextFeed&&!mainBarriers.some(p=>p<=EPS)&&(!main.length||main.at(-1)>=mainHalf+c.mainPitch-EPS)) {
   main.push(mainHalf);
   mainIds.push(nextId++);
   admitted++;
   nextFeed=advanceCadence(t,nextFeed,feedPeriod);
  }
  if (t-DT<warm&&t>=warm){warmUsed=active.reduce((sum,s)=>sum+s.used,0);warmMissed=active.reduce((sum,s)=>sum+s.missed,0);}
  maxSimultaneous=Math.max(maxSimultaneous,active.reduce((n,s)=>n+Number(s.ready>t),0));
  for(const s of active){
   rangeMin[s.j]=Math.min(rangeMin[s.j],s.stock);rangeMax[s.j]=Math.max(rangeMax[s.j],s.stock);
   s.minObserved=Math.min(s.minObserved,s.stock);
   s.maxObserved=Math.max(s.maxObserved,s.stock);
  }
  const previewDetail=k%10===0&&(t<=60||(allStart!==null&&t-allStart<=180));
  record(t,!globalRelease&&(justBranchesFull||justFilled||justReleased||stopBoundary||previewDetail||k%sampling===0||k===steps),k%telemetryStep===0||k===steps);
  if(k%trendSampling===0||k===steps)trend.push({t,main:transportStock(),stock:lines.reduce((a,s)=>a+s.stock,0),consumed:lines.reduce((a,s)=>a+s.used,0),missed:lines.reduce((a,s)=>a+s.missed,0),admitted});
  if(k%20000===0)progress(k/steps);
 }
 function maxStock(s,t){
  s.firstArrival??=t;
  if(s.stock>=s.maximum)s.reached=true;
  closeGap(s,t);
 }
 for(const s of active)closeGap(s,duration,true);
 shortageEvents.sort((a,b)=>a.start-b.start||a.line-b.line);
 const consumed=lines.reduce((a,s)=>a+s.used,0),missed=lines.reduce((a,s)=>a+s.missed,0),branchEnd=lines.reduce((a,s)=>a+s.stock,0);
 if(inletInitial+admitted!==main.length+groups.reduce((n,g)=>n+g.sent,0)||
  groups.some((g,i)=>g.sent+groupInitial[i]!==g.queue.length+g.lines.reduce((n,s)=>n+s.sent,0))||
  branchInitial+mainInitial+admitted!==consumed+branchEnd+transportStock()+lines.reduce((n,s)=>n+s.queue.length,0)||
  lines.some(s=>s.initial+s.sent!==s.stock+s.used+s.queue.length)) throw Error('Divergência na conservação da quantidade de caixas.');
 const results=lines.map((s,j)=>({...c.stations[j],firstArrival:s.firstArrival,start:s.start,consumed:s.used,missed:s.missed,
  minObserved:s.minObserved,maxObserved:s.maxObserved,stockEnd:s.stock,transferred:s.sent}));
 return {config:input,duration,warm,demand:totalDemand,consumed,missed,allStart,filledAt,branchFillAt,
  groupSent:groups.map(g=>g.sent),diversions:diversions.map(times=>Float64Array.from(times)),redirected,heldSeconds,rateMeasured:(consumed-warmUsed)/((duration-warm)/60),missedSteady:missed-warmMissed,
  admitted,mainInitial,mainEnd:transportStock(),mainCapacity,inletCapacity,trunkCapacity:groups.map(g=>g.lines.length?g.capacity:0),branchInitial,branchEnd,lines:results,
  mainZones:c.mainZones,outsideAccumMax:outsideMax,outsideBoxSeconds:outsideSeconds,outsideFirst,
  snapshots,trend,sampleInterval:sampling*DT,maxSimultaneous,minimumCycle:c.cycle,telemetry:{interval:telemetryInterval,rows:telemetryRows},
  stops:c.stops,stopResults:recovery.finish(duration,counts()),shortageEvents,conservation:true};
}
