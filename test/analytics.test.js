import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, sample, SAMPLE_STEP } from '../dist/analytics.js';
import { Simulator } from '../dist/model.js';

test('o histórico preserva os totais e os filtros de máquina', () => {
  const sim = new Simulator({ hours:.15 });
  const rows = [sample(sim)];
  while (!sim.advance(SAMPLE_STEP)) rows.push(sample(sim));
  rows.push(sample(sim));
  const active = sim.stations.flatMap((s,i)=>s.active?[i]:[]);
  const data = analyze(rows,active,[0,1],5);
  assert.equal(data.length,2);
  assert.equal(data.reduce((sum,row)=>sum+row.used,0),sim.totals().used);
  assert.equal(data.at(-1).stock,sim.stations.reduce((sum,s)=>sum+s.stock,0));
  assert.equal(data.at(-1).main,sim.main.length);
  assert.equal(analyze(rows,[0],[0],1).reduce((sum,row)=>sum+row.used,0),sim.stations[0].used);
});

test('estoque inicial cheio é conservado e a falta fica registrada após o esgotamento', () => {
  const sim = new Simulator({ hours:1, feed:0, mainInitial:100, branchInitial:100 });
  assert.ok(sim.initial>0);
  assert.equal(sim.initial,sim.totals().inSystem);
  sim.advance(36000);
  assert.ok(sim.totals().conserved);
  assert.ok(sim.shortages.length>0);
  assert.equal(sim.shortages.reduce((sum,gap)=>sum+gap.count,0),sim.totals().missed);
});
