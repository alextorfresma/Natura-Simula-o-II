import {runDualModel} from './dual-model.js?v=13';
import {normalizeStops,stopActive,branchArrivalPlanner,createStopRecovery} from './stops.js?v=13';
import {normalizeZones,zoneCapacity,insideZones,levelDistance,initialPositions} from './accumulations.js?v=13';
export function supportsAlternative(seed){return seed.supportsAlternative!==false&&seed.stations.length>10&&Number.isFinite(seed.e18_s);}
export function defaultConfig(seed) {
 const stations=seed.stations.map(s=>({name:s.name,rate:s.rate,length:s.length,uWidth:s.u_width,enabled:s.enabled!==false,auto:true,minimum:s.minimum,maximum:s.maximum}));
 return {name:'Cenário de referência',durationHours:8,speed:60,branchSpeed:60,inflow:90,cycle:3,
  mainPitch:.290,branchPitch:.464,mainLength:seed.length,mainInitial:0,branchInitial:0,
  startMode:'precharge',control:'paced',recovery:5,waitMargin:60,alternative:supportsAlternative(seed)?'G22':'none',
  stations,stops:[],e18Station:supportsAlternative(seed)?{...stations[10],name:'E18 (alternativa a G22)',length:seed.e18Station?.length??4.112,uWidth:0}:null};
}
function stationsHaveInvalidGroups(seed){
 return seed.stations.some(s=>![0,1].includes(s.group)||!Number.isFinite(s.junction))||
 seed.trunks.some(route=>!Array.isArray(route.points)||route.points.length<2||!Number.isFinite(route.length)||route.length<=0);
}
export function prepare(config,seed) {
 const c=structuredClone(config);
 const keys=['durationHours','speed','branchSpeed','inflow','cycle','mainPitch','branchPitch','mainLength'];
 for(const k of keys){c[k]=Number(c[k]);if(!Number.isFinite(c[k])||c[k]<=0)throw Error('Informe um valor positivo para '+k+'.');}
 for(const k of ['mainInitial','branchInitial','recovery','waitMargin']){c[k]=Number(c[k]);if(!Number.isFinite(c[k])||c[k]<0)throw Error('Parâmetro inválido: '+k+'.');}
 if(!Array.isArray(c.stations)||c.stations.length!==seed.stations.length)throw Error('A configuração deve conter as '+seed.stations.length+' linhas deste layout.');
 if(c.durationHours>168||c.durationHours<1/60)throw Error('Escolha uma duração entre 1 minuto e 168 horas.');
 if(seed.dual&&c.mainLength<c.mainPitch)throw Error('A principal precisa comportar pelo menos uma caixa.');
 if(seed.dual&&(!Array.isArray(seed.trunks)||seed.trunks.length!==2||stationsHaveInvalidGroups(seed)))throw Error('O Layout 03 precisa de dois ramais de distribuição válidos.');
 if(c.cycle<.2)throw Error('O ciclo mínimo deste modelo é 0,2 s.');
 if(c.inflow>500)throw Error('A alimentação máxima deste modelo é 500 cx/min.');
 if(c.mainInitial<0||c.mainInitial>100||c.branchInitial<0||c.branchInitial>100)throw Error('O estoque inicial precisa estar entre 0 e 100%.');
 if(!['precharge','main','individual','first'].includes(c.startMode)||!['paced','level'].includes(c.control))throw Error('Condição de controle inválida.');
 c.mainZones=normalizeZones(c.accumulations?.main,c.mainLength,'Principal');
 const stations=c.stations.map((s,j)=>{
  const isE18=supportsAlternative(seed)&&j===10&&c.alternative==='E18';
  const base=isE18&&seed.e18Station?seed.e18Station:seed.stations[j];
  if(isE18)s={...(c.e18Station||{...s,length:base.length,uWidth:0}),enabled:s.enabled};
const q={...base,...s};
  q.rate=+s.rate;q.length=+s.length;q.u_width=+s.uWidth||0;
  if(supportsAlternative(seed)&&j===10&&c.alternative==='E18'){
   q.name=s.name||'E18 (alternativa a G22)';q.s=seed.e18_s;q.xy=seed.e18Station?.xy||[264,1287];q.branch=seed.e18_branch;
   q.u_width=0;
  }else if(supportsAlternative(seed)&&j===10)q.name=s.name&&s.name!=='E18-G22'?s.name:'G22 (alternativa a E18)';
  q.name=String(q.name||'').trim();if(!q.name)throw Error('Informe o nome da linha '+(j+1)+'.');
  if(q.rate<0||q.rate>300||!Number.isFinite(q.rate))throw Error('Consumo inválido em '+q.name+'. Use 0 a 300 cx/min.');
  if(q.length<=0||!Number.isFinite(q.length))throw Error('Comprimento inválido em '+q.name+'.');
  if(q.useGeometryTravel&&q.length>base.travel_length+.001)throw Error(q.name+': o acúmulo útil ultrapassa o trajeto desenhado. Aumente o ramal no editor de layout.');
  q.storageZones=normalizeZones(c.accumulations?.branches?.[supportsAlternative(seed)&&j===10&&c.alternative==='E18'?'e18':String(j)],q.length,q.name);
  q.enabled=s.enabled&&q.rate>0;q.capacity=zoneCapacity(q.storageZones,c.branchPitch);
  if(q.capacity<2)throw Error(q.name+': o ramal precisa comportar pelo menos duas caixas para este controle.');
  q.travelLength=q.useGeometryTravel?base.travel_length:q.length+(q.u_width?q.u_width*Math.PI/2+.8:.5);
  q.travel=q.travelLength/(c.branchSpeed/60);
  if(s.auto){
   q.maximum=Math.min(q.capacity-1,Math.max(2,q.capacity-Math.ceil(q.travel/c.cycle)-1));
   if(q.capacity<=5)q.maximum=q.capacity;
   q.maximum=Math.max(2,q.maximum);
   q.minimum=Math.min(q.maximum-1,Math.max(1,Math.ceil(q.rate*(q.travel+c.cycle+c.waitMargin)/60)+1));
  }else{q.minimum=+s.minimum;q.maximum=+s.maximum;}
  if(!Number.isInteger(q.minimum)||!Number.isInteger(q.maximum)||q.minimum<1||q.minimum>=q.maximum||q.maximum>q.capacity)
   throw Error(q.name+': use 1 ≤ mínimo < máximo ≤ capacidade ('+q.capacity+' caixas).');
  q.minSensor=levelDistance(q.storageZones,q.minimum+.25,c.branchPitch);q.maxSensor=levelDistance(q.storageZones,q.maximum-.5,c.branchPitch);
  q.s=q.s*c.mainLength/seed.length;
  return q;
 });
 if(!stations.some(s=>s.enabled))throw Error('Ative pelo menos uma linha com consumo maior que zero.');
 if(seed.dual&&zoneCapacity(c.mainZones,c.mainPitch)<1)throw Error('Defina espaço de acúmulo para ao menos uma caixa na principal.');
 c.stops=normalizeStops(c.stops,c,stations,seed.trunks);
 return {...c,stations};
}

