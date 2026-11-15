const { chromium } = require('playwright');
const DIR = process.argv[2] || 'frames';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 492 }, deviceScaleFactor: 1 });
  await p.goto('' + (process.argv[3] || 'http://127.0.0.1:5190') + '/astronaut/?embed=1&capture=1&lang=en');
  await p.waitForFunction(() => document.body.classList.contains('is-ready'), null, { timeout: 90000 });
  await p.evaluate(() => { for (let i = 0; i < 40; i++) window.__renderAt(14); });
  const FPS = 10, T0 = 14, T1 = 37; let n = 0;
  for (let t = T0; t < T1; t += 1 / FPS) {
    await p.evaluate((tt) => { window.__renderAt(tt); window.__renderAt(tt); }, t);
    await p.screenshot({ path: `${DIR}/f${String(n).padStart(4, '0')}.png`, omitBackground: true });
    n++;
  }
  console.log('fotogramas', n); await b.close();
})();
