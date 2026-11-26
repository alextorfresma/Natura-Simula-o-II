const SIDE_COLORS=['#2d7693','#a7611c'];
const integer=new Intl.NumberFormat('pt-BR');
const decimal=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const clock=seconds=>{
 const whole=Math.floor(seconds);
 return [Math.floor(whole/3600),Math.floor(whole/60)%60,whole%60].map(n=>String(n).padStart(2,'0')).join(':');
};

function countUntil(times,seconds){
 let low=0,high=times.length;
 while(low<high){
  const mid=(low+high)>>1;
  if(times[mid]<=seconds+1e-8)low=mid+1;
  else high=mid;
 }
 return low;
}

export function distributionAt(diversions,seconds){
 return diversions.map(times=>{
  const total=countUntil(times,seconds);
  return {total,recent:total-countUntil(times,seconds-60)};
 });
}

export function createDistributor({get:$,onSeek}){
 const panel=$('distributorPanel'),card=$('distributorReadout'),host=$('distributorChart'),tooltip=$('analyticsTooltip');
 let result=null,marker=null,chart=null,current=0;
 function update(seconds){
  if(!result)return;
  current=Math.max(0,Math.min(result.duration,seconds));
  const [upper,lower]=distributionAt(result.diversions,current);
  const values={
   distributorClock:clock(current),distributorTotal:integer.format(upper.total+lower.total),
   distributorUpperTotal:integer.format(upper.total),distributorLowerTotal:integer.format(lower.total),
   distributorUpperRecent:integer.format(upper.recent),distributorLowerRecent:integer.format(lower.recent)
  };
  for(const [id,value] of Object.entries(values))if($(id).textContent!==value)$(id).textContent=value;
  if(marker&&chart){
   const x=(chart.left+chart.span*current/result.duration).toFixed(1);
   marker.setAttribute('x1',x);marker.setAttribute('x2',x);
  }
 }
 function resize(){
  if(!result)return;
  const width=Math.max(260,host.clientWidth||650),height=170,left=44,right=width-16,top=14,bottom=131,span=right-left;
  const interval=Math.max(60,Math.ceil(result.duration/(480*60))*60);
  const periods=[];
  let before=[0,0];
  for(let start=0;start<result.duration;start+=interval){
   const end=Math.min(start+interval,result.duration);
   const counts=result.diversions.map(times=>countUntil(times,end));
   const boxes=counts.map((n,i)=>n-before[i]);
   periods.push({start,end,boxes,rate:boxes.map(count=>count*60/(end-start))});
   before=counts;
  }
  const maximum=periods.reduce((m,p)=>Math.max(m,...p.rate),1);
  const topRate=maximum<=2?2:Math.ceil(maximum/10)*10;
  const x=t=>left+span*t/result.duration,y=rate=>bottom-(bottom-top)*rate/topRate;
  const grid=[0,topRate/2,topRate].map(rate=>'<line x1="'+left+'" x2="'+right+'" y1="'+y(rate)+'" y2="'+y(rate)+'" stroke="#e6ebed"/><text x="'+(left-7)+'" y="'+(y(rate)+4)+'" text-anchor="end">'+integer.format(rate)+'</text>').join('');
  const ticks=width<450?[0,.5,1]:[0,.25,.5,.75,1];
  const times=ticks.map(f=>'<text x="'+x(f*result.duration)+'" y="155" text-anchor="'+(f===0?'start':f===1?'end':'middle')+'">'+clock(f*result.duration)+'</text>').join('');
  const lines=SIDE_COLORS.map((color,i)=>{
   const d=periods.map((p,j)=>(j?' V':'M'+x(p.start).toFixed(2)+',')+y(p.rate[i]).toFixed(2)+' H'+x(p.end).toFixed(2)).join('');
   return '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="1.7"/>';
  }).join('');
  host.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Desvios para o ramal superior e inferior em caixas por minuto">'+grid+times+lines+'<line data-playhead x1="'+left+'" x2="'+left+'" y1="'+top+'" y2="'+bottom+'" stroke="#29353d" stroke-dasharray="3 3"/></svg>';
  chart={left,span,width,interval,periods};
  marker=host.querySelector?.('[data-playhead]');
  $('distributorInterval').textContent='Média em caixas/min por intervalo de '+integer.format(interval/60)+' min. Clique no gráfico para ir ao instante.';
  update(current);
 }
 function setResult(next){
  if(chart)hideTooltip();
  result=next?.diversions?next:null;
  panel.hidden=card.hidden=!result;
  current=0;chart=null;marker=null;
  if(result)resize();
  else host.innerHTML='';
 }
 function anchor(x,y,width,height){
  if(!result)return;
  const boxWidth=card.offsetWidth||216,boxHeight=card.offsetHeight||125;
  card.hidden=x<0||x>width||y<0||y>height;
  if(card.hidden)return;
  const left=Math.max(8,Math.min(width-boxWidth-8,x-boxWidth-15));
  card.style.left=left+'px';
  card.style.top=Math.max(8,Math.min(height-boxHeight-30,y-boxHeight-12))+'px';
 }
 function timeAt(event){
  const bounds=host.getBoundingClientRect();
  const pixel=(event.clientX-bounds.left)*chart.width/(bounds.width||chart.width);
  return Math.max(0,Math.min(1,(pixel-chart.left)/chart.span))*result.duration;
 }
 function hideTooltip(){
  tooltip.hidden=true;
  host.classList.remove('hovering');
 }
 host.onpointermove=event=>{
  if(!result||!chart)return;
  const time=timeAt(event),period=chart.periods[Math.min(chart.periods.length-1,Math.floor(time/chart.interval))];
  const totals=period.boxes.reduce((sum,count)=>sum+count,0);
  const rows=['Superior','Inferior'].map((side,i)=>
   '<span>'+side+'<b>'+integer.format(period.boxes[i])+' cx · '+decimal.format(period.rate[i])+' cx/min</b></span>'
  ).join('');
  tooltip.innerHTML='<strong>'+clock(period.start)+' → '+clock(period.end)+'</strong>'+rows+
   '<span>Total desviado<b>'+integer.format(totals)+' cx</b></span><small>Clique para localizar no mapa</small>';
  tooltip.hidden=false;
  const width=tooltip.offsetWidth||276,height=tooltip.offsetHeight||154;
  tooltip.style.left=Math.max(8,Math.min((globalThis.innerWidth||1100)-width-8,event.clientX+14))+'px';
  tooltip.style.top=Math.max(8,Math.min((globalThis.innerHeight||900)-height-8,event.clientY+14))+'px';
  const displayedWidth=host.getBoundingClientRect().width||chart.width;
  const cursor=(chart.left+chart.span*time/result.duration)*displayedWidth/chart.width;
  host.style.setProperty?.('--chart-cursor',cursor+'px');
  host.classList.add('hovering');
 };
 host.onpointerleave=hideTooltip;
 host.onclick=event=>{
  if(!result||!chart)return;
  hideTooltip();
  onSeek(timeAt(event));
 };
 return {setResult,update,anchor,resize};
}
