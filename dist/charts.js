const format = new Intl.NumberFormat('pt-BR', { maximumFractionDigits:2 });
const ns = 'http://www.w3.org/2000/svg';
const add = (parent, tag, attrs = {}, content) => {
  const el = document.createElementNS(ns,tag);
  for (const [key,value] of Object.entries(attrs)) el.setAttribute(key,value);
  if (content !== undefined) el.textContent = content;
  parent.append(el);
  return el;
};
const stamp = time => {
  const seconds = Math.floor(time);
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(p=>String(p).padStart(2,'0')).join(':');
};

export function drawChart(host, series, rows, axis, onSeek) {
  host.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'chart-empty';
    empty.textContent = 'Execute a simulação para preencher este gráfico.';
    host.append(empty);
    return;
  }
  const width = Math.max(265, Math.round(host.clientWidth) || 580);
  const height = 210, left = 39, right = width-15, top = 13, bottom = 179;
  const from = axis.start, to = Math.max(axis.end,from+1);
  const maxValue = Math.max(1,...rows.flatMap(row=>series.map(line=>line.value(row))));
  const scale = 10 ** Math.floor(Math.log10(maxValue));
  const max = Math.ceil(maxValue/scale*2)*scale/2;
  const x = time => left+(right-left)*(time-from)/(to-from);
  const y = value => bottom-(bottom-top)*value/max;
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  for (const line of series) {
    const item = document.createElement('span');
    const dot = document.createElement('i');
    dot.style.background = line.color;
    item.append(dot,line.name);
    legend.append(item);
  }
  host.append(legend);
  const svg = add(host,'svg',{ viewBox:'0 0 '+width+' '+height, width, height, role:'img', 'aria-label':series.map(l=>l.name).join(', ') });
  for (let grid=0;grid<=4;grid++) {
    const value=max*grid/4;
    add(svg,'line',{x1:left,x2:right,y1:y(value),y2:y(value),stroke:'#e0e8e5'});
    add(svg,'text',{x:left-6,y:y(value)+3,'text-anchor':'end',class:'chart-label'},format.format(value));
    const t=from+(to-from)*grid/4;
    if (grid%2===0 || width > 370) add(svg,'text',{x:x(t),y:199,'text-anchor':grid===0?'start':grid===4?'end':'middle',class:'chart-label'},stamp(t).slice(0,5));
  }
  for (const line of series) {
    const points = rows.map(row => x(row.time)+','+y(line.value(row)));
    if (points.length===1 || line.dash) points.unshift(x(from)+','+y(line.value(rows[0])));
    add(svg,'polyline',{points:points.join(' '),fill:'none',stroke:line.color,'stroke-width':line.dash?1.4:2,'stroke-dasharray':line.dash?'6 4':'none','stroke-linejoin':'round'});
  }
  const cursor = add(svg,'line',{x1:x(axis.cursor),x2:x(axis.cursor),y1:top,y2:bottom,stroke:'#889e98','stroke-dasharray':'3 4',visibility:axis.cursor>=from&&axis.cursor<=to?'visible':'hidden',class:'chart-cursor'});
  const hover = add(svg,'line',{x1:left,x2:left,y1:top,y2:bottom,stroke:'#28353d',visibility:'hidden'});
  const tooltip = document.createElement('output');
  tooltip.className='chart-tooltip';
  tooltip.hidden=true;
  host.append(tooltip);
  svg.addEventListener('pointermove',event => {
    const bounds=svg.getBoundingClientRect();
    const pixel=(event.clientX-bounds.left)*width/bounds.width;
    const t=from+(pixel-left)*(to-from)/(right-left);
    const row=rows.reduce((best,r)=>Math.abs(r.time-t)<Math.abs(best.time-t)?r:best,rows[0]);
    hover.setAttribute('x1',x(row.time));
    hover.setAttribute('x2',x(row.time));
    hover.setAttribute('visibility','visible');
    tooltip.hidden=false;
    tooltip.textContent=stamp(row.time)+' · '+series.map(l=>l.name+' '+format.format(l.value(row))).join(' · ');
  });
  svg.addEventListener('pointerleave',() => { hover.setAttribute('visibility','hidden'); tooltip.hidden=true; });
  svg.addEventListener('click',event => {
    const bounds=svg.getBoundingClientRect();
    const pixel=(event.clientX-bounds.left)*width/bounds.width;
    onSeek(Math.round(Math.max(from,Math.min(to,from+(pixel-left)*(to-from)/(right-left)))));
  });
  return time => {
    cursor.setAttribute('x1',x(time));
    cursor.setAttribute('x2',x(time));
    cursor.setAttribute('visibility',time>=from&&time<=to?'visible':'hidden');
  };
}
