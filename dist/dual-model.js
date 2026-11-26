import {createStopRecovery,stopActive} from './stops.js?v=8';
import {initialPositions,insideZones,levelDistance,zoneCapacity} from './accumulations.js?v=8';

const DT = .1;
const EPS = 1e-7;

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
 const groups=seed.trunks.map(route=>({route,queue:[],lines:[],sent:0}));
 const lines=c.stations.map((s,j)=>{
  const buffer=s.enabled?Math.floor(s.capacity*c.branchInitial/100):0;
  const lead=(s.junction+s.travelLength)*60/c.branchSpeed+c.cycle;
  const line={...s,j,stock:buffer,initial:buffer,queue:[],reserved:0,expected:0,used:0,missed:0,received:0,sent:0,
   start:null,firstArrival:buffer?0:null,ready:0,nextDispatch:0,nextUse:Infinity,lead,minObserved:buffer,maxObserved:buffer,
   reached:buffer>=s.maximum,call:false,gap:null,
   storage:Array.from({length:s.capacity},(_,i)=>s.travelLength-levelDistance(s.storageZones,i+.5,c.branchPitch))};
  if (s.enabled) groups[s.group].lines.push(line);
  return line;
 });
 const active=lines.filter(s=>s.enabled), activeIndices=active.map(s=>s.j);
 const mainCapacity=zoneCapacity(c.mainZones,c.mainPitch);
 const main=Array.from(initialPositions(c.mainZones,c.mainPitch,Math.floor(mainCapacity*c.mainInitial/100)));
 const mainInitial=main.length, branchInitial=lines.reduce((sum,s)=>sum+s.initial,0);
 const snapshots=[], telemetryRows=[], trend=[], shortageEvents=[];
 const sampling=Math.max(30,Math.ceil(steps/1800)), trendSampling=Math.max(600,Math.ceil(steps/1440));
 const telemetryInterval=[5,10,30,60,120].find(s=>duration/s<=10000)??Math.ceil(duration/10000);
 const telemetryStep=Math.round(telemetryInterval/DT);
 const warm=Math.min(1800,duration/4);
 let admitted=0, preferred=0, nextFeed=0, allStart=null, filledAt=null, redirected=0, heldSeconds=0;
 let warmUsed=0, warmMissed=0, maxSimultaneous=0, outsideMax=0, outsideSeconds=0, outsideFirst=null;
 const rangeMin=Int32Array.from(lines,s=>s.stock),rangeMax=rangeMin.slice();
 const initialStock=()=>Int32Array.from(lines,s=>s.stock);
 const counts=()=>Uint32Array.from(lines,s=>s.missed);
 const storageCount=()=>main.reduce((sum,p)=>sum+Number(insideZones(p,c.mainZones)),0);
 const recovery=createStopRecovery(c.stops,lines,activeIndices,storageCount);
 function capture(t){
  return {t,main:main.length,admitted,stock:initialStock(),transit:Int32Array.from(lines,s=>s.queue.length+s.reserved),
   consumed:Uint32Array.from(lines,s=>s.used),missed:counts(),running:Uint8Array.from(lines,s=>s.start!==null?1:0)};
 }
 function record(t, snapshot, telemetry) {
  if (!snapshot&&!telemetry) return;
  const row=capture(t);
  if (snapshot) snapshots.push({...row,positions:Float32Array.from(main),trunks:groups.map(g=>Float32Array.from(g.queue,b=>b.position)),
   branchPositions:lines.map(s=>Float32Array.from(s.queue,b=>b.position)),
   active:Uint8Array.from(lines,s=>s.ready>t?1:0),calls:Uint8Array.from(lines,s=>s.call?1:0),filled:filledAt!==null});
  if (telemetry) {
   telemetryRows.push({...row,stockMin:rangeMin.slice(),stockMax:rangeMax.slice(),expected:Float64Array.from(lines,s=>s.expected)});
   rangeMin.set(row.stock);
   rangeMax.set(row.stock);
  }
 }
 function release(t){
  if (allStart!==null) return;
  const mainFull=storageCount()>=mainCapacity*.99;
  const everyoneFull=active.every(s=>s.stock>=s.maximum);
  for (const s of active) {
   if (s.start!==null) continue;
   const ready=c.startMode==='first'?s.stock>0:c.startMode==='individual'?s.stock>=s.maximum:mainFull&&(c.startMode==='main'||everyoneFull);
   if (ready){s.start=t;s.nextUse=t+60/s.rate;}
  }
  if (active.every(s=>s.start!==null)) allStart=t;
 }
 function candidate(group,t,starting){
  const tail=group.queue.at(-1);
  let line=null, priority=Infinity;
  for (const s of group.lines) {
   const stock=s.stock+s.queue.length+s.reserved;
   const leadDemand=s.start===null?0:s.lead*s.rate/60;
   const projected=stock-leadDemand;
   if (!starting) {
    if (s.call&&projected>=s.maximum) s.call=false;
    if (!s.call&&projected<=s.minimum) s.call=true;
    if (!s.call||t+EPS<s.nextDispatch) continue;
   }
   const limit=s.maximum+Math.ceil(leadDemand);
   if (stock>=limit) continue;
   const urgency=(projected-(starting?s.maximum:s.minimum))*60/s.rate;
   if (urgency<priority){line=s;priority=urgency;}
  }
  return {line,priority,open:!!line&&(!tail||tail.position>=branchHalf+c.branchPitch-EPS)};
 }
 release(0);
 if (active.every(s=>s.reached)) filledAt=0;
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
  const stopBoundary=c.stops.length&&recovery.capture(t,main.length,initialStock(),counts());
  for (const s of active) {
   if (s.start!==null) s.expected+=s.rate*DT/60;
   if (t+EPS>=s.nextUse) {
    if (s.stock){s.stock--;s.used++;}
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
  release(t);
  const justFilled=filledAt===null&&active.every(s=>s.reached);
  if (justFilled) filledAt=t;
  for (let g=0;g<groups.length;g++){
   const {queue,route}=groups[g], barriers=trunkStops[g].length?points(trunkStops[g],t):[];
   let leader=route.length, kept=0;
   for (const box of queue) {
    const s=box.line;
    const exit=Math.min(route.length-branchHalf,Math.max(branchHalf,s.junction));
    const limit=barrierLimit(box.position,Math.min(exit,leader),barriers,branchHalf);
    box.position=Math.max(box.position,Math.min(box.position+branchMove,limit));
    const room=s.stock+s.queue.length<s.maximum;
    if (box.position>=exit-EPS&&room&&t+EPS>=s.ready&&!transferStops[s.j].some(e=>stopActive(e,t))&&
        !barriers.some(p=>Math.abs(Math.max(branchHalf,p-branchHalf)-exit)<EPS)) {
     s.ready=t+c.cycle;
     s.queue.push({position:branchHalf,release:s.ready});
     s.reserved--;
     s.sent++;
    }else{queue[kept++]=box;leader=box.position-c.branchPitch;}
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
  if (main[0]>=mainEnd-EPS&&(c.startMode!=='main'||allStart!==null)&&!mainBarriers.some(p=>p>=c.mainLength-EPS)) {
   const starting=filledAt===null;
   const options=groups.map(g=>candidate(g,t,starting));
   // A stop at zero metres blocks admission into that distribution route.
   for(let g=0;g<groups.length;g++) if(trunkStops[g].some(e=>e.position<=EPS&&stopActive(e,t))) options[g].open=false;
   const desired=starting?preferred:Number(options[1].priority<options[0].priority);
   const chosen=options[desired].open?desired:1-desired;
   if (options[chosen].open) {
    const group=groups[chosen],line=options[chosen].line;
    group.queue.push({position:branchHalf,line});
    group.sent++;
    line.reserved++;
    if (!starting&&c.control==='paced') line.nextDispatch=t+60/(line.rate*(1+c.recovery/100));
    if (chosen!==desired) redirected++;
    preferred=1-chosen;
    main.shift();
   } else heldSeconds+=DT;
  }
  if (t+EPS>=nextFeed&&!mainBarriers.some(p=>p<=EPS)&&(!main.length||main.at(-1)>=mainHalf+c.mainPitch-EPS)) {
   main.push(mainHalf);admitted++;
   nextFeed=(t-nextFeed>DT+EPS?t:nextFeed)+feedPeriod;
  }
  if (t-DT<warm&&t>=warm){warmUsed=active.reduce((sum,s)=>sum+s.used,0);warmMissed=active.reduce((sum,s)=>sum+s.missed,0);}
  maxSimultaneous=Math.max(maxSimultaneous,active.reduce((n,s)=>n+Number(s.ready>t),0));
  for(const s of active){
   rangeMin[s.j]=Math.min(rangeMin[s.j],s.stock);rangeMax[s.j]=Math.max(rangeMax[s.j],s.stock);
   s.minObserved=Math.min(s.minObserved,s.stock);
   s.maxObserved=Math.max(s.maxObserved,s.stock);
  }
  record(t,justFilled||stopBoundary||k%sampling===0||k===steps,k%telemetryStep===0||k===steps);
  if(k%trendSampling===0||k===steps)trend.push({t,main:main.length,stock:lines.reduce((a,s)=>a+s.stock,0),consumed:lines.reduce((a,s)=>a+s.used,0),missed:lines.reduce((a,s)=>a+s.missed,0),admitted});
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
 if(mainInitial+admitted!==main.length+groups.reduce((n,g)=>n+g.sent,0)||
  branchInitial+mainInitial+admitted!==consumed+branchEnd+main.length+groups.reduce((n,g)=>n+g.queue.length,0)+lines.reduce((n,s)=>n+s.queue.length,0)||
  lines.some(s=>s.initial+s.sent!==s.stock+s.used+s.queue.length)) throw Error('Divergência na conservação da quantidade de caixas.');
 const results=lines.map((s,j)=>({...c.stations[j],firstArrival:s.firstArrival,start:s.start,consumed:s.used,missed:s.missed,
  minObserved:s.minObserved,maxObserved:s.maxObserved,stockEnd:s.stock,transferred:s.sent}));
 return {config:input,duration,warm,demand:active.reduce((a,s)=>a+s.rate,0),consumed,missed,allStart,filledAt,
  groupSent:groups.map(g=>g.sent),redirected,heldSeconds,rateMeasured:(consumed-warmUsed)/((duration-warm)/60),missedSteady:missed-warmMissed,
  admitted,mainInitial,mainEnd:main.length,mainCapacity,branchInitial,branchEnd,lines:results,
  mainZones:c.mainZones,outsideAccumMax:outsideMax,outsideBoxSeconds:outsideSeconds,outsideFirst,
  snapshots,trend,sampleInterval:sampling*DT,maxSimultaneous,minimumCycle:c.cycle,telemetry:{interval:telemetryInterval,rows:telemetryRows},
  stops:c.stops,stopResults:recovery.finish(duration,counts()),shortageEvents,conservation:true};
}
