import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOX, groups, stations } from '../dist/layout.js';
import { Simulator } from '../dist/model.js';

test('aplica as dimensões e soma da planilha, ativando apenas uma alternativa', () => {
  assert.deepEqual(BOX, { length:.464, width:.290, height:.214 });
  for (const alternative of ['E18','G22']) {
    const sim = new Simulator({ alternative });
    assert.equal(sim.stations.filter(s => s.active).length,21);
    assert.equal(sim.stations.find(s => s.name === alternative).active,true);
    assert.ok(Math.abs(sim.groups.reduce((sum,g) => sum + g.demand,0) - 83.4645) < 1e-9);
  }
  assert.ok(groups.every(group => group.route.length > 100));
  assert.ok(stations.every(station => station.capacity >= 1));
});

test('parte 50/50 e ajusta o fluxo ao consumo dos ramais ao longo do turno', () => {
  const sim = new Simulator();
  sim.advance(1200);
  assert.ok(sim.groups.every(g => g.sent > 0));
  assert.ok(Math.abs(sim.groups[0].sent - sim.groups[1].sent) <= 1);
  while (!sim.advance(6000)) {
    assert.ok(sim.totals().conserved);
    for (const station of sim.stations) {
      assert.ok(station.stock + station.boxes.length <= station.capacity, station.name);
      assert.ok(station.reserved >= 0, station.name);
    }
  }
  const total = sim.totals();
  assert.ok(total.conserved);
  assert.equal(total.missed,0);
  assert.ok(total.used > 39000);
  const [upper, lower] = sim.groups;
  const actual = upper.sent / (upper.sent + lower.sent);
  const expected = upper.demand / (upper.demand + lower.demand);
  assert.ok(Math.abs(actual - expected) < .01);
});

test('redireciona quando a entrada do ramal previsto não tem espaço', () => {
  const rates = stations.map(station => station.group === 0 ? 0 : station.rate);
  const sim = new Simulator({ rates, branchSpeed:1, warmup:3600 });
  sim.advance(400);
  assert.equal(sim.groups[0].sent,0);
  assert.ok(sim.groups[1].sent > 0);
  assert.ok(sim.redirected > 0);
  assert.ok(sim.heldSeconds > 0);
  assert.ok(sim.totals().conserved);
});

test('mantém as caixas na entrada até surgir espaço e não cria caixas extras', () => {
  const sim = new Simulator({ rates:stations.map(() => 0) });
  sim.advance(400);
  assert.equal(sim.groups[0].sent + sim.groups[1].sent,0);
  assert.ok(sim.main.length > 0);
  assert.ok(sim.admitted <= Math.floor(sim.inlet.length / BOX.width));
  assert.ok(sim.blocked);
  assert.ok(sim.totals().conserved);
});
