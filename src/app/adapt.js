// Modelo de adaptación al espacio: a partir de la línea base de cada persona en la Tierra,
// predice cómo se moverá cada constante al llegar al espacio y durante la misión, con su margen.
// Después, las medidas reales en vuelo corrigen la predicción (actualización bayesiana).
//
// NO está entrenado con datos individuales de astronautas: esos datos no son públicos.
// Usa los efectos medios publicados por la NASA y estudios en la Estación Espacial Internacional;
// cada efecto lleva su fuente y lo que es una suposición del modelo está marcado como tal.

/* ---------------------------------------------------------------- efectos -- */
// delta(d): cambio medio esperado el día d de misión (respecto a la Tierra). sd: variación entre astronautas.
const smoothRamp = (d, days) => { const x = Math.min(1, Math.max(0, d / days)); return x * x * (3 - 2 * x); };

export const EFFECTS = {
  sys: {
    delta: (d) => -8 * smoothRamp(d, 14), sd: 5.7, unit: 'mmHg',
    source: 'Norsk et al., J Physiol 593 (2015): −8 ± 2 mmHg de sistólica (24 h) en 8 astronautas, 85–192 días en la ISS',
    assumption: 'Transición en ~2 semanas (el estudio midió a mitad de misión)',
  },
  dia: {
    delta: (d) => -9 * smoothRamp(d, 14), sd: 5.7, unit: 'mmHg',
    source: 'Norsk et al., J Physiol 593 (2015): −9 ± 2 mmHg de diastólica (24 h)',
    assumption: 'Transición en ~2 semanas',
  },
  hr: {
    delta: () => 0, sd: 4, unit: 'bpm',
    source: 'Norsk et al., J Physiol 593 (2015): el pulso no cambió (sube el gasto cardiaco, no la frecuencia)',
  },
  temp: {
    delta: (d) => 1.0 * Math.min(1, d / 75), sd: 0.3, unit: '°C',
    source: 'Stahn et al., Sci Rep 7:16180 (2017): la temperatura central sube ~1 °C de forma gradual en ~2,5 meses',
    assumption: 'Subida lineal hasta el día 75; la estación mide en la frente, no la temperatura central',
  },
  sleep: {
    target: 6.1, sd: 0.6, unit: 'h',
    source: 'Barger et al., Lancet Neurol 13 (2014): media de 6,09 h por noche en la ISS (8,5 h programadas)',
    assumption: 'Quien duerme más en la Tierra conserva parte de esa ventaja (30 %)',
  },
};

// Cambios que XPaze no mide pero que explican lo que pasa (se muestran como contexto)
export const CONTEXT = [
  { id: 'sms', days: [0, 3], es: 'Mareo espacial: lo sufre la mayoría (entre el 60 y el 80 %) en los primeros 2–3 días.', en: 'Space motion sickness: most people (60–80%) have it in the first 2–3 days.', source: 'Revisión de mareo espacial; NASA, 85 tripulantes de la lanzadera: 67 % en su primer vuelo' },
  { id: 'plasma', days: [0, 12], es: 'El volumen de plasma cae ~17 % el primer día (los líquidos suben a la cabeza) y se queda ~10 % por debajo.', en: 'Plasma volume drops ~17% on day one (fluids shift to the head) and stays ~10% lower.', source: 'Estudios Spacelab y revisiones de la NASA: −10 a −17 % en el primer día' },
  { id: 'bone', days: [14, 9999], es: 'Pérdida de hueso de ~1–1,5 % al mes en cadera y columna: por eso el ejercicio de resistencia es diario.', en: 'Bone loss of ~1–1.5% per month at the hip and spine: that is why resistance exercise is daily.', source: 'NASA Human Research Program, riesgo de fractura y osteoporosis' },
];

/* --------------------------------------------------------- línea base -- */
const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
function robust(values) {
  const v = values.filter(Number.isFinite);
  if (v.length < 3) return null;
  const med = median(v);
  const sd = (median(v.map((x) => Math.abs(x - med))) * 1.4826) || 0;
  return { med, sd, n: v.length };
}

const GETTERS = { sys: (e) => e.bp?.sys, dia: (e) => e.bp?.dia, hr: (e) => e.bpm, temp: (e) => e.temp, sleep: (e) => e.mind?.sleep };

/**
 * Predicción para el día d de misión a partir de los chequeos en Tierra («preflight»).
 * Devuelve por medida: { earth, mean, lo, hi, sd, effect } (intervalo ~95 %).
 */
export function predict(preflight, day) {
  const out = {};
  for (const k of Object.keys(EFFECTS)) {
    const b = robust(preflight.map(GETTERS[k]));
    if (!b) continue;
    const E = EFFECTS[k];
    const mean = E.target != null ? Math.min(b.med, E.target + (b.med - 7.5) * 0.3) : b.med + E.delta(day);
    const sd = Math.sqrt(b.sd ** 2 + E.sd ** 2);
    out[k] = { earth: b.med, mean, sd, lo: mean - 1.96 * sd, hi: mean + 1.96 * sd, unit: E.unit, effect: mean - b.med };
  }
  return out;
}

/**
 * Corrige la predicción con las medidas reales en vuelo (normal-normal): con pocas medidas manda la
 * predicción; con muchas, los datos de la persona. prior = 5 medidas equivalentes.
 */
export function update(pred, inflight, prior = 5) {
  const out = {};
  for (const [k, p] of Object.entries(pred)) {
    const obs = inflight.map(GETTERS[k]).filter(Number.isFinite);
    if (!obs.length) { out[k] = { ...p, n: 0 }; continue; }
    const m = obs.reduce((s, x) => s + x, 0) / obs.length;
    const w = obs.length / (obs.length + prior);
    const mean = p.mean * (1 - w) + m * w;
    const sd = p.sd * Math.sqrt(prior / (prior + obs.length)) + (robust(obs)?.sd || 0) * w;
    out[k] = { ...p, mean, sd, lo: mean - 1.96 * sd, hi: mean + 1.96 * sd, n: obs.length, observed: m };
  }
  return out;
}

/** ¿El valor de hoy cae dentro de lo esperado para este día de misión? */
export function judge(model, k, value) {
  const p = model[k];
  if (!p || !Number.isFinite(value)) return null;
  return value < p.lo ? 'low' : value > p.hi ? 'high' : 'expected';
}

/** Contexto que aplica el día d. */
export const contextFor = (d) => CONTEXT.filter((c) => d >= c.days[0] && d <= c.days[1]);

/**
 * Evaluación honesta del modelo con los datos disponibles: error de la predicción frente a lo que
 * pasó después. Sirve para la historia simulada y para cualquier persona con chequeos en vuelo.
 */
export function backtest(preflight, inflight) {
  const res = {};
  for (const k of Object.keys(EFFECTS)) {
    const errs = [], errsEarth = [];
    inflight.forEach((e, i) => {
      const v = GETTERS[k](e);
      if (!Number.isFinite(v)) return;
      const p = update(predict(preflight, e.day ?? i + 1), inflight.slice(0, i))[k];
      if (!p) return;
      errs.push(Math.abs(v - p.mean));
      errsEarth.push(Math.abs(v - p.earth));
    });
    if (errs.length >= 3) res[k] = { mae: errs.reduce((s, x) => s + x, 0) / errs.length, maeEarth: errsEarth.reduce((s, x) => s + x, 0) / errsEarth.length, n: errs.length };
  }
  return res;
}
