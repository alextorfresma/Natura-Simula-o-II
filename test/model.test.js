import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {defaultConfig,prepare,runModel} from '../dist/model.js';
import {aggregateTelemetry} from '../dist/analytics-data.js';
import {validateLayoutSeed} from '../dist/layout-data.js';

const seed=validateLayoutSeed(JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))));
const config=defaultConfig(seed);

test('o Layout 03 usa dois ramais, dimensões de referência e 21 máquinas, com uma alternativa',()=>{
 const normal=prepare(config,seed), other=prepare({...config,alternative:'E18'},seed);
 assert.equal(normal.mainPitch,.290);
 assert.equal(normal.branchPitch,.464);
 assert.equal(normal.stations.length,21);
 assert.equal(seed.trunks.length,2);
 for(const [route,from,cota] of [[0,[1778,1088],53.5607],[1,[1731,1250],31.3373],[1,[1163,1211],28.138]]){
  const trunk=seed.trunks[route], i=trunk.points.findIndex(p=>p[0]===from[0]&&p[1]===from[1]);
  assert.ok(i>=0 && Math.abs(trunk.lengths[i+1]-trunk.lengths[i]-cota)<1e-8);
 }
 assert.ok(normal.stations.every(s=>s.capacity===Math.floor(s.length/.464)));

 assert.ok(Math.abs(normal.stations.reduce((total,s)=>total+s.rate,0)-83.4645)<1e-8);
 assert.notDeepEqual(normal.stations[10].xy,other.stations[10].xy);
 assert.equal(normal.stations[10].rate,other.stations[10].rate);
});

test('pré-enche sem cronômetro fixo, libera e conserva as caixas durante a produção',()=>{
 const short={...config,durationHours:.5};
 const run=runModel(short,seed);
 assert.ok(run.filledAt>0);
 assert.equal(run.allStart,run.filledAt);
 assert.ok(run.groupSent.every(n=>n>0));
 assert.ok(run.consumed>0);
 assert.ok(run.conservation);
 assert.ok(run.snapshots.some(s=>!s.filled));
 assert.ok(run.snapshots.some(s=>s.t===run.filledAt&&s.filled));
 const data=aggregateTelemetry(run);
 assert.equal(data.totals.consumed,run.consumed);
 assert.equal(data.totals.missed,run.missed);
 assert.equal(run.telemetry.interval,5);
 const changed=runModel({...short,inflow:50},seed);
 assert.ok(changed.filledAt>run.filledAt);
});

test('seleciona e configura acúmulos por máquina sem modificar seu consumo',()=>{
 const revised=structuredClone(config);
 revised.durationHours=.2;
 revised.stations.forEach((s,i)=>{s.enabled=i===0;});
 Object.assign(revised.stations[0],{auto:false,minimum:2,maximum:3});
 const run=runModel(revised,seed);
 assert.equal(run.demand,config.stations[0].rate);
 assert.deepEqual(run.groupSent.map(Boolean),[false,true]);
 assert.equal(run.lines[0].maxObserved,3);
 assert.equal(run.lines[0].minimum,2);
 assert.ok(run.lines.slice(1).every(s=>s.consumed===0&&s.missed===0));
 assert.throws(()=>prepare({...revised,stations:revised.stations.map((s,i)=>i===0?{...s,minimum:4}:s)},seed),/capacidade/);
});

test('os quatro modos de liberação e a transição 50/50 são condições distintas',()=>{
 const scenario={...config,durationHours:1};
 const first=runModel({...scenario,startMode:'first'},seed);
 const main=runModel({...scenario,startMode:'main'},seed);
 const local=runModel({...scenario,startMode:'individual'},seed);
 const global=runModel(scenario,seed);
 assert.ok(main.allStart<global.allStart);
 assert.ok(first.lines.some(s=>s.start!==null&&s.start<global.allStart));
 assert.ok(local.lines.some(s=>s.start!==null&&s.start<local.allStart));
 assert.ok(global.lines.every(s=>s.start===global.allStart));
 for(const result of [first,main,local,global]){
  assert.ok(Number.isFinite(result.filledAt) && result.filledAt>0);
  assert.ok(result.lines.every(line=>line.maxObserved===line.maximum));
 }
 assert.ok(first.filledAt>first.allStart);
 assert.ok(main.filledAt>main.allStart);
 const atRelease=global.snapshots.find(s=>s.t===global.allStart);
 assert.ok(atRelease.stock.every((stock,j)=>stock===global.lines[j].maximum));
 assert.ok(global.snapshots.filter(s=>s.t<global.allStart).every(s=>s.consumed.every(n=>n===0)));
 assert.equal(atRelease.positions.length,global.inletCapacity);
 assert.deepEqual(atRelease.trunks.map(boxes=>boxes.length),global.trunkCapacity);
 assert.equal(atRelease.main,global.mainCapacity);
 const incomplete=runModel({...config,durationHours:1/60},seed);
 assert.equal(incomplete.filledAt,null);
 assert.equal(incomplete.consumed,0);
 assert.equal(incomplete.missed,0);
});

