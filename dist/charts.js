import {aggregateTelemetry,historyCsv,shortagesCsv} from './analytics-data.js?v=10';
import {selectedDemand} from './stock-data.js?v=10';
import {createStockMonitor} from './stock-monitor.js?v=10';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=2)=>Number(x).toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n});
const time=t=>{t=Math.max(0,Math.floor(t));return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');};
const C={black:'#000102',olive:'#708c00',gray:'#879299',light:'#b6bec3',red:'#b74e38'};

export function createAnalytics({get:$,notify,download,onSeek}){
 let result=null,data=null,renderers=[],selected=new Set(),choiceRenderedFor=null;
 const stocks=createStockMonitor({get:$,download,onSeek});
 function clear(){result=null;data=null;renderers=[];choiceRenderedFor=null;selected.clear();stocks.clear();$('analyticsEmpty').hidden=false;$('analyticsContent').hidden=true;$('analyticsFilters').disabled=true;$('exportHistory').disabled=true;$('analyticsTooltip').hidden=true;$('selectActiveLines').disabled=true;$('clearAnalysisLines').disabled=true;$('analyticsLineChoices').innerHTML='';$('analyticsSelectionCount').textContent='Execute um ensaio';}
 function renderSelection(){
  if(!result)return;
  const indices=[...selected].sort((a,b)=>a-b);
  $('selectedRateValue').textContent=fmt(selectedDemand(result,indices));
  $('selectedRateNote').textContent=indices.length+' '+(indices.length===1?'linha selecionada':'linhas selecionadas');
  $('analyticsSelectionCount').textContent=indices.length+' de '+result.lines.length+' linhas';
  if(choiceRenderedFor!==result){$('analyticsLineChoices').innerHTML=result.lines.map((s,j)=>`<label><input type="checkbox" data-analysis-line="${j}" ${selected.has(j)?'checked':''}><span>${esc(s.name)}<small>${fmt(s.enabled?s.rate:0)} cx/min${s.enabled?'':' · desligada'}</small></span></label>`).join('');choiceRenderedFor=result;}
  else $('analyticsLineChoices').querySelectorAll('[data-analysis-line]').forEach(input=>{input.checked=selected.has(Number(input.dataset.analysisLine));});
  const active=result.lines.map((s,j)=>s.enabled?j:-1).filter(j=>j>=0),all=indices.length===active.length&&indices.every(j=>active.includes(j));
  $('analyticsLine').value=all?'-1':indices.length===1?String(indices[0]):'selection';
 }
 function setSelection(indices){if(!result)return;selected=new Set(indices.filter(j=>Number.isInteger(j)&&j>=0&&j<result.lines.length));renderSelection();apply();}
 function configure(r){
  result=r;
  $('analyticsLine').innerHTML='<option value="-1">Todas as linhas ativas</option><option value="selection">Seleção múltipla…</option>'+r.lines.map((s,i)=>`<option value="${i}">${esc(s.name)}${s.enabled?'':' · desligada'}</option>`).join('');
  $('analyticsLine').value='-1';
  const base=r.telemetry.interval,options=[base,...[10,60,300,900].map(x=>Math.max(base,Math.round(x/base)*base))].filter((v,i,a)=>a.indexOf(v)===i).sort((a,b)=>a-b);
  $('analyticsInterval').innerHTML=options.map(v=>`<option value="${v}">${v<60?v+' segundos':fmt(v/60,v%60?1:0)+' minutos'}</option>`).join('');
  $('analyticsInterval').value=String(options.find(v=>v>=60)||options.at(-1));
  $('analyticsFrom').value=0;$('analyticsTo').value=r.duration/60;$('analyticsFrom').max=r.duration/60;$('analyticsTo').max=r.duration/60;
  $('analyticsEmpty').hidden=true;$('analyticsContent').hidden=false;$('analyticsFilters').disabled=false;$('exportHistory').disabled=false;$('selectActiveLines').disabled=false;$('clearAnalysisLines').disabled=false;
  selected=new Set(r.lines.map((s,j)=>s.enabled?j:-1).filter(j=>j>=0));renderSelection();apply();
 }
 function apply(){
  if(!result)return;
  if(!selected.size){data=null;renderers=[];$('historyConsumed').textContent='—';$('historyMissed').textContent='—';$('historyService').textContent='—';$('historyFirstGap').textContent='—';$('exportHistory').disabled=true;$('exportShortages').disabled=true;$('exportInstantStocks').disabled=true;for(const id of ['consumptionChart','shortageChart','stockChart','feedChart'])$(id).innerHTML='<p class="no-analysis-selection">Selecione uma ou mais linhas para analisar.</p>';$('shortageEventsBody').innerHTML='<tr><td colspan="6">Nenhuma linha selecionada.</td></tr>';$('eventsNote').textContent='Selecione as linhas para consultar ocorrências.';stocks.setData(result,[],0,result.duration);return;}
  $('exportHistory').disabled=false;$('exportShortages').disabled=false;$('exportInstantStocks').disabled=false;
  try{data=aggregateTelemetry(result,{lines:[...selected],interval:Number($('analyticsInterval').value),from:Number($('analyticsFrom').value)*60,to:Number($('analyticsTo').value)*60});}
  catch(e){notify(e.message,true);return;}
  $('analyticsFrom').value=Number((data.from/60).toFixed(6));$('analyticsTo').value=Number((data.to/60).toFixed(6));
  $('historyConsumed').textContent=fmt(data.totals.consumed,0);$('historyMissed').textContent=fmt(data.totals.missed,0);
  $('historyService').textContent=data.service===null?'Sem demanda liberada':fmt(data.service,1)+'%';
  $('historyFirstGap').textContent=data.events.length?time(Math.max(data.from,data.events[0].start)):'Sem registros';
  $('analyticsResolution').textContent='Janela: '+time(data.from)+' a '+time(data.to)+' · taxa por intervalo de '+fmt(data.interval,0)+' s · histórico registrado a cada '+fmt(data.base,0)+' s. Valores de caixas são contagens reais do modelo.'+(result.stops?.length?' Faixas laranja: paradas programadas.':'');
  paint();eventsTable();
 }
 function seriesLegend(id,series){$(id).innerHTML=series.map(s=>`<span><i style="background:${s.color}${s.dash?';opacity:.7':''}"></i>${esc(s.label)}</span>`).join('');}
 function renderChart(id,series,{bars=false,unit='cx/min',annotation=false,stocks=false}={}){
  const host=$(id),w=Math.max(280,host.clientWidth||600),h=id==='consumptionChart'?230:195,m={l:48,r:18,t:20,b:35},pw=w-m.l-m.r,ph=h-m.t-m.b;
  const points=data.points,x=t=>m.l+(t-data.from)/(data.to-data.from)*pw;
  const rawMax=Math.max(1,...series.flatMap(s=>points.map(p=>Math.max(0,Number(s.get(p))||0))));
  const magnitude=10**Math.floor(Math.log10(rawMax/3)),factor=(rawMax/3)/magnitude;
  let step=([1,2,2.5,5,10].find(v=>v>=factor)||10)*magnitude;if(unit!=='cx/min')step=Math.max(1,Math.ceil(step));
  const ymax=step*3,y=v=>m.t+ph-Math.max(0,v)/ymax*ph;
  let content=`<title>${esc(host.getAttribute?.('aria-label')||id)} · ${time(data.from)} a ${time(data.to)}</title>`;
  const timingLines=data.indices.map(j=>result.lines[j]).filter(s=>s.enabled);
  const starts=timingLines.map(s=>s.start).filter(t=>t!==null),first=starts.length?Math.min(...starts):result.duration;
  const shadeEnd=Math.min(data.to,first);
  if(shadeEnd>data.from)content+=`<rect x="${x(data.from)}" y="${m.t}" width="${x(shadeEnd)-x(data.from)}" height="${ph}" fill="#eef1f2"/>`;
  for(const e of (result.stops||[]).filter(e=>e.target==='main'||data.indices.includes(e.line))){const a=Math.max(data.from,e.start),b=Math.min(data.to,e.end);if(b>a)content+=`<rect x="${x(a)}" y="${m.t}" width="${Math.max(1,x(b)-x(a))}" height="${ph}" fill="#ed996b" opacity=".16"><title>Parada: ${esc(e.name)} · ${time(e.start)} a ${time(e.end)}</title></rect>`;}
  for(const p of points)if(p.missed>0)content+=`<rect x="${x(p.start)}" y="${m.t}" width="${Math.max(.5,x(p.end)-x(p.start))}" height="${ph}" fill="#b74e38" opacity=".08"/>`;
  for(let k=0;k<=3;k++){const value=k*step,yy=y(value);content+=`<line x1="${m.l}" x2="${w-m.r}" y1="${yy}" y2="${yy}" stroke="#e6ebed"/><text x="${m.l-9}" y="${yy+4}" text-anchor="end">${fmt(value,value%1?1:0)}</text>`;}
  const ticks=w<450?2:4;for(let k=0;k<=ticks;k++){const t=data.from+(data.to-data.from)*k/ticks;content+=`<text x="${x(t)}" y="${h-11}" text-anchor="${k===0?'start':k===ticks?'end':'middle'}">${time(t)}</text>`;}
  if(bars){
   for(const p of points)if(p.missed)content+=`<rect x="${x(p.start)+.5}" y="${y(p.missed)}" width="${Math.max(1,x(p.end)-x(p.start)-1)}" height="${m.t+ph-y(p.missed)}" fill="${C.red}"/>`;
   if(!data.totals.missed)content+=`<text x="${m.l+pw/2}" y="${m.t+ph/2}" text-anchor="middle" class="chart-empty-label">${data.service===null?'Sem consumo liberado nesta janela':'Nenhum ciclo sem caixa nesta janela'}</text>`;
  }else for(const s of series){
   const d=points.map((p,i)=>(i?'L':'M')+x(stocks?p.end:p.t).toFixed(2)+','+y(s.get(p)).toFixed(2)).join(' ');
   content+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width||1.8}"${s.dash?' stroke-dasharray="'+s.dash+'"':''} vector-effect="non-scaling-stroke"/>`;
   if(points.length===1)content+=`<circle cx="${x(points[0].t)}" cy="${y(s.get(points[0]))}" r="3" fill="${s.color}"/>`;
  }
  const release=timingLines.length&&timingLines.every(s=>s.start!==null)?Math.max(...timingLines.map(s=>s.start)):null;
  if(annotation&&release!==null&&release>=data.from&&release<=data.to){const xx=x(release);content+=`<line x1="${xx}" x2="${xx}" y1="${m.t}" y2="${m.t+ph}" stroke="#8ca200" stroke-dasharray="3 3"/><text x="${Math.min(w-m.r-125,Math.max(m.l+4,xx+5))}" y="${m.t+11}" class="release-label">${data.scopeAll?'Todas liberadas':data.line>=0?'Liberação':'Seleção liberada'} ${time(release)}</text>`;}
  host.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(series.map(s=>s.label).join(', '))}; eixo horizontal: tempo de simulação; vertical: ${unit}">${content}</svg>`;
  function pointAt(event){const bounds=host.getBoundingClientRect(),t=data.from+Math.max(0,Math.min(1,(event.clientX-bounds.left-m.l)/pw))*(data.to-data.from);let a=0,b=points.length-1;while(a<b){let mid=(a+b)>>1;if(points[mid].end<t)a=mid+1;else b=mid;}return points[a];}
  host.onpointermove=e=>{
   const p=pointAt(e),tooltip=$('analyticsTooltip');
   tooltip.innerHTML=`<strong>${time(p.start)} → ${time(p.end)}</strong>`+series.map(s=>`<span>${esc(s.label)}<b>${fmt(s.get(p),unit==='cx/min'?2:0)} ${unit}</b></span>`).join('')+`<span class="${p.missed?'gap-tooltip':''}">Ciclos sem caixa<b>${p.missed}</b></span><small>Clique para localizar no mapa</small>`;
   tooltip.hidden=false;tooltip.style.left=Math.max(8,Math.min((globalThis.innerWidth||1100)-270,e.clientX+14))+'px';tooltip.style.top=Math.max(8,Math.min((globalThis.innerHeight||900)-205,e.clientY+14))+'px';
   host.style.setProperty?.('--chart-cursor',(x(p.t))+'px');host.classList.add('hovering');
  };
  host.onpointerleave=()=>{$('analyticsTooltip').hidden=true;host.classList.remove('hovering');};
  host.onclick=e=>{const p=pointAt(e);$('analyticsTooltip').hidden=true;onSeek(p.start,data.line<0?null:data.line);};
 }
 function paint(){
  if(!result||!data)return;
  const consumption=[{label:'Consumo realizado',get:p=>p.consumptionRate,color:C.black,width:2},{label:'Demanda das liberadas',get:p=>p.activeDemand,color:C.olive,dash:'6 4'},{label:'Demanda configurada',get:p=>p.nominalDemand,color:C.gray,dash:'2 4'}];
  const shortage=[{label:'Ciclos sem caixa no intervalo',get:p=>p.missed,color:C.red}];
  const stock=data.scopeAll?[{label:'Principal, incluindo trânsito',get:p=>p.main,color:C.black},{label:'Estoque nos ramais selecionados',get:p=>p.stock,color:C.olive}]:data.line<0?[
   {label:'Estoque dos ramais selecionados',get:p=>p.stock,color:C.black},{label:'Caixas em trânsito',get:p=>p.transit,color:C.olive}]:[
   {label:'Estoque no ramal',get:p=>p.stock,color:C.black},{label:'Caixas em trânsito',get:p=>p.transit,color:C.olive},
   {label:'Nível mínimo',get:()=>result.lines[data.line].minimum,color:'#bc893d',dash:'4 4'},
   {label:'Nível máximo',get:()=>result.lines[data.line].maximum,color:C.gray,dash:'2 3'}];
  const feed=data.scopeAll?[{label:'Entrada efetiva na principal',get:p=>p.feedRate,color:C.black},{label:'Chegada aos ramais selecionados',get:p=>p.receivedRate,color:C.olive},{label:'Alimentação nominal',get:()=>result.config.inflow,color:C.gray,dash:'4 4'}]:[
   {label:data.line<0?'Recebidas nos ramais selecionados':'Caixas recebidas no ramal',get:p=>p.receivedRate,color:C.black},{label:data.line<0?'Demanda das selecionadas liberadas':'Demanda da máquina liberada',get:p=>p.activeDemand,color:C.olive,dash:'4 4'}];
  $('stockChartTitle').textContent=data.scopeAll?'Estoque na principal e nos ramais':data.line<0?'Estoque das linhas selecionadas':'Estoque de '+result.lines[data.line].name;
  $('feedChartTitle').textContent=data.scopeAll?'Alimentação efetiva e chegada aos ramais':data.line<0?'Reposição das linhas selecionadas':'Reposição de '+result.lines[data.line].name;
  $('feedChartNote').textContent=data.scopeAll?'A entrada pode pausar quando não há espaço na principal.':'Recebimento contabilizado quando a caixa chega à fila da máquina, após o trânsito.';
  seriesLegend('consumptionLegend',consumption);seriesLegend('shortageLegend',shortage);seriesLegend('stockLegend',stock);seriesLegend('feedLegend',feed);
  renderers=[()=>renderChart('consumptionChart',consumption,{annotation:true}),()=>renderChart('shortageChart',shortage,{bars:true,unit:'ciclos'}),()=>renderChart('stockChart',stock,{unit:'caixas',stocks:true}),()=>renderChart('feedChart',feed)];
  renderers.forEach(fn=>fn());
  stocks.setData(result,data.indices,data.from,data.to);
 }
 function eventsTable(){
  const events=data.events;$('eventsNote').textContent=events.length?fmt(events.length,0)+' ocorrências cruzam a janela · horários originais · mostrando até 50.':'Nenhuma solicitação de consumo sem caixa foi registrada nesta janela.';
  $('shortageEventsBody').innerHTML=events.length?events.slice(0,50).map((e,i)=>`<tr><td>${esc(result.lines[e.line].name)}</td><td class="number">${time(e.start)}</td><td class="number">${time(e.end)}${e.openEnd?' · até o fim':''}</td><td class="number">${fmt(e.end-e.start,1)} s</td><td class="number">${e.cycles}</td><td><button class="text-button" data-gap-index="${i}">Ver no layout ↗</button></td></tr>`).join(''):'<tr><td colspan="6">'+(data.service===null?'As máquinas ainda não tinham consumo liberado nesta janela.':'Sem faltas registradas após a liberação das máquinas.')+'</td></tr>';
  $('shortageEventsBody').querySelectorAll('[data-gap-index]').forEach(b=>b.onclick=()=>{const e=events[+b.dataset.gapIndex];onSeek(e.start,e.line);});
 }
 $('applyAnalytics').onclick=apply;
 $('analyticsLine').onchange=()=>{const value=$('analyticsLine').value;if(value==='selection'){$('analyticsSelection').open=true;return;}setSelection(value==='-1'?result.lines.map((s,j)=>s.enabled?j:-1).filter(j=>j>=0):[Number(value)]);};
 $('analyticsLineChoices').onchange=e=>{const key=e.target?.dataset?.analysisLine;if(key===undefined||!result)return;const indices=new Set(selected);if(e.target.checked)indices.add(Number(key));else indices.delete(Number(key));setSelection([...indices]);};
 $('selectActiveLines').onclick=()=>{if(result)setSelection(result.lines.map((s,j)=>s.enabled?j:-1).filter(j=>j>=0));};
 $('clearAnalysisLines').onclick=()=>setSelection([]);
 $('analyticsInterval').onchange=apply;
 $('resetAnalytics').onclick=()=>{if(!result)return;$('analyticsFrom').value=0;$('analyticsTo').value=result.duration/60;apply();};
 $('exportHistory').onclick=()=>{if(data)download('torfresma-historico-producao.csv',historyCsv(data));};
 $('exportShortages').onclick=()=>{if(data)download('torfresma-ocorrencias-falta.csv',shortagesCsv(data,result));};
 clear();return {setResult:configure,clear,resize:()=>{if(result&&data)paint();},updatePlayback:snapshot=>stocks.updatePlayback(snapshot),setSelection,getSelection:()=>[...selected],getData:()=>data};
}
