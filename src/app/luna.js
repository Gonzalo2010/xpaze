// Luna AI · modelo de aprendizaje: proceso gaussiano por astronauta con media a priori aprendida.
//
//   valor(persona, día) = Tierra(persona) + NASA(día) + g(día) + f_persona(día) + ruido
//
//   · Tierra(persona): mediana de sus chequeos antes del despegue.
//   · NASA(día):       efecto medio publicado (src/app/adapt.js, con sus fuentes).
//   · g(día):          corrección de la tripulación, aprendida con regresión ridge sobre
//                      todos los chequeos en vuelo de los demás (aprendizaje conjunto).
//   · f_persona(día):  proceso gaussiano (núcleo exponencial cuadrático) sobre los residuos de
//                      cada persona: aprende SU curva de adaptación y da la incertidumbre.
//   · Hiperparámetros (escala temporal ℓ, amplitud σf, ruido σn) ajustados maximizando la
//     verosimilitud marginal de los datos de toda la tripulación (Bayes empírico).
//
// La evaluación (backtest) predice cada día solo con los días anteriores y compara con tres
// métodos sencillos. Con datos simulados el resultado demuestra que el modelo funciona, no que
// acierte con astronautas reales: eso exige datos reales, que no son públicos.

import { EFFECTS } from './adapt.js';

export const METRICS = ['sys', 'dia', 'hr', 'temp', 'sleep'];
export const GET = { sys: (e) => e.bp?.sys, dia: (e) => e.bp?.dia, hr: (e) => e.bpm, temp: (e) => e.temp, sleep: (e) => e.mind?.sleep };

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mad = (a, m) => (median(a.filter(Number.isFinite).map((x) => Math.abs(x - m))) || 0) * 1.4826;

/** Efecto medio publicado por la NASA el día d (sueño: hacia ~6,1 h). */
export function nasaEffect(k, d, earth) {
  const E = EFFECTS[k];
  if (!E) return 0;
  if (E.target != null) return Math.min(earth, E.target + (earth - 7.5) * 0.3) - earth;
  return E.delta(d);
}

