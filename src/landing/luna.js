// Luna AI en la portada: deslizador del día de misión con la predicción para una astronauta de ejemplo.
import { predict, contextFor } from '../app/adapt.js';
import { t, lang, num } from './i18n.js';

const EARTH = { hr: 58, sys: 122, dia: 82, temp: 36.6, sleep: 7.1 };
const ROWS = [['sys', 'mmHg', 0, 12], ['dia', 'mmHg', 0, 12], ['hr', 'bpm', 0, 10], ['temp', '°C', 1, 1.6], ['sleep', 'h', 1, 2.4]];

function earthChecks() {
  let s = 9;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5);
  return Array.from({ length: 10 }, () => ({ bpm: EARTH.hr + r() * 4, bp: { sys: EARTH.sys + r() * 6, dia: EARTH.dia + r() * 5 }, temp: EARTH.temp + r() * 0.16, mind: { sleep: EARTH.sleep + r() * 0.6 } }));
}

export function startLuna(root) {
  if (!root) return;
  const range = root.querySelector('#lunaRange'), out = root.querySelector('#lunaDay'), rows = root.querySelector('#lunaRows'), ctx = root.querySelector('#lunaCtx');
  const pre = earthChecks();
  function draw() {
    const day = +range.value;
    out.textContent = day;
    const m = predict(pre, day);
    rows.innerHTML = ROWS.map(([k, unit, d, span]) => {
      const p = m[k]; if (!p) return '';
      const u = unit === 'bpm' ? t('luna.bpm') : unit;
      const ch = p.mean - p.earth;
      const pos = (v) => Math.max(0, Math.min(100, 50 + ((v - p.earth) / span) * 50));
      const same = Math.abs(ch) < (d ? 0.05 : 0.5);
      return `<div class="lr">
        <div class="lr__n"><b>${t('luna.' + k)}</b><small>${t('luna.earth')} ${num(p.earth, d)} ${u}</small></div>
        <div class="lr__bar"><i class="lr__band" style="left:${pos(p.lo)}%;right:${100 - pos(p.hi)}%"></i><i class="lr__earth"></i><i class="lr__dot" style="left:${pos(p.mean)}%"></i></div>
        <div class="lr__v"><b>${num(p.mean, d)}</b> <em class="${same ? 'z' : ch < 0 ? 'dn' : 'up'}">${same ? '=' : (ch > 0 ? '+' : '−') + num(Math.abs(ch), d)}</em></div>
      </div>`;
    }).join('');
    const c = contextFor(day);
    ctx.textContent = c.length ? c.map((x) => (lang() === 'es' ? x.es : x.en)).join(' ') : '';
  }
  range.addEventListener('input', draw);
  draw();
  // se mueve solo hasta que la persona lo toca
  let auto = true, dir = 1;
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => range.addEventListener(e, () => { auto = false; }, { passive: true }));
  const io = new IntersectionObserver(([e]) => { root.dataset.on = e.isIntersecting ? '1' : ''; });
  io.observe(root);
  setInterval(() => {
    if (!auto || !root.dataset.on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let v = +range.value + dir * 3;
    if (v >= 180 || v <= 0) dir = -dir;
    range.value = Math.max(0, Math.min(180, v)); draw();
  }, 260);
}
