import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,prepare,runModel,supportsAlternative} from '../dist/model.js';
import {parseStopTime,stopActive} from '../dist/stops.js';
import * as zones from '../dist/accumulations.js';
import {createDistributor} from '../dist/distributor.js';
import {createAnalytics} from '../dist/charts.js';
import {createLayoutEditor} from '../dist/layout-editor.js';
import {layoutBounds,validateLayoutSeed,layoutFromSeed,compileLayout,configForLayout} from '../dist/layout-data.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const seed=JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url),'utf8'));
assert(seed.length!==Math.round(seed.length*100)/100,'The fixture must reproduce the original decimal precision.');
assert.match(html,/<form[^>]+id="configForm"[^>]+novalidate/);
assert.match(html,/<input[^>]+id="mainLength"[^>]+step="any"/);
const elements=new Map();
const noop=()=>{};
function element(id=''){
 const e={id,value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},dataset:{},clientWidth:1000,clientHeight:620,
  classList:{add:noop,remove:noop,toggle:noop},addEventListener(type,handler){this.listeners??={};this.listeners[type]=handler;},showModal(){this.open=true;},close(){this.open=false;},setAttribute:noop,appendChild:noop,append:noop,replaceChildren:noop,
  get options(){return [...this.innerHTML.matchAll(/<option value="([^"]+)"/g)].map(match=>({value:match[1]}));},
  querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture:noop,
  getContext:()=>new Proxy({},{get:(_,k)=>k==='canvas'?e:noop}),closest:()=>({classList:{toggle:noop}})};
 return e;
}
for(const id of html.matchAll(/\bid="([^"]+)"/g))elements.set(id[1],element(id[1]));
elements.get('stopEditor').hidden=true;elements.get('zoneEditor').hidden=true;elements.get('playSpeed').value='60';
let workers=0,failWorker=false;
class FakeWorker{
 constructor(url){assert.match(String(url),/worker\.js/);if(failWorker)throw Error('worker blocked');workers++;}
 terminate(){}
 postMessage(data){const result=runModel(data.config,data.seed);this.onmessage({data:{type:'result',result}});}
}
const sandbox={console,structuredClone,URL,Number,Math,Date,Map,Set,Uint8Array,Float32Array,JSON,
 parseStopTime,stopActive,defaultConfig,prepare,supportsAlternative,createAnalytics,createDistributor,createLayoutEditor,layoutBounds,validateLayoutSeed,layoutFromSeed,compileLayout,configForLayout,...zones,devicePixelRatio:1,Worker:FakeWorker,crypto:{randomUUID:()=>String(Math.random())},
 window:{matchMedia:()=>({matches:false})},document:{getElementById:id=>elements.get(id),querySelectorAll:()=>[],createElement:()=>element(),createDocumentFragment:()=>element()},
 fetch:async()=>({ok:true,json:async()=>seed}),localStorage:{getItem:()=>null,setItem:noop},
 ResizeObserver:class{observe(){}},requestAnimationFrame:noop,setTimeout:()=>1,clearTimeout:noop};
const context=vm.createContext(sandbox);
await vm.runInContext(app.replace(/^import .*;$/gm,'').replaceAll('import.meta.url',JSON.stringify('file:///simulator/app.js')),context);
test('a interface FBRA executa o Layout 03, aplica seleção e mostra os resultados',()=>{
 assert.equal(elements.get('runButton').disabled,false);
 assert.match(elements.get('layoutName').textContent,/LAYOUT 03/);
 elements.get('durationHours').value='.5';
 elements.get('linesBody').listeners.change({target:{dataset:{j:'0',key:'enabled'},checked:false}});
 assert.equal(vm.runInContext('state.config.stations[0].enabled',context),false);
 elements.get('linesBody').listeners.change({target:{dataset:{j:'1',key:'minimum'},value:'2'}});
 assert.equal(vm.runInContext('state.prepared.stations[1].minimum',context),2);
 elements.get('startMode').value='first';
 elements.get('startMode').listeners.change();
 elements.get('editStops').onclick();
 assert.match(elements.get('stopTarget').innerHTML,/Ramal de distribuição superior/);
 elements.get('stopTarget').value='trunk:0';
 elements.get('stopTarget').onchange();
 elements.get('stopPosition').value='0';
 elements.get('stopStart').value='00:10:00';
 elements.get('stopDuration').value='00:01:00';
 elements.get('stopName').value='Ramal superior parado';
 elements.get('addStop').onclick();
 assert.equal(vm.runInContext('state.config.stops[0]?.target',context),'trunk',elements.get('toast').textContent);

 elements.get('configForm').onsubmit({preventDefault(){}});
 assert.equal(workers,1);
 assert.equal(elements.get('progressOverlay').hidden,true);
 assert.equal(elements.get('play').disabled,false);
 assert.equal(elements.get('splitNote').hidden,false);
 assert.equal(elements.get('distributorReadout').hidden,false);
 assert.equal(elements.get('distributorPanel').hidden,false);
 assert.match(elements.get('distributorChart').innerHTML,/data-playhead/);
 const distributorChart=elements.get('distributorChart'),tooltip=elements.get('analyticsTooltip');
 distributorChart.onpointermove({clientX:400,clientY:100});
 assert.equal(tooltip.hidden,false);
 assert.match(tooltip.innerHTML,/Superior.*Inferior.*Total desviado/);
 assert.match(tooltip.innerHTML,/cx\/min/);
 distributorChart.onpointerleave();
 assert.equal(tooltip.hidden,true);
 assert.equal(elements.get('distributorTotal').textContent,'0');
 elements.get('timeline').value=elements.get('timeline').max;
 elements.get('timeline').oninput();
 const total=vm.runInContext('state.result.groupSent.reduce((a,b)=>a+b,0)',context);
 assert.equal(elements.get('distributorTotal').textContent,Number(total).toLocaleString('pt-BR'));
 elements.get('timeline').value=0;
 elements.get('timeline').oninput();
 assert.equal(elements.get('distributorTotal').textContent,'0');
 assert.match(elements.get('consumptionChart').innerHTML,/<svg/);
 assert.match(elements.get('consumptionLegend').innerHTML,/Demanda das liberadas/);
 assert.match(elements.get('stopResults').innerHTML,/Ramal superior parado/);
 assert.match(elements.get('instantStocksGrid').innerHTML,/data-used-value/);
 assert.equal((elements.get('instantStocksGrid').innerHTML.match(/data-live-stock=/g)||[]).length,20);
 vm.runInContext('analytics.setSelection([4,5,6])',context);
 assert.equal(vm.runInContext('analytics.getData().indices.length',context),3);
 assert.equal((elements.get('instantStocksGrid').innerHTML.match(/data-live-stock=/g)||[]).length,3);
 elements.get('analyticsFrom').value='20';elements.get('analyticsTo').value='30';elements.get('applyAnalytics').onclick();
 assert.equal(vm.runInContext('analytics.getData().from',context),1200);
});
