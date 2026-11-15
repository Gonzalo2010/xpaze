// Luna AI: prueba del modelo de adaptación al espacio (src/app/adapt.js).
import '../fonts.css';
import './luna.css';
import { contextFor, EFFECTS } from '../app/adapt.js';
import { train, forecast, backtest, METRICS as LM } from '../app/luna.js';
import { crewDataset } from '../app/story.js';

// Luna AI se entrena al abrir la página con la tripulación simulada (4 personas, ~30 días en vuelo cada una)
const CREW = crewDataset([['04A37F1C', 'vega'], ['045BE290', 'iker'], ['04C819D4', 'noa'], ['04E1663A', 'amara']].map(([uid, story]) => ({ uid, story })));
const TRAINED = train(CREW);
const N_CHECKS = CREW.reduce((s, p) => s + p.flight.length, 0);
let BT = null;

const q = new URLSearchParams(location.search);
let lang = 'en';
try { const s = q.get('lang') || localStorage.getItem('xpaze-lang'); if (s === 'es' || s === 'en') lang = s; } catch { /* nada */ }
const L = (es, en) => (lang === 'es' ? es : en);
const f = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }));
const app = document.getElementById('luna');

const PRESETS = {
  vega: { name: 'Vega Mar', hr: 58, sys: 122, dia: 82, temp: 36.5, sleep: 7.1 },
  amara: { name: 'Amara Okoye', hr: 49, sys: 116, dia: 77, temp: 36.2, sleep: 7.0 },
  you: { name: L('Tú', 'You'), hr: 64, sys: 120, dia: 80, temp: 36.6, sleep: 7.5 },
};
const state = { ...PRESETS.vega, day: 30, flight: [] };

const METRICS = [
  ['sys', L('Tensión sistólica', 'Systolic pressure'), 'mmHg', 0],
  ['dia', L('Tensión diastólica', 'Diastolic pressure'), 'mmHg', 0],
  ['hr', L('Pulso en reposo', 'Resting heart rate'), L('lpm', 'bpm'), 0],
  ['temp', L('Temperatura central', 'Core temperature'), '°C', 1],
  ['sleep', L('Sueño', 'Sleep'), 'h', 1],
];

// 10 chequeos en la Tierra alrededor de los valores que escribe la persona (con su variación normal)
function earthChecks() {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  return Array.from({ length: 10 }, () => ({ bpm: state.hr + r() * 4, bp: { sys: state.sys + r() * 8, dia: state.dia + r() * 6 }, temp: state.temp + r() * 0.2, mind: { sleep: state.sleep + r() * 0.8 } }));
}

function model(day) {
  return forecast(TRAINED, earthChecks(), state.flight.filter((e) => e.day <= day), day);
}

function chart(k, unit, d) {
  const W = 600, H = 150, pad = { l: 42, r: 10, t: 10, b: 24 };
  const days = Array.from({ length: 61 }, (_, i) => i * 3);
  const pts = days.map((day) => ({ day, m: model(day)[k] }));
  const all = pts.flatMap((p) => [p.m.lo, p.m.hi, p.m.earth]).concat(state.flight.filter((e) => getter(k)(e) != null).map((e) => getter(k)(e)));
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (day) => pad.l + (day / 180) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
  const band = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.m.hi).toFixed(1)}`).join(' ') + ' ' + pts.slice().reverse().map((p) => `L${x(p.day).toFixed(1)} ${y(p.m.lo).toFixed(1)}`).join(' ') + 'Z';
  const mean = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.m.mean).toFixed(1)}`).join(' ');
  const earthY = y(pts[0].m.earth);
  const obs = state.flight.map((e) => [e.day, getter(k)(e)]).filter(([, v]) => v != null);
  return `<svg viewBox="0 0 ${W} ${H}" class="lc" role="img" aria-label="${k}">
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${earthY}" y2="${earthY}" class="lc__earth"/>
    <path d="${band}" class="lc__band"/><path d="${mean}" class="lc__mean"/>
    <line x1="${x(state.day)}" x2="${x(state.day)}" y1="${pad.t}" y2="${H - pad.b}" class="lc__now"/>
    ${obs.map(([dd, v]) => `<circle cx="${x(dd)}" cy="${y(v)}" r="4" class="lc__obs"/>`).join('')}
    <text x="${pad.l - 6}" y="${y(hi) + 4}" class="lc__ax" text-anchor="end">${f(hi, d)}</text>
    <text x="${pad.l - 6}" y="${y(lo)}" class="lc__ax" text-anchor="end">${f(lo, d)}</text>
    ${[0, 30, 60, 90, 120, 150, 180].map((dd) => `<text x="${x(dd)}" y="${H - 6}" class="lc__ax" text-anchor="middle">${dd}</text>`).join('')}
  </svg>`;
}
const getter = (k) => ({ sys: (e) => e.bp?.sys, dia: (e) => e.bp?.dia, hr: (e) => e.bpm, temp: (e) => e.temp, sleep: (e) => e.mind?.sleep })[k];

