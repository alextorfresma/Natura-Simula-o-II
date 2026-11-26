export function normalizeZones(raw,limit,label='Acúmulo'){
 if(raw===undefined||raw===null)return [{id:'default',name:'Trecho completo',start:0,end:limit}];
 if(!Array.isArray(raw)||raw.length>40)throw Error(label+': use uma lista de até 40 trechos.');
 const zones=raw.map((z,i)=>({id:String(z.id||i),name:String(z.name||'Trecho '+(i+1)),start:Number(z.start),end:Number(z.end)})).sort((a,b)=>a.start-b.start);
 let previous=-1;
 for(const z of zones){
  if(z.end>limit&&z.end-limit<.001)z.end=limit;
  if(!Number.isFinite(z.start)||!Number.isFinite(z.end)||z.start<0||z.end<=z.start||z.end>limit+1e-7)throw Error(label+': início e fim devem estar entre 0 e '+limit.toFixed(3)+' m.');
  if(z.start<previous-1e-7)throw Error(label+': os trechos não podem se sobrepor.');
  previous=z.end;
 }
 return zones;
}
export function zoneCapacity(zones,pitch){return zones.reduce((sum,z)=>sum+Math.floor((z.end-z.start+1e-9)/pitch),0);}
export function insideZones(x,zones){
 let lo=0,hi=zones.length;while(lo<hi){const m=(lo+hi)>>1;if(zones[m].start<=x+1e-7)lo=m+1;else hi=m;}
 return lo>0&&x<=zones[lo-1].end+1e-7;
}
export function levelDistance(zones,units,pitch){
 for(const z of zones){const count=Math.floor((z.end-z.start+1e-9)/pitch);if(units<=count+1e-7)return z.start+units*pitch;units-=count;}
 return zones.at(-1)?.end||0;
}
export function initialPositions(zones,pitch,count){
 const p=[];
 for(const z of [...zones].reverse()){
  const n=Math.min(count,Math.floor((z.end-z.start+1e-9)/pitch));
  for(let k=0;k<n;k++)p.push(z.end-(k+.5)*pitch);
  count-=n;if(!count)break;
 }
 return p;
}