/* --------------------------------------------------------- álgebra mínima -- */
function cholesky(A) {
  const n = A.length, L = A.map(() => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
function solveChol(L, b) { // (L Lᵀ) x = b
  const n = L.length, y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
const kern = (a, b, h) => h.sf2 * Math.exp(-((a - b) ** 2) / (2 * h.l * h.l));

/* ------------------------------------------------- corrección de tripulación -- */
// g(d) = w0 + w1·log(1+d), ridge hacia 0: si los datos no la justifican, manda la NASA.
function fitPopulation(points, lambda = 4) {
  if (points.length < 4) return { w0: 0, w1: 0, n: points.length };
  let a = lambda, b = 0, c = lambda, u = 0, v = 0; // [Σ1+λ, Σx; Σx, Σx²+λ] w = [Σy, Σxy]
  for (const { d, r } of points) { const x = Math.log1p(d); a += 1; b += x; c += x * x; u += r; v += x * r; }
  const det = a * c - b * b;
  return { w0: (c * u - b * v) / det, w1: (a * v - b * u) / det, n: points.length };
}
const popEffect = (g, d) => g.w0 + g.w1 * Math.log1p(d);

/* ---------------------------------------------------------- verosimilitud -- */
function logML(series, h) { // series: [{ d: [...], r: [...] }] residuos por persona
  let total = 0;
  for (const s of series) {
    const n = s.d.length; if (!n) continue;
    const K = s.d.map((a, i) => s.d.map((b, j) => kern(a, b, h) + (i === j ? h.sn2 : 0)));
    const L = cholesky(K); if (!L) return -Infinity;
    const al = solveChol(L, s.r);
    let quad = 0, logdet = 0;
    for (let i = 0; i < n; i++) { quad += s.r[i] * al[i]; logdet += Math.log(L[i][i]); }
    total += -0.5 * quad - logdet - 0.5 * n * Math.log(2 * Math.PI);
  }
  return total;
}

/**
 * Entrena Luna AI con la tripulación: crew = [{ id, pre: [chequeos en Tierra], flight: [{ day, ...chequeo }] }].
 * Devuelve, por medida, la corrección de tripulación y los hiperparámetros aprendidos.
 */
export function train(crew) {
  const model = { metrics: {}, nTrain: 0 };
  for (const k of METRICS) {
    const people = crew.map((p) => {
      const pre = p.pre.map(GET[k]).filter(Number.isFinite);
      const earth = median(pre);
      const pts = (p.flight || []).map((e) => ({ d: e.day, y: GET[k](e) })).filter((x) => Number.isFinite(x.y) && Number.isFinite(x.d));
      return { earth, sdEarth: mad(pre, earth), pts };
    }).filter((p) => p.earth != null);
    const resid = people.flatMap((p) => p.pts.map(({ d, y }) => ({ d, r: y - p.earth - nasaEffect(k, d, p.earth) })));
    const g = fitPopulation(resid);
    const series = people.map((p) => ({ d: p.pts.map((x) => x.d), r: p.pts.map(({ d, y }) => y - p.earth - nasaEffect(k, d, p.earth) - popEffect(g, d)) }));
    // escala de la medida: guía la rejilla de búsqueda
    const scale = Math.max(1e-3, median(people.map((p) => p.sdEarth || 0).filter((x) => x > 0)) || (k === 'temp' ? 0.1 : k === 'sleep' ? 0.4 : 3));
    let best = null;
    for (const l of [3, 6, 10, 15, 25, 40, 70]) for (const fs of [0.3, 0.6, 1, 1.6, 2.5]) for (const ns of [0.4, 0.7, 1, 1.5]) {
      const h = { l, sf2: (fs * scale) ** 2, sn2: (ns * scale) ** 2 };
      const ll = logML(series, h);
      if (!best || ll > best.ll) best = { ...h, ll };
    }
    model.metrics[k] = { g, h: best, scale, nObs: resid.length, nPeople: people.length };
    model.nTrain += resid.length;
  }
  return model;
}

/**
 * Predice para una persona el día `day`, dados sus chequeos en Tierra y en vuelo (solo los de antes).
 * Devuelve por medida: { earth, prior, mean, sd, lo, hi }.
 */
export function forecast(model, pre, flight, day) {
  const out = {};
  for (const k of METRICS) {
    const M = model.metrics[k]; if (!M) continue;
    const preV = pre.map(GET[k]).filter(Number.isFinite); if (!preV.length) continue;
    const earth = median(preV);
    const mean0 = (d) => earth + nasaEffect(k, d, earth) + popEffect(M.g, d);
    const pts = flight.map((e) => ({ d: e.day, y: GET[k](e) })).filter((x) => Number.isFinite(x.y) && x.d <= day);
    const h = M.h, prior = mean0(day);
    // incertidumbre a priori: variación entre astronautas (NASA) + amplitud aprendida
    const sdPrior = Math.sqrt((EFFECTS[k]?.sd || 0) ** 2 * 0.25 + h.sf2);
    let mean = prior, varr = sdPrior ** 2;
    if (pts.length) {
      const K = pts.map((a, i) => pts.map((b, j) => kern(a.d, b.d, h) + (i === j ? h.sn2 : 0)));
      const L = cholesky(K);
      if (L) {
        const r = pts.map((p) => p.y - mean0(p.d));
        const al = solveChol(L, r);
        const ks = pts.map((p) => kern(day, p.d, h));
        mean = prior + ks.reduce((s, v, i) => s + v * al[i], 0);
        const v = solveChol(L, ks);
        varr = Math.max(1e-6, h.sf2 - ks.reduce((s, x, i) => s + x * v[i], 0)) + (EFFECTS[k]?.sd || 0) ** 2 * 0.25 * Math.exp(-pts.length / 6);
      }
    }
    const sd = Math.sqrt(varr + h.sn2); // intervalo para una medida nueva (incluye el ruido)
    out[k] = { earth, prior, mean, sd, lo: mean - 1.96 * sd, hi: mean + 1.96 * sd, n: pts.length, unit: EFFECTS[k]?.unit };
  }
  return out;
}

/**
 * Evaluación honesta: para cada tripulante, se entrena sin él (los demás) y se le predice cada
 * día solo con sus días anteriores. Se compara con: valor en la Tierra, último valor visto y
 * solo el efecto de la NASA. Devuelve por medida el error medio (MAE) y la cobertura del 95 %.
 */
export function backtest(crew, { minHistory = 3 } = {}) {
  const acc = {};
  for (const k of METRICS) acc[k] = { luna: [], earth: [], last: [], nasa: [], inside: 0, n: 0 };
  crew.forEach((person, i) => {
    const model = train(crew.filter((_, j) => j !== i));
    const fl = (person.flight || []).slice().sort((a, b) => a.day - b.day);
    for (let t = minHistory; t < fl.length; t++) {
      const target = fl[t], past = fl.slice(0, t);
      const f = forecast(model, person.pre, past, target.day);
      for (const k of METRICS) {
        const y = GET[k](target); const p = f[k];
        if (!Number.isFinite(y) || !p) continue;
        const lastV = [...past].reverse().map(GET[k]).find(Number.isFinite);
        const A = acc[k];
        A.luna.push(Math.abs(y - p.mean));
        A.earth.push(Math.abs(y - p.earth));
        A.nasa.push(Math.abs(y - (p.earth + nasaEffect(k, target.day, p.earth))));
        if (Number.isFinite(lastV)) A.last.push(Math.abs(y - lastV));
        if (y >= p.lo && y <= p.hi) A.inside++;
        A.n++;
      }
    }
  });
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const res = {};
  for (const k of METRICS) {
    const A = acc[k]; if (!A.n) continue;
    res[k] = { n: A.n, luna: mean(A.luna), earth: mean(A.earth), last: mean(A.last), nasa: mean(A.nasa), coverage: A.inside / A.n };
  }
  return res;
}
