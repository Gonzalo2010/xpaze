import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predict, update, judge, contextFor, EFFECTS } from '../src/app/adapt.js';

const earth = Array.from({ length: 10 }, (_, i) => ({ bpm: 60 + (i % 3), bp: { sys: 122 + (i % 4), dia: 82 + (i % 3) }, temp: 36.4 + (i % 2) * 0.1, mind: { sleep: 7 + (i % 2) * 0.5 } }));

test('cada efecto lleva su fuente', () => {
  for (const [k, e] of Object.entries(EFFECTS)) assert.ok(e.source.length > 20, k);
});

test('día 1: casi como en la Tierra; día 30: tensión −8/−9 mmHg y pulso igual', () => {
  const d1 = predict(earth, 1), d30 = predict(earth, 30);
  assert.ok(Math.abs(d1.sys.effect) < 1);
  assert.ok(Math.abs(d30.sys.effect + 8) < 0.01 && Math.abs(d30.dia.effect + 9) < 0.01);
  assert.equal(d30.hr.effect, 0);
});

test('la temperatura sube ~1 °C en 75 días y el sueño baja hacia ~6 h', () => {
  const p = predict(earth, 90);
  assert.ok(Math.abs(p.temp.effect - 1) < 0.01);
  assert.ok(p.sleep.mean < 7 && p.sleep.mean > 5.5);
});

test('las medidas en vuelo corrigen la predicción y estrechan el margen', () => {
  const p = predict(earth, 40);
  const inflight = Array.from({ length: 20 }, () => ({ bp: { sys: 110, dia: 70 } }));
  const u = update(p, inflight);
  assert.ok(Math.abs(u.sys.mean - 110) < Math.abs(p.sys.mean - 110));
  assert.ok(u.sys.hi - u.sys.lo < p.sys.hi - p.sys.lo);
});

test('juzga si un valor es esperable ese día y da contexto', () => {
  const p = predict(earth, 30);
  assert.equal(judge(p, 'sys', p.sys.mean), 'expected');
  assert.equal(judge(p, 'sys', p.sys.hi + 5), 'high');
  assert.ok(contextFor(1).some((c) => c.id === 'sms'));
  assert.ok(!contextFor(30).some((c) => c.id === 'sms'));
});
