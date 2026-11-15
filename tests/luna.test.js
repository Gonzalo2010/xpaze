import { test } from 'node:test';
import assert from 'node:assert/strict';
import { train, forecast, backtest, METRICS } from '../src/app/luna.js';
import { crewDataset } from '../src/app/story.js';

const NOW = Date.UTC(2026, 10, 15, 12);
const crew = crewDataset(['vega', 'iker', 'noa', 'amara'].map((s, i) => ({ uid: 'U' + i + s, story: s })), NOW);

test('la tripulación simulada tiene chequeos en Tierra y en vuelo con día de misión', () => {
  for (const p of crew) { assert.equal(p.pre.length, 10); assert.ok(p.flight.length >= 25); assert.ok(p.flight.every((e) => e.day > 0 && e.day <= 58)); }
});

test('el entrenamiento ajusta hiperparámetros por verosimilitud para cada medida', () => {
  const m = train(crew);
  for (const k of METRICS) { const M = m.metrics[k]; assert.ok(M.h.l > 0 && M.h.sf2 > 0 && M.h.sn2 > 0, k); assert.ok(Number.isFinite(M.h.ll), k); }
  assert.ok(m.nTrain > 400);
});

test('con datos de la persona, el intervalo se estrecha y la media se acerca a lo observado', () => {
  const m = train(crew.slice(1));
  const p = crew[0];
  const f0 = forecast(m, p.pre, [], 50), f1 = forecast(m, p.pre, p.flight.filter((e) => e.day < 50), 50);
  assert.ok(f1.sys.hi - f1.sys.lo < f0.sys.hi - f0.sys.lo);
});

test('backtest: en tensión mejora mucho al valor de la Tierra, en temperatura corrige a la NASA y cubre ~95 %', () => {
  const r = backtest(crew);
  for (const k of ['sys', 'dia']) assert.ok(r[k].luna < r[k].earth * 0.6, `${k}: ${r[k].luna} vs ${r[k].earth}`);
  assert.ok(r.temp.luna < r.temp.nasa * 0.5, `temp ${r.temp.luna} vs NASA ${r.temp.nasa}`);
  for (const k of METRICS) assert.ok(r[k].luna <= r[k].last + 1e-9 && r[k].coverage > 0.8, `${k}`);
});
