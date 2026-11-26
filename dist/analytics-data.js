export function aggregateTelemetry(result,{line=-1,lines,from=0,to=result.duration,interval=60}={}){
 const rows=result.telemetry?.rows;
 if(!rows?.length)throw Error('Execute novamente a simulação para gerar o histórico dos gráficos.');
 if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>result.duration+.1)throw Error('Informe uma janela válida dentro do período simulado.');
 if(!Number.isFinite(interval)||interval<=0)throw Error('O intervalo do gráfico precisa ser positivo.');
 const requested=Number(line),indices=lines===undefined?(requested<0?result.lines.map((_,i)=>i):[requested]):[...new Set(lines.map(Number))].sort((a,b)=>a-b);
 const j=indices.length===1?indices[0]:-1;
 if(indices.some(i=>!Number.isInteger(i)||i<0||i>=result.lines.length))throw Error('Linha inválida para análise.');
 const base=result.telemetry.interval,group=Math.max(1,Math.round(interval/base));
 let start=0;while(start<rows.length-1&&rows[start].t<from-1e-7)start++;
 let end=rows.length-1;while(end>0&&rows[end].t>to+1e-7)end--;
 if(end<=start)throw Error('Aumente a janela: a resolução deste ensaio é de '+base+' segundos.');
 const sum=(row,key)=>indices.reduce((a,i)=>a+row[key][i],0),points=[];
 const nominal=indices.reduce((a,i)=>a+(result.lines[i].enabled?result.lines[i].rate:0),0);
 for(let a=start;a<end;a+=group){
  const b=Math.min(end,a+group),r0=rows[a],r1=rows[b],minutes=(r1.t-r0.t)/60;
  const consumed=sum(r1,'consumed')-sum(r0,'consumed'),missed=sum(r1,'missed')-sum(r0,'missed');
  const stock=sum(r1,'stock'),transit=sum(r1,'transit');
  points.push({start:r0.t,end:r1.t,t:(r0.t+r1.t)/2,minutes,consumed,missed,feedCount:r1.admitted-r0.admitted,received:stock-sum(r0,'stock')+consumed,consumptionRate:consumed/minutes,
   activeDemand:(sum(r1,'expected')-sum(r0,'expected'))/minutes,nominalDemand:nominal,
   feedRate:(r1.admitted-r0.admitted)/minutes,receivedRate:(stock-sum(r0,'stock')+consumed)/minutes,
   stock,transit,main:r1.main,totalConsumed:sum(r1,'consumed'),totalMissed:sum(r1,'missed')});
 }
 const totals=points.reduce((a,p)=>({consumed:a.consumed+p.consumed,missed:a.missed+p.missed,admitted:a.admitted+p.feedCount}),{consumed:0,missed:0,admitted:0});
 const events=(result.shortageEvents||[]).filter(e=>indices.includes(e.line)&&e.start<rows[end].t&&e.end>=rows[start].t);
 const scopeAll=result.lines.every((s,i)=>!s.enabled||indices.includes(i));
 const lineName=j>=0?result.lines[j].name:scopeAll?'Todas as linhas ativas':indices.map(i=>result.lines[i].name).join(' + ');
 return {points,events,from:rows[start].t,to:rows[end].t,line:j,indices,scopeAll,lineName,nominal,interval:group*base,base,totals,
  service:totals.consumed+totals.missed?100*totals.consumed/(totals.consumed+totals.missed):null};
}
export function toCsv(rows){return '\ufeff'+rows.map(r=>r.map(value=>{const s=typeof value==='number'&&Number.isFinite(value)?String(Number(value.toFixed(6))).replace('.',','):String(value??'');return '"'+s.replaceAll('"','""')+'"';}).join(';')).join('\r\n');}
export function historyCsv(data){
 return toCsv([['Linha','Inicio s','Fim s','Consumo no intervalo cx','Consumo cx/min','Demanda ativa cx/min','Demanda configurada cx/min','Faltas cx','Entraram na principal cx','Recebidas nos ramais cx','Alimentacao principal cx/min','Recebidas nos ramais cx/min','Estoque principal cx','Estoque ramais cx','Em transito nos ramais cx'],
 ...data.points.map(p=>[data.lineName,p.start,p.end,p.consumed,p.consumptionRate,p.activeDemand,p.nominalDemand,p.missed,p.feedCount,p.received,p.feedRate,p.receivedRate,p.main,p.stock,p.transit])]);
}
export function shortagesCsv(data,result){
 return toCsv([['Linha','Inicio s','Fim s','Espera por caixa s','Ciclos sem caixa','Aberto ao fim do ensaio'],
 ...data.events.map(e=>[result.lines[e.line].name,e.start,e.end,e.end-e.start,e.cycles,e.openEnd?'sim':'não'])]);
}
