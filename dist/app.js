import { BOX, SCALE, groups, inlet, pointAt, stations } from './layout.js';
import { DEFAULTS, Simulator, STEP } from './model.js';
import { analyze, SAMPLE_STEP, sample } from './analytics.js';
import { drawChart } from './charts.js';

const $ = id => document.getElementById(id);
const n = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const canvas = $('layout');
const ctx = canvas.getContext('2d');
const form = $('settings-form');
const views = { all:[55,62,1855,1210], inlet:[1595,1047,315,231] };
let sim = new Simulator();
let view = 'all';
let mode = 'idle';
let previousFrame = 0;
let carry = 0;
let lastRender = -Infinity;
let samples = [sample(sim)];
let recordedShortages = [];
let seekTo = 0;
let recordedTick = 0;
let selectedMachine = null;
let lastChartFrame = -Infinity;
let chartCursors = [];
let saved = [];
try { saved = JSON.parse(localStorage.getItem('natura-simulacao-ii-scenarios') || '[]'); } catch {}
if (!Array.isArray(saved)) saved = [];

const routeRows = groups.map(group => {
  const row = document.createElement('div');
  row.className = 'route ' + group.name.toLowerCase();
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = group.name;
  const value = document.createElement('span');
  row.append(name, value);
  $('routes').append(row);
  return value;
});

const machineRows = stations.map((station, index) => {
  const row = $('machine-rows').insertRow();
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = station.name;
  button.onclick = () => {
    $('analysis-line').value = String(index);
    applyAnalysisFilter();
    $('map-panel').scrollIntoView({ block:'nearest' });
  };
  row.insertCell().append(button);
  const option = document.createElement('option');
  option.value = index;
  option.textContent = station.name;
  $('analysis-line').append(option);
  row.insertCell().textContent = groups[station.group].name;
  const cells = Array.from({ length: 4 }, () => row.insertCell());
  const field = document.createElement('label');
  field.textContent = station.name;
  const input = document.createElement('input');
  Object.assign(input, { type:'number', min:'0', max:'60', step:'any', required:true, name:'rate-' + index });
  field.append(input);
  $('rate-fields').append(field);
  return { row, cells };
});

function routeLine(route, color, width, dash = []) {
  ctx.beginPath();
  ctx.setLineDash(dash);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  route.points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBox(route, position, transverse = false) {
  const [x, y, angle] = pointAt(route, position);
  const size = view === 'all' ? 1.14 : 1;
  const length = BOX.length / SCALE * size;
  const width = BOX.width / SCALE * size;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + (transverse ? Math.PI/2 : 0));
  ctx.fillStyle = '#c0ff00';
  ctx.strokeStyle = '#4e711a';
  ctx.lineWidth = view === 'all' ? 1.3 : .48;
  ctx.fillRect(-length/2, -width/2, length, width);
  ctx.strokeRect(-length/2, -width/2, length, width);
  ctx.restore();
}