test('preserva consumo das reservas e mede faltas em paradas localizadas',()=>{
 const scenario={...config,durationHours:.75};
 const normal=runModel(scenario,seed);
 const stops=[
  {name:'Bloqueio superior',target:'trunk',line:0,position:0,start:1000,duration:400},
  {name:'Transferência',target:'transfer',line:0,position:0,start:1600,duration:180}
 ];
 const stopped=runModel({...scenario,stops},seed);
 assert.ok(stopped.conservation);
 assert.ok(stopped.missed>normal.missed);
 assert.ok(stopped.stopResults[0].lines.length>1);
 assert.ok(stopped.stopResults[0].lines.every(line=>stopped.lines[line.line].group===0));
 assert.equal(stopped.stopResults[1].lines.length,1);
 assert.ok(stopped.snapshots.some(frame=>frame.t===1400));
 assert.throws(()=>prepare({...scenario,stops:[{...stops[0],position:10000}]},seed),/posição/);
});

test('o worker entrega os quadros dos ramais e os vetores do histórico por transferência',async()=>{
 let output;
 globalThis.self={postMessage(message,buffers=[]){output=structuredClone(message,{transfer:buffers});}};
 try {
  await import('../dist/worker.js');
  self.onmessage({data:{config:{...config,durationHours:1/60},seed}});
  assert.equal(output.type,'result',output.message);
  assert.equal(output.result.snapshots[0].trunks.length,2);
  assert.equal(output.result.snapshots.at(-1).branchPositions.length,21);
  assert.equal(output.result.telemetry.rows.at(-1).stock.length,21);
 }finally{delete globalThis.self;}
});

test('o pré-enchimento global mantém alimentação e distribuição proporcionais após a liberação',()=>{
 const r=runModel({...config,durationHours:.75},seed);
 const ready=r.snapshots.find(s=>s.t===r.allStart);
 assert.equal(ready.main,r.mainCapacity);
 assert.deepEqual(ready.trunks.map(boxes=>boxes.length),r.trunkCapacity);
 assert.ok(ready.stock.every((stock,i)=>stock===r.lines[i].maximum));
 assert.ok(ready.consumed.every(n=>n===0));
 const early=r.telemetry.rows.filter(s=>s.t>=r.allStart&&s.t<=r.allStart+300);
 assert.ok(early.length>40);
 assert.ok(early.slice(1).every((s,i)=>s.admitted>early[i].admitted),'A alimentação não deve parar em blocos após a liberação');
 assert.ok(early.every(s=>s.main>=r.mainCapacity*.97));
 assert.equal(r.missed,0);
 const last=r.telemetry.rows.at(-1);
 const sent=last.groupSent.map((n,i)=>n-ready.groupSent[i]);
 const ratio=r.lines.filter(s=>s.group===0).reduce((n,s)=>n+s.rate,0)/r.demand;
 assert.ok(Math.abs(sent[0]/(sent[0]+sent[1])-ratio)<.015);
});

test('a mesma caixa só avança e só muda de trecho em direção à máquina',()=>{
 const run=runModel({...config,durationHours:.3},seed);
 const boxes=new Map();
 for(const snap of run.snapshots){
  const seen=new Set();
  function check(positions,ids,stage,group){
   positions.forEach((position,i)=>{
    const id=ids[i],before=boxes.get(id);
    assert.ok(!seen.has(id),'uma caixa não pode ocupar dois trechos');
    if(before){
     assert.ok(stage>=before.stage,'não há retorno de ramal para a principal');
     if(stage===before.stage)assert.ok(position>=before.position-1e-5,'a posição ao longo do trecho só pode avançar');
     if(before.group!==null)assert.equal(group,before.group);
    }
    seen.add(id);boxes.set(id,{stage,group,position});
   });
  }
  check(snap.positions,snap.positionIds,0,null);
  snap.trunks.forEach((positions,i)=>check(positions,snap.trunkIds[i],1,i));
  snap.branchPositions.forEach((positions,i)=>check(positions,snap.branchIds[i],2,run.lines[i].group));
 }
 assert.ok([...boxes.values()].some(box=>box.stage===2));
});