class Heap {
 constructor(){this.a=[];}
 push(t,j){const a=this.a;let i=a.length;a.push([t,j]);while(i){let p=(i-1)>>1;if(a[p][0]<=t)break;a[i]=a[p];i=p;}a[i]=[t,j];}
 pop(){const a=this.a;const r=a[0],last=a.pop();if(a.length){let i=0;while(true){let k=i*2+1;if(k>=a.length)break;if(k+1<a.length&&a[k+1][0]<a[k][0])k++;if(a[k][0]>=last[0])break;a[i]=a[k];i=k;}a[i]=last;}return r;}
}
function nearest(p,n,g,removed){let a=0,b=n;while(a<b){let m=(a+b)>>1;if(p[m]>g)a=m+1;else b=m;}let best=-1,d=Infinity;for(const k of [a-1,a])if(k>=0&&k<n&&!removed.has(k)&&Math.abs(p[k]-g)<d){best=k;d=Math.abs(p[k]-g);}return best;}

export function runModel(input,seed,progress=()=>{}) {
 const c=prepare(input,seed);
 if(seed.dual)return runDualModel(input,c,seed,progress);
 const S=c.stations,N=S.length,dt=.1,T=c.durationHours*3600,steps=Math.round(T/dt);
 const pitch=c.mainPitch,L=c.mainLength,v=c.speed/60,half=pitch/2;
 const physicalMain=Math.floor(L/pitch),maxMain=zoneCapacity(c.mainZones,pitch),p=new Float64Array(physicalMain+10);
 let n=Math.floor(maxMain*c.mainInitial/100);
 p.set(initialPositions(c.mainZones,pitch,n));
 const initialMain=n;
 const stock=Int32Array.from(S,s=>Math.floor(s.capacity*c.branchInitial/100));
 const initialStock=stock.slice(),transit=new Int32Array(N),busy=new Float64Array(N),stop=new Float64Array(N);
 const call=new Uint8Array(N),nextLocal=new Float64Array(N),running=new Uint8Array(N),first=new Float64Array(N).fill(-1),arrival=new Float64Array(N).fill(-1);
 const nextConsume=new Float64Array(N).fill(Infinity),consumed=new Uint32Array(N),missed=new Uint32Array(N),transferred=new Uint32Array(N);
 const minSeen=stock.slice(),maxSeen=stock.slice(),events=new Heap();
 const active=S.map((s,j)=>j).filter(j=>S[j].enabled);
 const globalStart=c.startMode==='precharge'||c.startMode==='main';
 for(const j of active){
  if(stock[j])arrival[j]=0;
  if((c.startMode==='first'&&stock[j]>0)||(c.startMode==='individual'&&stock[j]>=S[j].maximum)||(globalStart&&n>=maxMain*.99&&(c.startMode==='main'||active.every(k=>stock[k]>=S[k].maximum)))){running[j]=1;first[j]=0;nextConsume[j]=0;}
 }
 let allStart=active.every(j=>running[j])?0:null,admitted=0,nextFeed=0;
 const snapshots=[],trend=[],sampleStep=Math.max(30,Math.ceil(steps/1800)),trendStep=Math.max(600,Math.ceil(steps/1440));
 const warm=Math.min(1800,T/4);let warmCounts=new Uint32Array(N),warmMissed=new Uint32Array(N),warmSet=false;
 let maxSimultaneous=0,lastTransfer=new Float64Array(N).fill(-1e9),minimumCycle=Infinity;
 let outsideAccumMax=0,outsideBoxSeconds=0,outsideFirst=null;
 const wholeMain=c.mainZones.length===1&&c.mainZones[0].start===0&&Math.abs(c.mainZones[0].end-L)<1e-7;
 const telemetryInterval=[1,5,10,30,60,120].find(seconds=>T/seconds<=10000)||Math.ceil(T/10000);
 const telemetryStep=Math.round(telemetryInterval/dt),telemetryRows=[],expected=new Float64Array(N);
 const intervalStockMin=stock.slice(),intervalStockMax=stock.slice();
 const gapStart=new Float64Array(N).fill(-1),gapCycles=new Uint32Array(N),shortageEvents=[];
 function captureTelemetry(t){telemetryRows.push({t,main:n,admitted,stock:stock.slice(),stockMin:intervalStockMin.slice(),stockMax:intervalStockMax.slice(),transit:transit.slice(),consumed:consumed.slice(),missed:missed.slice(),expected:expected.slice(),running:running.slice()});intervalStockMin.set(stock);intervalStockMax.set(stock);}
 function closeGap(j,t,openEnd=false){if(gapStart[j]>=0){shortageEvents.push({line:j,start:gapStart[j],end:t,cycles:gapCycles[j],openEnd});gapStart[j]=-1;gapCycles[j]=0;}}
 const mainStops=c.stops.filter(s=>s.target==='main'),transferStops=c.stops.filter(s=>s.target==='transfer');
 const planArrival=branchArrivalPlanner(c.stops,S,c.branchPitch,c.branchSpeed);
 const recovery=createStopRecovery(c.stops,S,active,()=>wholeMain?n:Array.from(p.subarray(0,n)).reduce((a,x)=>a+(insideZones(x,c.mainZones)?1:0),0));
 captureTelemetry(0);
 for(let step=0;step<steps;step++){
  const t=step*dt;
  const stopBoundary=recovery.capture(t,n,stock,missed);
  const barriers=mainStops.filter(s=>stopActive(s,t)).map(s=>Math.min(L-half,s.position)).sort((a,b)=>a-b);
  while(events.a.length&&events.a[0][0]<=t+1e-8){
   const [,j]=events.pop();transit[j]--;stock[j]++;closeGap(j,t);
   if(arrival[j]<0)arrival[j]=t;
   if(stock[j]>S[j].capacity)throw Error('Transbordo inesperado no modelo: '+S[j].name);
   if(!running[j]&&!globalStart&&stock[j]>=(c.startMode==='individual'?S[j].maximum:1)){running[j]=1;first[j]=t;nextConsume[j]=t;}
  }
  const occupiedStorage=allStart===null&&!wholeMain?Array.from(p.subarray(0,n)).reduce((a,x)=>a+(insideZones(x,c.mainZones)?1:0),0):n;
  if(globalStart&&allStart===null&&occupiedStorage>=maxMain*.99&&(c.startMode==='main'||active.every(j=>stock[j]>=S[j].maximum))){
   for(const j of active){running[j]=1;first[j]=t;nextConsume[j]=t;}allStart=t;
  }
  if(allStart===null&&active.every(j=>running[j]))allStart=t;
  for(const j of active){
   if(running[j])expected[j]+=S[j].rate*dt/60;
   if(running[j]&&nextConsume[j]<=t+1e-8){if(stock[j]){stock[j]--;consumed[j]++;}else{missed[j]++;if(gapStart[j]<0)gapStart[j]=t;gapCycles[j]++;}nextConsume[j]+=60/S[j].rate;}
   if(call[j]&&stock[j]>=S[j].maximum)call[j]=0;
   if(!call[j]&&(stock[j]<=S[j].minimum||(!running[j]&&stock[j]<S[j].maximum)))call[j]=1;
  }
  const available=new Uint8Array(N),brakes=new Uint8Array(N),relevant=[];
  for(const j of active){
   available[j]=!transferStops.some(s=>s.line===j&&stopActive(s,t))&&(c.startMode!=='main'||allStart!==null)&&call[j]&&stock[j]+transit[j]<S[j].capacity&&(c.control!=='paced'||nextLocal[j]<=t+1e-8)?1:0;
   brakes[j]=busy[j]>t+1e-8?1:0;
   if(available[j]||brakes[j])relevant.push(j);
  }
  relevant.sort((a,b)=>S[a].s-S[b].s);
  let gi=relevant.length-1,bi=barriers.length-1,leader=Infinity,outsideCount=0;
  for(let k=0;k<n;k++){
   const old=p[k];while(gi>=0&&S[relevant[gi]].s>=old-1e-7)gi--;
   const j=gi+1<relevant.length?relevant[gi+1]:-1;
   let limit=j<0?L-half:brakes[j]?stop[j]:S[j].s;
   while(bi>=0&&barriers[bi]>=old-1e-7)bi--;
   const barrier=bi+1<barriers.length?barriers[bi+1]:Infinity;
   const q=Math.min(old+v*dt,limit,barrier,leader-pitch);
   if(q<old-1e-6)throw Error('Violação de posição na principal.');
   p[k]=q;leader=q;
   if(!wholeMain&&q-old<v*dt*.1&&!insideZones(q,c.mainZones)){outsideCount++;if(outsideFirst===null)outsideFirst=t;}
  }
  outsideAccumMax=Math.max(outsideAccumMax,outsideCount);outsideBoxSeconds+=outsideCount*dt;
  const removed=new Set();
  for(const j of active)if(available[j]&&!brakes[j]){
   const k=nearest(p,n,S[j].s,removed);
   if(k>=0&&Math.abs(p[k]-S[j].s)<=half+1e-7){
    removed.add(k);busy[j]=t+dt+c.cycle;stop[j]=p[k]-pitch;
    transit[j]++;transferred[j]++;nextLocal[j]=t+dt+60/(S[j].rate*(1+c.recovery/100));
    if(lastTransfer[j]>0)minimumCycle=Math.min(minimumCycle,t+dt-lastTransfer[j]);lastTransfer[j]=t+dt;
    events.push(planArrival(j,t+dt+c.cycle),j);
   }
  }
  if(removed.size){let dest=0;for(let k=0;k<n;k++)if(!removed.has(k))p[dest++]=p[k];n=dest;}
  if(!barriers.some(x=>x<half+1e-8)&&t+1e-8>=nextFeed&&(!n||p[n-1]>=half+pitch-1e-8)){
   p[n++]=half;admitted++;nextFeed=(t-nextFeed>dt+1e-7?t:nextFeed)+60/c.inflow;
  }
  const simultaneous=active.reduce((a,j)=>a+(busy[j]>t?1:0),0);maxSimultaneous=Math.max(maxSimultaneous,simultaneous);
  if(!warmSet&&t>=warm){warmCounts=consumed.slice();warmMissed=missed.slice();warmSet=true;for(let j=0;j<N;j++)minSeen[j]=stock[j];}
  for(let j=0;j<N;j++){minSeen[j]=Math.min(minSeen[j],stock[j]);maxSeen[j]=Math.max(maxSeen[j],stock[j]);intervalStockMin[j]=Math.min(intervalStockMin[j],stock[j]);intervalStockMax[j]=Math.max(intervalStockMax[j],stock[j]);}
  if(stopBoundary||step%sampleStep===0||step===steps-1)snapshots.push({t,positions:Float32Array.from(p.subarray(0,n)),stock:stock.slice(),transit:transit.slice(),active:Uint8Array.from(busy,b=>b>t?1:0),calls:call.slice(),running:running.slice(),consumed:consumed.slice(),missed:missed.slice()});
  if(step%trendStep===0)trend.push({t,main:n,stock:stock.reduce((a,b)=>a+b,0),consumed:consumed.reduce((a,b)=>a+b,0),missed:missed.reduce((a,b)=>a+b,0),admitted});
  if((step+1)%telemetryStep===0||step===steps-1)captureTelemetry(Math.min(T,(step+1)*dt));
  if(step%20000===0)progress(step/steps);
 }
 for(const j of active)closeGap(j,T,true);
 shortageEvents.sort((a,b)=>a.start-b.start||a.line-b.line);
 if(initialMain+admitted!==n+transferred.reduce((a,b)=>a+b,0))throw Error('Conservação da principal falhou.');
 for(let j=0;j<N;j++)if(initialStock[j]+transferred[j]!==stock[j]+transit[j]+consumed[j])throw Error('Conservação do ramal falhou.');
 const measuredMinutes=(T-warm)/60;
 const lines=S.map((s,j)=>({...s,firstArrival:arrival[j]<0?null:arrival[j],start:first[j]<0?null:first[j],consumed:consumed[j],missed:missed[j],missedSteady:missed[j]-warmMissed[j],rateMeasured:(consumed[j]-warmCounts[j])/measuredMinutes,minObserved:minSeen[j],maxObserved:maxSeen[j],stockEnd:stock[j],transferred:transferred[j]}));
 return {stopResults:recovery.finish(T,missed),stops:c.stops,config:input,duration:T,warm,demand:S.filter(s=>s.enabled).reduce((a,s)=>a+s.rate,0),admitted,mainInitial:initialMain,mainEnd:n,mainCapacity:maxMain,mainZones:c.mainZones,outsideAccumMax,outsideBoxSeconds,outsideFirst,branchInitial:initialStock.reduce((a,b)=>a+b,0),branchEnd:stock.reduce((a,b)=>a+b,0),consumed:consumed.reduce((a,b)=>a+b,0),missed:missed.reduce((a,b)=>a+b,0),missedSteady:lines.reduce((a,s)=>a+s.missedSteady,0),allStart,rateMeasured:lines.reduce((a,s)=>a+s.rateMeasured,0),lines,snapshots,trend,telemetry:{interval:telemetryInterval,rows:telemetryRows},shortageEvents,sampleInterval:sampleStep*dt,maxSimultaneous,minimumCycle:Number.isFinite(minimumCycle)?minimumCycle:null,conservation:true};
}