function label(text, x, y, color, size, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = '700 ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ratio = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(rect.width * ratio);
  const h = Math.round(rect.height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,rect.width,rect.height);
  ctx.fillStyle = '#313b41';
  for (let x = 12; x < rect.width; x += 18) {
    for (let y = 12; y < rect.height; y += 18) ctx.fillRect(x,y,1.15,1.15);
  }
  const [x, y, width, height] = views[view];
  const zoom = Math.min((rect.width - 20) / width, (rect.height - 20) / height);
  if (zoom <= 0) return;
  ctx.save();
  ctx.translate((rect.width - width * zoom) / 2 - x * zoom, (rect.height - height * zoom) / 2 - y * zoom);
  ctx.scale(zoom,zoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = view === 'all' ? 15 : 10;
  for (const group of sim.groups) {
    routeLine(group.route, group.name === 'Superior' ? '#77bcdf' : '#dfab69', stroke);
    routeLine(group.route, '#222e37', stroke * .60);
  }
  for (const station of sim.stations) {
    routeLine(station.route, station.active ? (station.group === 0 ? '#77bcdf' : '#dfab69') : '#596870', stroke * .64, station.active ? [] : [13,9]);
    const [mx,my] = station.route.points.at(-1);
    ctx.fillStyle = station.active ? (station.group === 0 ? '#77bcdf' : '#dfab69') : '#596870';
    ctx.beginPath();
    ctx.arc(mx,my,view === 'all' ? 9 : 4,0,2 * Math.PI);
    ctx.fill();
  }
  const [[ex,ey],[sx,sy]] = inlet.points;
  routeLine({ points:[[sx,1110],[sx,1130]] }, '#75939f', stroke);
  routeLine(inlet, '#75939f', stroke + 3);
  routeLine(inlet, '#27343a', stroke * .48);
  for (const group of sim.groups) {
    for (const box of group.boxes) drawBox(group.route,box.position);
  }
  for (const station of sim.stations) {
    for (const box of station.boxes) drawBox(station.route,box.position);
    for (let i = 0; i < station.stock; i++) drawBox(station.route,station.route.length - BOX.length * (i + .5));
  }
  for (const box of sim.main) drawBox(inlet,box.position,true);
  if (!sim.time && view === 'inlet') {
    drawBox(inlet,inlet.length * .54,true);
    for (const group of sim.groups) drawBox(group.route,BOX.length * 2.2);
  }
  ctx.fillStyle = sim.blocked ? '#ee986d' : '#a2c3cd';
  ctx.beginPath();
  ctx.arc(ex,ey,view === 'all' ? 9 : 3,0,2 * Math.PI);
  ctx.fill();
  if (view === 'all') {
    const fontSize = Math.max(24, 12 / zoom);
    label('Ramal superior', 350,395,'#95d2ed',fontSize);
    label('Ramal inferior', 350,870,'#f4ba78',fontSize);
    label('Entrada', ex-3,1070,'#b3d4de',fontSize,'right');
  } else {
    label('Entrada', ex,1084,'#b3d4de',12,'right');
    label('Superior', 1766,1059,'#95d2ed',10,'right');
    label('Inferior', 1746,1241,'#f4ba78',10,'right');
    label('1.663,8 mm', 1824,1094,'#95d2ed',8,'right');
    label('3.128,7 mm', 1824,1147,'#f4ba78',8,'right');
  }
  ctx.restore();
}

function setText(id, value) {
  const el = $(id);
  if (el.textContent !== value) el.textContent = value;
}

function clock(time) {
  const seconds = Math.floor(time);
  return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(part => String(part).padStart(2,'0')).join(':');
}

function render() {
  const totals = sim.totals();
  const demand = sim.groups.reduce((sum, group) => sum + group.demand, 0);
  const sent = sim.groups.reduce((sum, group) => sum + group.sent, 0);
  const share = sent ? 100 * sim.groups[0].sent / sent : 50;
  setText('total-demand',decimal.format(demand));
  setText('total-used',n.format(totals.used));
  setText('total-system',n.format(totals.inSystem));
  setText('total-missed',n.format(totals.missed));
  setText('clock',clock(sim.time));
  $('timeline').max = Math.round(sim.config.hours * 3600);
  if (mode !== 'seek' && !timelineDragging) $('timeline').value = Math.round(sim.time);
  setText('total-clock','/ ' + clock(sim.config.hours * 3600));
  chartCursors.forEach(update => update?.(sim.time));
  setText('phase',sim.config.warmup > 0 && sim.time < sim.config.warmup ? 'Partida 50/50' : 'Prioridade por consumo');
  setText('status',sim.blocked && mode === 'play' ? 'Entrada em espera' : ({ idle:'Pronto', play:'Simulando', pause:'Pausado', batch:'Calculando', seek:'Buscando instante', done:'Concluído' })[mode]);
  setText('play',mode === 'play' ? 'Pausar' : mode === 'pause' ? 'Retomar' : mode === 'done' ? 'Reproduzir' : 'Iniciar');
  setText('finish',mode === 'batch' ? 'Pausar cálculo' : '▶　Simular produção');
  $('play').disabled = mode === 'batch' || mode === 'seek';
  $('export-history').disabled = samples.length < 2;
  $('split-upper').style.width = share + '%';
  setText('upper-share',Math.round(share) + '% superior');
  setText('lower-share',Math.round(100 - share) + '% inferior');
  setText('redirected',n.format(sim.redirected));
  setText('held',decimal.format(Math.round(sim.heldSeconds * 10) / 10) + ' s');
  sim.groups.forEach((group, i) => {
    routeRows[i].textContent = n.format(group.sent) + ' enviadas · ' + decimal.format(group.demand) + ' cx/min';
  });
  sim.stations.forEach((station, index) => {
    const {row,cells} = machineRows[index];
    row.classList.toggle('inactive',!station.active);
    const values = station.active ? [decimal.format(station.rate),n.format(station.used),station.stock + ' / ' + station.capacity,n.format(station.missed)] : ['Inativa','—','—','—'];
    values.forEach((value, i) => { if (cells[i].textContent !== value) cells[i].textContent = value; });
  });
  $('map-stock').hidden = selectedMachine === null || view !== 'all';
  if (selectedMachine !== null) {
    const station = sim.stations[selectedMachine];
    setText('map-stock-name',station.name);
    setText('map-stock-value',station.stock + ' / ' + station.capacity + ' caixas');
  }
  $('error').hidden = totals.conserved;
  if (!totals.conserved) $('error').textContent = 'A contagem de caixas no sistema ficou inconsistente.';
  draw();
}

let timelineDragging = false;

function setMode(next) {
  mode = next;
  carry = 0;
  lastRender = -Infinity;
  render();
}

function runTo(target) {
  while (sim.tick < target) {
    const nextSample = (Math.floor(sim.tick / SAMPLE_STEP) + 1) * SAMPLE_STEP;
    sim.advance(Math.min(nextSample,target) - sim.tick);
    if (sim.tick <= recordedTick) continue;
    recordedTick = sim.tick;
    recordedShortages = sim.shortages;
    if (sim.tick % SAMPLE_STEP === 0) samples.push(sample(sim));
  }
}

function seek(seconds) {
  timelineDragging = false;
  seekTo = Math.min(Math.round(sim.config.hours * 3600 / STEP),Math.max(0,Math.round(seconds / STEP)));
  if (seekTo < sim.tick) sim = new Simulator(sim.config);
  $('timeline').value = Math.round(seekTo * STEP);
  setMode('seek');
}

function animate(frame) {
  const elapsed = previousFrame ? Math.min(100,frame-previousFrame)/1000 : 0;
  previousFrame = frame;
  let steps = 0;
  if (mode === 'play') {
    carry += elapsed * Number($('speed').value) / STEP;
    steps = Math.floor(carry);
    carry -= steps;
  } else if (mode === 'batch' || mode === 'seek') {
    steps = 6000;
  }
  if (steps) {
    const end = Math.round(sim.config.hours * 3600 / STEP);
    const target = mode === 'seek' ? seekTo : end;
    runTo(Math.min(target,sim.tick + steps));
    if (sim.tick >= target) {
      if (sim.tick === end && samples.at(-1).time < sim.time) samples.push(sample(sim));
      setMode(sim.tick === end ? 'done' : 'pause');
      renderAnalysis();
    } else if (frame - lastRender >= (mode === 'play' ? 45 : 180)) {
      lastRender = frame;
      render();
    }
    if (frame - lastChartFrame >= 900 && samples.at(-1).time !== lastChartTime) {
      lastChartFrame = frame;
      renderAnalysis();
    }
  }
  requestAnimationFrame(animate);
}

let lastChartTime = -1;
function analysisSelection() {
  const selection = $('analysis-line').value;
  const group = selection === 'upper' ? 0 : selection === 'lower' ? 1 : null;
  const machine = ['all','upper','lower'].includes(selection) ? null : Number(selection);
  const indices = sim.stations.flatMap((s,i) =>
    (machine !== null ? machine === i : group === null || group === s.group) && s.active ? [i] : []
  );
  return { indices, machine, groupIndices: machine !== null ? [sim.stations[machine].group] : group === null ? [0,1] : [group] };
}

function renderAnalysis() {
  const { indices, machine, groupIndices } = analysisSelection();
  const interval = Number($('analysis-interval').value);
  const windowSize = Number($('analysis-window').value)*60;
  const end = samples.at(-1).time;
  const desiredStart = windowSize ? Math.max(0,end-windowSize) : 0;
  const from = Math.max(0,samples.findIndex(row=>row.time>=desiredStart));
  const rows = samples.slice(from);
  const data = analyze(rows,indices,groupIndices,interval);
  lastChartTime = end;
  const demand = indices.reduce((sum,i)=>sum+sim.stations[i].rate,0);
  const used = data.reduce((sum,row)=>sum+row.used,0);
  const missed = data.reduce((sum,row)=>sum+row.missed,0);
  setText('analysis-demand',decimal.format(demand)+' cx/min');
  setText('analysis-used',data.length?n.format(used):'—');
  setText('analysis-missed',data.length?n.format(missed):'—');
  setText('analysis-service',used+missed?decimal.format(100*used/(used+missed))+'%':'—');

  const axis = { start:rows[0].time,end,cursor:sim.time };
  const teal = '#087b69', slate = '#435b73', orange = '#a95b2a';
  const line=(name,key,color)=>({name,value:r=>r[key],color});
  const charts = [
    ['chart-rate', [line('Consumo','rate',teal),{ name:'Demanda',value:()=>demand,color:slate,dash:true }]],
    ['chart-missed', [line('Faltas','missed',orange)]],
    ['chart-stock', machine === null ? [line('Principal','main',slate),line('Em trânsito nos ramais','inTransit',orange),line('Estoque das máquinas','stock',teal)] : [line('Estoque da máquina','stock',teal)]],
    ['chart-feed', machine === null ? [line('Alimentação na entrada','feed',slate),line('Chegadas às máquinas selecionadas','received',teal)] : [line('Chegadas à máquina','received',teal)]]
  ];
  chartCursors = charts.map(([id,series])=>drawChart($(id),series,data,axis,seek));
  const names = new Set(indices.map(i=>sim.stations[i].name));
  const gaps = recordedShortages.filter(gap=>names.has(gap.station) && (gap.resumed ?? end)>=desiredStart);
  setText('shortage-count',n.format(gaps.length));
  const table = $('shortage-rows');
  table.replaceChildren();
  for (const gap of gaps.slice(-100).reverse()) {
    const row = table.insertRow();
    const values = [gap.station,clock(gap.start),gap.resumed === null ? 'Em aberto' : clock(gap.resumed),n.format(gap.count)];
    for (const value of values) row.insertCell().textContent=value;
  }
  if (!gaps.length) {
    const cell = table.insertRow().insertCell();
    cell.colSpan=4;
    cell.textContent = 'Nenhuma falta registrada na seleção.';
  }
}

function applyAnalysisFilter() {
  selectedMachine = analysisSelection().machine;
  render();
  renderAnalysis();
}

function updateRanges() {
  for (const name of ['mainInitial','branchInitial']) setText(name+'-value',form.elements[name].value+'%');
  for (const button of document.querySelectorAll('[data-stock]')) {
    button.setAttribute('aria-pressed',String(['mainInitial','branchInitial'].every(name=>form.elements[name].value===button.dataset.stock)));
  }
}

function fillForm(config) {
  for (const key of Object.keys(DEFAULTS)) form.elements[key].value = config[key];
  stations.forEach((station,index) => { form.elements['rate-'+index].value=config.rates?.[index] ?? station.rate; });
  updateRanges();
}

function readConfig() {
  const data = new FormData(form);
  return {
    ...Object.fromEntries(Object.keys(DEFAULTS).map(key=>[key,data.get(key)])),
    rates: stations.map((_,index)=>Number(data.get('rate-'+index)))
  };
}

function newRun(config,next) {
  sim = new Simulator(config);
  recordedTick = 0;
  samples = [sample(sim)];
  recordedShortages = [];
  setMode(next);
  renderAnalysis();
}

$('play').onclick = () => {
  if (mode === 'done') {
    sim = new Simulator(sim.config);
    setMode('play');
  } else setMode(mode === 'play' ? 'pause' : 'play');
};
$('reset').onclick = () => newRun(sim.config,'idle');
$('defaults').onclick = () => fillForm(DEFAULTS);
form.addEventListener('input',updateRanges);
form.onsubmit = event => {
  event.preventDefault();
  if (mode === 'batch') { setMode('pause'); return; }
  try {
    newRun(readConfig(),'batch');
    $('config-error').hidden=true;
  } catch (error) {
    $('config-error').hidden=false;
    setText('config-error',error.message);
  }
};
for (const button of document.querySelectorAll('[data-hours]')) button.onclick=()=>{form.elements.hours.value=button.dataset.hours;};
for (const button of document.querySelectorAll('[data-stock]')) button.onclick=()=>{
  form.elements.mainInitial.value=button.dataset.stock;
  form.elements.branchInitial.value=button.dataset.stock;
  updateRanges();
};
for (const button of document.querySelectorAll('[data-view]')) button.onclick=()=>{
  view=button.dataset.view;
  for (const control of document.querySelectorAll('[data-view]')) control.setAttribute('aria-pressed',String(control===button));
  setText('map-caption',view==='all'?'Simulação 2D · vista superior':'Detalhe da alimentação e da divisão');
  render();
};
$('fullscreen').onclick=()=>{
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  else $('map-panel').requestFullscreen?.().catch(()=>{});
};
$('timeline').oninput=()=>{
  timelineDragging=true;
  setText('clock',clock(Number($('timeline').value)));
  if (mode === 'seek' || mode === 'play' || mode === 'batch') setMode('pause');
};
$('timeline').onchange=()=>seek(Number($('timeline').value));
$('analysis-line').onchange=applyAnalysisFilter;
$('analysis-interval').onchange=renderAnalysis;
$('analysis-window').onchange=renderAnalysis;

function exportCSV(name,data) {
  const csv=data.map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

$('export').onclick=()=>exportCSV('simulacao-ii-producao.csv',[
  ['Máquina','Ramal','Ativa','Demanda (cx/min)','Consumidas','Estoque','Faltas'],
  ...sim.stations.map(s=>[s.name,groups[s.group].name,s.active?'Sim':'Não',decimal.format(s.active?s.rate:0),s.used,s.stock,s.missed])
]);
$('export-history').onclick=()=>{
  const {indices,groupIndices}=analysisSelection();
  exportCSV('simulacao-ii-historico.csv',[
    ['Fim do intervalo','Consumo (cx/min)','Consumidas','Faltas','Estoque das máquinas','Principal','Em trânsito nos ramais','Entrada (cx/min)','Chegadas (cx/min)'],
    ...analyze(samples,indices,groupIndices,Number($('analysis-interval').value)).map(r=>[
      clock(r.time),decimal.format(r.rate),r.used,r.missed,r.stock,r.main,r.inTransit,decimal.format(r.feed),decimal.format(r.received)
    ])
  ]);
};

const scenarioDialog=$('scenarios-dialog');
function updateSaved() { setText('saved-count',String(saved.length)); }
function showScenarios() {
  const list=$('scenario-list');
  list.replaceChildren();
  if (!saved.length) { list.textContent='Salve um cenário para comparar os resultados.'; return; }
  const wrap=document.createElement('div'); wrap.className='table-wrap';
  const table=document.createElement('table');
  const header=table.createTHead().insertRow();
  for (const label of ['Cenário','Tempo','Consumidas','Faltas','Ações']) {
    const cell=document.createElement('th'); cell.textContent=label; header.append(cell);
  }
  const body=table.createTBody();
  saved.forEach((scenario,index)=>{
    const row=body.insertRow();
    for (const value of [scenario.name,clock(scenario.time),n.format(scenario.used),n.format(scenario.missed)]) row.insertCell().textContent=value;
    const actions=row.insertCell();
    for (const [label,action] of [
      ['Carregar',()=>{fillForm(scenario.config);newRun(scenario.config,'idle');scenarioDialog.close();}],
      ['Remover',()=>{saved.splice(index,1);persistScenarios();showScenarios();}]
    ]) {
      const button=document.createElement('button');button.className='button';button.textContent=label;button.onclick=action;actions.append(button);
    }
  });
  wrap.append(table);list.append(wrap);
}
function persistScenarios() {
  try { localStorage.setItem('natura-simulacao-ii-scenarios',JSON.stringify(saved)); } catch {}
  updateSaved();
}
$('save-scenario').onclick=()=>{
  const {used,missed}=sim.totals();
  saved.unshift({name:'Cenário '+new Date().toLocaleString('pt-BR'),config:sim.config,time:sim.time,used,missed});
  saved=saved.slice(0,20);
  persistScenarios();showScenarios();scenarioDialog.showModal();
};
$('compare-scenarios').onclick=()=>{showScenarios();scenarioDialog.showModal();};
$('close-scenarios').onclick=()=>scenarioDialog.close();

new ResizeObserver(draw).observe(canvas);
const chartResize = new ResizeObserver(()=>renderAnalysis());
chartResize.observe(document.querySelector('.analysis-controls'));
fillForm(sim.config);
updateSaved();
render();
renderAnalysis();
requestAnimationFrame(animate);
