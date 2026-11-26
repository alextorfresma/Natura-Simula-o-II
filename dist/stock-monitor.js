import {stockPoints,instantaneousStocksCsv} from './stock-data.js?v=12';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=t=>{t=Math.max(0,Math.floor(t));return [Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(x=>String(x).padStart(2,'0')).join(':');};

export function stockSvg({points,capacity,minimum,maximum,from,to,events=[],stops=[],release=null,name='',width=320,height=155}){
 const m={l:31,r:12,t:12,b:28},pw=width-m.l-m.r,ph=height-m.t-m.b;
 const x=t=>m.l+(t-from)/(to-from)*pw,y=v=>m.t+ph-v/Math.max(1,capacity)*ph;
 let s=`<title>Estoque instantâneo de ${esc(name)} em caixas, de ${clock(from)} a ${clock(to)}.</title>`;
 const ready=release===null?to:Math.min(to,release);if(ready>from)s+=`<rect x="${x(from)}" y="${m.t}" width="${x(ready)-x(from)}" height="${ph}" fill="#eef1f2"/>`;
 for(const e of stops){const a=Math.max(from,e.start),b=Math.min(to,e.end);if(b>a)s+=`<rect x="${x(a)}" y="${m.t}" width="${Math.max(.7,x(b)-x(a))}" height="${ph}" fill="#ed996b" opacity=".16"><title>Parada: ${esc(e.name)}</title></rect>`;}
 for(const e of events){const a=Math.max(from,e.start),b=Math.min(to,e.end);if(b>a)s+=`<rect x="${x(a)}" y="${m.t}" width="${Math.max(.7,x(b)-x(a))}" height="${ph}" fill="#b74e38" opacity=".14"/>`;}
 for(const value of [...new Set([0,Math.round(capacity/2),capacity])])s+=`<line x1="${m.l}" x2="${width-m.r}" y1="${y(value)}" y2="${y(value)}" stroke="#e7ecee"/><text x="${m.l-6}" y="${y(value)+3}" text-anchor="end">${value}</text>`;
 for(const [value,color,dash] of [[minimum,'#a58647','4 3'],[maximum,'#8a969d','2 3']])s+=`<line x1="${m.l}" x2="${width-m.r}" y1="${y(value)}" y2="${y(value)}" stroke="${color}" stroke-dasharray="${dash}"/>`;
 if(points.length){
  const upper=points.map(p=>`${x(p.t).toFixed(2)},${y(p.max).toFixed(2)}`),lower=[...points].reverse().map(p=>`${x(p.t).toFixed(2)},${y(p.min).toFixed(2)}`);
  s+=`<path d="M${upper.join(' L')} L${lower.join(' L')} Z" fill="#c0ff00" opacity=".25"/>`;
  let d=`M${x(points[0].t).toFixed(2)},${y(points[0].value).toFixed(2)}`;
  for(const p of points.slice(1))d+=` H${x(p.t).toFixed(2)} V${y(p.value).toFixed(2)}`;
  s+=`<path d="${d}" fill="none" stroke="#000102" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
 }
 for(const [t,anchor] of [[from,'start'],[(from+to)/2,'middle'],[to,'end']])s+=`<text x="${x(t)}" y="${height-9}" text-anchor="${anchor}">${clock(t)}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Estoque instantâneo de ${esc(name)}, em caixas. Pontilhados indicam mínimo e máximo.">${s}</svg>`;
}

export function createStockMonitor({get:$,download,onSeek}){
 let result=null,indices=[],from=0,to=1,current=null;
 function clear(){result=null;current=null;indices=[];$('instantStocksGrid').innerHTML='';$('instantStockClock').textContent='Instante da reprodução: —';}
 function setData(r,selection,start,end){if(result!==r)current=null;result=r;indices=[...selection];from=start;to=end;paint();}
 function paint(){
  if(!result)return;
  $('instantStockNote').textContent='Estoque em caixas, sem média: '+indices.length+' linhas selecionadas · registro a cada '+result.telemetry.interval+' s · janela '+clock(from)+' a '+clock(to)+'.';
  $('instantStocksGrid').innerHTML=indices.length?indices.map(j=>{const s=result.lines[j];return `<article class="instant-stock-card" data-live-stock="${j}"><div class="instant-line-header"><div><span class="eyebrow">LINHA ${String(j+1).padStart(2,'0')}</span><h4>${esc(s.name)}</h4></div><div class="instant-line-count"><strong data-stock-value>—</strong><span>caixas no ramal</span><span><b data-used-value>—</b> consumidas</span></div></div><div class="instant-line-limits">Mínimo ${s.minimum} · Máximo ${s.maximum} · Capacidade ${s.capacity}</div><div class="instant-mini-chart" data-mini-plot="${j}"></div><div class="instant-line-footer"><span data-stock-status>${s.enabled?'Aguardando reprodução':'Linha desligada'}</span><button type="button" class="text-button" data-view-line="${j}">Ver no layout ↗</button></div></article>`;}).join(''):'<p class="no-analysis-selection">Selecione as linhas para exibir seus gráficos individuais.</p>';
  $('instantStocksGrid').querySelectorAll('[data-mini-plot]').forEach(host=>{
   const j=Number(host.dataset.miniPlot),s=result.lines[j],w=Math.max(260,host.clientWidth||320),m={l:31,r:12};
   const series=stockPoints(result,j,from,to,Math.max(180,Math.round(w*1.5)));
   host.innerHTML=stockSvg({points:series,capacity:s.capacity,minimum:s.minimum,maximum:s.maximum,from,to,name:s.name,release:s.start,width:w,stops:(result.stops||[]).filter(e=>e.target==='main'||(e.target==='trunk'?e.line===s.group:e.line===j)),events:result.shortageEvents.filter(e=>e.line===j&&e.start<to&&e.end>=from)});
   function rowAt(event){const bounds=host.getBoundingClientRect(),t=from+Math.max(0,Math.min(1,(event.clientX-bounds.left-m.l)/(w-m.l-m.r)))*(to-from),rows=result.telemetry.rows;let a=0,b=rows.length-1;while(a<b){const k=(a+b+1)>>1;if(rows[k].t<=t)a=k;else b=k-1;}return rows[a];}
   host.onpointermove=e=>{const row=rowAt(e),tip=$('analyticsTooltip');tip.innerHTML=`<strong>${esc(s.name)} · ${clock(row.t)}</strong><span>Caixas no ramal<b>${row.stock[j]} cx</b></span><span>Mínimo / máximo registrado<b>${row.stockMin?.[j]??row.stock[j]} / ${row.stockMax?.[j]??row.stock[j]} cx</b></span><span>Caixas em trânsito<b>${row.transit[j]} cx</b></span><span>Consumidas até o instante<b>${row.consumed[j]} cx</b></span><small>Clique para localizar no layout</small>`;tip.hidden=false;tip.style.left=Math.max(8,Math.min((globalThis.innerWidth||1100)-270,e.clientX+14))+'px';tip.style.top=Math.max(8,Math.min((globalThis.innerHeight||900)-205,e.clientY+14))+'px';};
   host.onpointerleave=()=>{$('analyticsTooltip').hidden=true;};host.onclick=e=>{const row=rowAt(e);$('analyticsTooltip').hidden=true;onSeek(row.t,j);};
  });
  $('instantStocksGrid').querySelectorAll('[data-view-line]').forEach(b=>b.onclick=()=>onSeek(current?.t??from,Number(b.dataset.viewLine)));
  if(current)updatePlayback(current);
 }
 function updatePlayback(snapshot){
  current=snapshot;if(!result||!snapshot)return;
  $('instantStockClock').textContent='Instante da reprodução: '+clock(snapshot.t)+(snapshot.t<from||snapshot.t>to?' · fora da janela do gráfico':'');
  $('instantStocksGrid').querySelectorAll('[data-live-stock]').forEach(card=>{
   const j=Number(card.dataset.liveStock),s=result.lines[j],value=snapshot.stock[j],inRange=snapshot.t>=from&&snapshot.t<=to;
   card.querySelector('[data-stock-value]').textContent=value;
   card.querySelector('[data-used-value]').textContent=snapshot.consumed[j].toLocaleString('pt-BR');
   card.querySelector('[data-stock-status]').textContent=!s.enabled?'Linha desligada':!snapshot.running[j]?'Aguardando liberação':value===0?'Estoque zerado':'Máquina liberada';
   card.classList.toggle('stock-zero',!!s.enabled&&!!snapshot.running[j]&&value===0);
   const plot=card.querySelector('[data-mini-plot]');plot.classList.toggle('has-current',inRange);if(inRange)plot.style.setProperty('--stock-now',(31+(snapshot.t-from)/(to-from)*(Math.max(260,plot.clientWidth)-43))+'px');
  });
 }
 $('exportInstantStocks').onclick=()=>{if(result&&indices.length)download('torfresma-estoque-instantaneo-por-linha.csv',instantaneousStocksCsv(result,indices,from,to));};
 return {setData,updatePlayback,clear,resize:paint};
}