function btTable() {
  if (!BT) return `<p class="lfine">${L('Evaluando…', 'Evaluating…')}</p>`;
  const names = { sys: L('Sistólica', 'Systolic'), dia: L('Diastólica', 'Diastolic'), hr: L('Pulso', 'Pulse'), temp: L('Temperatura', 'Temperature'), sleep: L('Sueño', 'Sleep') };
  const dec = { sys: 1, dia: 1, hr: 1, temp: 2, sleep: 2 };
  const rows = LM.filter((k) => BT[k]).map((k) => { const r = BT[k], h = TRAINED.metrics[k].h; const best = Math.min(r.luna, r.earth, r.last, r.nasa);
    const c = (v) => `<td class="${Math.abs(v - best) < 1e-9 ? 'best' : ''}">${f(v, dec[k])}</td>`;
    return `<tr><th>${names[k]}</th>${c(r.luna)}${c(r.earth)}${c(r.last)}${c(r.nasa)}<td>${Math.round(r.coverage * 100)} %</td><td class="hp">ℓ ${h.l} d · σ ${f(Math.sqrt(h.sf2), dec[k])} · ${L('ruido', 'noise')} ${f(Math.sqrt(h.sn2), dec[k])}</td></tr>`; }).join('');
  return `<div class="btwrap"><table class="lt2 bt"><thead><tr><th></th><th>Luna AI</th><th>${L('Valor en la Tierra', 'Earth value')}</th><th>${L('Último valor', 'Last value')}</th><th>${L('Solo NASA', 'NASA only')}</th><th>${L('Cobertura 95 %', '95% coverage')}</th><th>${L('Parámetros aprendidos', 'Learned parameters')}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="lfine">${L('Error medio (cuanto menos, mejor) al predecir cada día solo con los anteriores y sin haber visto a esa persona al entrenar (validación dejando una persona fuera). En verde, el mejor. Datos simulados: demuestra que el modelo aprende, no su precisión con astronautas reales, que exige datos reales.', 'Mean error (lower is better) predicting each day only from the previous ones and without that person in training (leave-one-person-out). In green, the best. Simulated data: it shows the model learns, not its accuracy on real astronauts, which needs real data.')}</p>`;
}

