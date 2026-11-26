import {runModel} from './model.js?v=13';
self.onmessage=({data})=>{
 try{
  const result=runModel(data.config,data.seed,p=>self.postMessage({type:'progress',value:p}));
  const buffers=[];for(const s of result.snapshots)for(const k of ['positions','positionIds','stock','transit','active','calls','running','consumed','missed'])if(s[k])buffers.push(s[k].buffer);
  for(const s of result.snapshots)for(const p of [...(s.trunks||[]),...(s.trunkIds||[]),...(s.branchPositions||[]),...(s.branchIds||[])])buffers.push(p.buffer);
  for(const row of result.telemetry.rows)for(const k of ['stock','stockMin','stockMax','transit','consumed','missed','expected','running'])buffers.push(row[k].buffer);
  for(const times of result.diversions||[])buffers.push(times.buffer);
  self.postMessage({type:'result',result},[...new Set(buffers)]);
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
