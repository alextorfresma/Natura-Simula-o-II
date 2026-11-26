import { BOX, SCALE, groups, inlet, pointAt, stations } from './layout.js';
import { DEFAULTS, Simulator, STEP } from './model.js';

const $ = id => document.getElementById(id);
const n = new Intl.NumberFormat('pt-BR');
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const canvas = $('layout');
const ctx = canvas.getContext('2d');
const dialog = $('settings');
const form = $('settings-form');
const views = { all:[55,62,1855,1210], inlet:[1595,1047,315,231] };
let sim = new Simulator();
let view = 'all';
let mode = 'idle';
let previousFrame = 0;
let carry = 0;
let lastRender = -Infinity;
let resumeMode = null;

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
  row.insertCell().textContent = station.name;
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
  ctx.fillStyle = '#b4ee29';
  ctx.strokeStyle = '#456115';
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
  ctx.fillStyle = '#d8e6df';
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
    routeLine(group.route, group.color, stroke);
    routeLine(group.route, group.tint, stroke * .52);
  }
  for (const station of sim.stations) {
    const group = groups[station.group];
    routeLine(station.route, station.active ? group.color : '#91a49b', stroke * .64, station.active ? [] : [13,9]);
    const [mx,my] = station.route.points.at(-1);
    ctx.fillStyle = station.active ? group.color : '#91a49b';
    ctx.beginPath();
    ctx.arc(mx,my,view === 'all' ? 9 : 4,0,2 * Math.PI);
    ctx.fill();
  }
  const [[ex,ey],[sx,sy]] = inlet.points;
  routeLine({ points:[[sx,1110],[sx,1130]] }, '#435d54', stroke);
  routeLine(inlet, '#435d54', stroke + 3);
  routeLine(inlet, '#c8d9d2', stroke * .48);
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
  ctx.fillStyle = sim.blocked ? '#aa321a' : '#304d43';
  ctx.beginPath();
  ctx.arc(ex,ey,view === 'all' ? 9 : 3,0,2 * Math.PI);
  ctx.fill();
  if (view === 'all') {
    const fontSize = Math.max(24, 12 / zoom);
    label('Ramal superior', 350,395,groups[0].color,fontSize);
    label('Ramal inferior', 350,870,groups[1].color,fontSize);
    label('Entrada', ex-3,1070,'#304d43',fontSize,'right');
  } else {
    label('Entrada', ex,1084,'#304d43',12,'right');
    label('Superior', 1766,1059,groups[0].color,10,'right');
    label('Inferior', 1746,1241,groups[1].color,10,'right');
    label('1.663,8 mm', 1824,1094,groups[0].color,8,'right');
    label('3.128,7 mm', 1824,1147,groups[1].color,8,'right');
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
  $('progress').value = Math.min(100,100 * sim.time / (sim.config.hours * 3600));
  setText('phase',sim.config.warmup > 0 && sim.time < sim.config.warmup ? 'Partida 50/50' : 'Prioridade por consumo');
  setText('status',sim.blocked && mode === 'play' ? 'Entrada em espera' : ({ idle:'Pronto', play:'Simulando', pause:'Pausado', batch:'Calculando', done:'Concluído' })[mode]);
  setText('play',mode === 'play' ? 'Pausar' : mode === 'pause' ? 'Retomar' : 'Iniciar');
  setText('finish',mode === 'batch' ? 'Pausar cálculo' : 'Simular até o fim');
  $('play').disabled = mode === 'done' || mode === 'batch';
  $('finish').disabled = mode === 'done';
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
  $('error').hidden = totals.conserved;
  if (!totals.conserved) $('error').textContent = 'A contagem de caixas no sistema ficou inconsistente.';
  draw();
}

function setMode(next) {
  mode = next;
  carry = 0;
  lastRender = -Infinity;
  render();
}

function animate(frame) {
  const elapsed = previousFrame ? Math.min(100,frame-previousFrame)/1000 : 0;
  previousFrame = frame;
  let steps = 0;
  if (mode === 'play') {
    carry += elapsed * Number($('speed').value) / STEP;
    steps = Math.floor(carry);
    carry -= steps;
  } else if (mode === 'batch') {
    steps = 4500;
  }
  if (steps) {
    if (sim.advance(steps)) setMode('done');
    else if (frame - lastRender >= (mode === 'batch' ? 130 : 30)) {
      lastRender = frame;
      render();
    }
  }
  requestAnimationFrame(animate);
}

function fillForm(config) {
  for (const key of Object.keys(DEFAULTS)) form.elements[key].value = config[key];
  stations.forEach((station, index) => { form.elements['rate-' + index].value = config.rates?.[index] ?? station.rate; });
}

$('play').onclick = () => setMode(mode === 'play' ? 'pause' : 'play');
$('finish').onclick = () => setMode(mode === 'batch' ? 'pause' : 'batch');
$('reset').onclick = () => { sim = new Simulator(sim.config); setMode('idle'); };
document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => {
    view = button.dataset.view;
    document.querySelectorAll('[data-view]').forEach(control => control.setAttribute('aria-pressed',String(control === button)));
    setText('map-caption',view === 'all' ? 'Vista superior · Layout 03' : 'Detalhe da alimentação e da divisão');
    draw();
  };
});
$('config-open').onclick = () => {
  resumeMode = ['play','batch'].includes(mode) ? mode : null;
  if (resumeMode) setMode('pause');
  fillForm(sim.config);
  $('config-error').hidden = true;
  dialog.showModal();
};
$('config-close').onclick = () => dialog.close();
$('defaults').onclick = () => fillForm(DEFAULTS);
dialog.addEventListener('close',() => {
  if (resumeMode) setMode(resumeMode);
  resumeMode = null;
});
form.onsubmit = event => {
  event.preventDefault();
  const config = Object.fromEntries(new FormData(form));
  config.rates = stations.map((_, index) => config['rate-' + index]);
  try {
    const { feed, mainSpeed, branchSpeed, cycle, warmup, hours, alternative, rates } = config;
    sim = new Simulator({ feed, mainSpeed, branchSpeed, cycle, warmup, hours, alternative, rates });
    resumeMode = null;
    dialog.close();
    setMode('idle');
  } catch (error) {
    $('config-error').hidden = false;
    $('config-error').textContent = error.message;
  }
};

$('export').onclick = () => {
  const data = [['Máquina','Ramal','Ativa','Demanda (cx/min)','Consumidas','Estoque','Faltas'], ...sim.stations.map(station => [
    station.name, groups[station.group].name, station.active?'Sim':'Não', decimal.format(station.active?station.rate:0), station.used, station.stock, station.missed
  ])];
  const csv = data.map(row => row.map(value => '"' + String(value).replaceAll('"','""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'simulacao-ii-producao.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

new ResizeObserver(draw).observe(canvas);
render();
requestAnimationFrame(animate);