function render() {
  const m = model(state.day);
  const ctx = contextFor(state.day);
  app.innerHTML = `
  <header class="lt"><a href="/" class="lt__b"><img src="/logo-mark-dark.png" alt="" width="28" height="23"/>XPaze</a>
    <div class="lt__l"><button data-l="en" aria-pressed="${lang === 'en'}">EN</button><button data-l="es" aria-pressed="${lang === 'es'}">ES</button></div></header>
  <section class="lh">
    <div class="lbrand"><img src="/luna-badge.svg" alt="" width="88" height="88"/><div><h1>Luna <span>AI</span></h1><p class="lk">${L('Modelo de predicción · XPaze', 'Prediction model · XPaze')}</p></div></div>
    <p class="ll">${L('Con cómo está cada astronauta en la Tierra, Luna AI predice cómo se adaptará su cuerpo al espacio día a día, y cuál será su nueva normal. En vuelo, cada chequeo corrige la predicción.', 'From how each astronaut is on Earth, Luna AI predicts how their body will adapt to space day by day, and what their new normal will be. In flight, every check-up corrects the prediction.')}</p>
  </section>
  <section class="lg">
    <div class="lcard">
      <h2>${L('1 · En la Tierra', '1 · On Earth')}</h2>
      <div class="lp">${Object.entries(PRESETS).map(([k, p]) => `<button data-p="${k}">${p.name}</button>`).join('')}</div>
      ${[['hr', L('Pulso en reposo', 'Resting heart rate'), L('lpm', 'bpm'), 35, 110, 1], ['sys', L('Sistólica', 'Systolic'), 'mmHg', 90, 170, 1], ['dia', L('Diastólica', 'Diastolic'), 'mmHg', 50, 110, 1], ['temp', L('Temperatura', 'Temperature'), '°C', 35, 37.8, 0.1], ['sleep', L('Sueño', 'Sleep'), 'h', 4, 10, 0.5]]
        .map(([k, n, u, mn, mx, st]) => `<label class="lf"><span>${n}</span><input type="number" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${state[k]}"/><em>${u}</em></label>`).join('')}
    </div>
    <div class="lcard">
      <h2>${L('2 · En el espacio', '2 · In space')}</h2>
      <label class="ld"><span>${L('Día de misión', 'Mission day')}: <b>${state.day}</b></span><input type="range" min="0" max="180" value="${state.day}" data-day/></label>
      <table class="lt2"><thead><tr><th></th><th>${L('Tierra', 'Earth')}</th><th>${L('Predicción', 'Prediction')}</th><th>${L('Margen 95 %', '95% range')}</th></tr></thead><tbody>
      ${METRICS.map(([k, n, u, d]) => { const p = m[k]; if (!p) return ''; const ch = p.mean - p.earth;
        return `<tr><th>${n}</th><td>${f(p.earth, d)}</td><td><b>${f(p.mean, d)}</b> <small class="${Math.abs(ch) < (d ? 0.05 : 0.5) ? 'z' : ch < 0 ? 'dn' : 'up'}">${Math.abs(ch) < (d ? 0.05 : 0.5) ? '=' : (ch > 0 ? '+' : '') + f(ch, d)}</small></td><td>${f(p.lo, d)}–${f(p.hi, d)} ${u}</td></tr>`; }).join('')}
      </tbody></table>
      ${ctx.length ? `<ul class="lctx">${ctx.map((c) => `<li>${L(c.es, c.en)}</li>`).join('')}</ul>` : ''}
    </div>
  </section>
  <section class="lcard lcharts">
    <h2>${L('3 · Los próximos 6 meses', '3 · The next 6 months')}</h2>
    <p class="lfine">${L('Línea: predicción. Banda: margen 95 %. Gris: tu valor en la Tierra. Puntos: chequeos en vuelo.', 'Line: prediction. Band: 95% range. Grey: your value on Earth. Dots: in-flight check-ups.')}</p>
    <div class="lgrid">${METRICS.map(([k, n, u, d]) => (m[k] ? `<figure><figcaption>${n} <span>${u}</span></figcaption>${chart(k, u, d)}</figure>` : '')).join('')}</div>
  </section>
  <section class="lcard">
    <h2>${L('5 · Añade un chequeo en vuelo', '5 · Add an in-flight check-up')}</h2>
    <p class="lfine">${L('Escribe lo que has medido en el día de misión elegido. Luna AI mezcla la predicción con tus datos: cuantos más chequeos, más manda lo tuyo.', 'Enter what you measured on the chosen mission day. Luna AI blends the prediction with your data: the more check-ups, the more yours count.')}</p>
    <div class="ladd">${[['sys', L('Sistólica', 'Systolic')], ['dia', L('Diastólica', 'Diastolic')], ['hr', L('Pulso', 'Pulse')], ['temp', L('Temp.', 'Temp.')], ['sleep', L('Sueño', 'Sleep')]].map(([k, n]) => `<label><span>${n}</span><input type="number" step="any" data-o="${k}"/></label>`).join('')}
      <button class="lb" data-add>${L(`Añadir en el día ${state.day}`, `Add on day ${state.day}`)}</button>${state.flight.length ? `<button class="lb lb--g" data-clear>${L('Borrar chequeos', 'Clear check-ups')} (${state.flight.length})</button>` : ''}</div>
  </section>
  <section class="lcard ltrain">
    <h2>${L('4 · Entrenamiento y precisión', '4 · Training and accuracy')}</h2>
    <p class="lfine">${L(`Luna AI se acaba de entrenar en tu navegador con ${N_CHECKS} chequeos en vuelo (${TRAINED.nTrain} medidas) de 4 tripulantes simulados. Para cada medida ha elegido sus parámetros maximizando la verosimilitud de los datos.`, `Luna AI has just trained in your browser on ${N_CHECKS} in-flight check-ups (${TRAINED.nTrain} measurements) from 4 simulated crew members. For each measurement it chose its parameters by maximising the likelihood of the data.`)}</p>
    <div id="bt">${btTable()}</div>
  </section>
  <section class="lcard lsrc">
    <h2>${L('Cómo funciona y de dónde salen los datos', 'How it works and where the data comes from')}</h2>
    <ol>
      <li>${L('<b>Tu línea base en la Tierra</b>: la mediana y la variación de tus chequeos antes del despegue.', '<b>Your baseline on Earth</b>: the median and spread of your check-ups before launch.')}</li>
      <li>${L('<b>Efectos medidos por la NASA en la ISS</b>, día a día, con la variación entre astronautas:', '<b>Effects measured by NASA on the ISS</b>, day by day, with the variation between astronauts:')}
        <ul>${Object.entries(EFFECTS).map(([k, e]) => `<li><b>${k}</b>: ${e.source}${e.assumption ? ` <i>(${L('suposición del modelo', 'model assumption')}: ${e.assumption})</i>` : ''}</li>`).join('')}</ul></li>
      <li>${L('<b>Lo que aprende de la tripulación</b>: una corrección de la curva de la NASA ajustada con los chequeos en vuelo de todos (regresión con regularización). Por ejemplo, ha aprendido que la estación mide la temperatura en la frente y no sube como la central.', '<b>What it learns from the crew</b>: a correction to the NASA curve fitted on everyone’s in-flight check-ups (regularised regression). For example, it has learned that the station measures forehead temperature, which does not rise like core temperature.')}</li>
      <li>${L('<b>Tu curva personal</b>: un proceso gaussiano aprende cómo te adaptas tú a partir de tus chequeos en vuelo y da la incertidumbre de cada predicción. Sus parámetros (escala de tiempo, amplitud y ruido) se aprenden maximizando la verosimilitud de los datos.', '<b>Your personal curve</b>: a Gaussian process learns how you adapt from your in-flight check-ups and gives the uncertainty of each prediction. Its parameters (time scale, amplitude and noise) are learned by maximising the likelihood of the data.')}</li>
    </ol>
    <p class="lwarn">${L('Luna AI no está entrenada con datos individuales de astronautas: no son públicos. Predice con los efectos medios publicados y aprende de cada persona. Es un prototipo de investigación, no un dispositivo médico.', 'Luna AI is not trained on individual astronaut data: it is not public. It predicts from published average effects and learns from each person. It is a research prototype, not a medical device.')}</p>
  </section>
  <footer class="lfoot"><a href="/app/">${L('Probar la app', 'Try the app')}</a> · <a href="https://github.com/Gonzalo2010/xpaze/blob/main/src/app/adapt.js" target="_blank" rel="noopener">${L('Código del modelo', 'Model code')}</a> · <a href="/legal/">Legal</a></footer>`;
  wire();
}

function wire() {
  app.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('change', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) { state[i.dataset.k] = v; render(); } }));
  app.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { const p = PRESETS[b.dataset.p]; Object.assign(state, p); state.flight = []; render(); }));
  const r = app.querySelector('[data-day]');
  r.addEventListener('input', () => { state.day = +r.value; clearTimeout(r.t); r.t = setTimeout(render, 60); });
  app.querySelector('[data-add]').addEventListener('click', () => {
    const v = (k) => { const x = parseFloat(app.querySelector(`[data-o="${k}"]`).value); return Number.isFinite(x) ? x : undefined; };
    const e = { day: state.day, bpm: v('hr'), temp: v('temp'), mind: v('sleep') != null ? { sleep: v('sleep') } : undefined, bp: v('sys') != null && v('dia') != null ? { sys: v('sys'), dia: v('dia') } : undefined };
    if ([e.bpm, e.temp, e.mind, e.bp].every((x) => x === undefined)) return;
    state.flight.push(e); render();
  });
  app.querySelector('[data-clear]')?.addEventListener('click', () => { state.flight = []; render(); });
  app.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.l; try { localStorage.setItem('xpaze-lang', lang); } catch { /* nada */ } document.documentElement.lang = lang; render(); }));
}
document.documentElement.lang = lang;
render();
setTimeout(() => { BT = backtest(CREW); const el = document.getElementById('bt'); if (el) el.innerHTML = btTable(); }, 60);
