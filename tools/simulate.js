// Plays the lane bot against itself across every champion matchup and prints
// how each match ended. Needs `npm i playwright`; the game itself needs nothing.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html') + '');
  await p.waitForTimeout(250);

  const champs = ['VECTOR', 'PULSE', 'BULWARK'];
  for (const blue of champs) for (const red of champs) {
    const r = await p.evaluate(([blue, red]) => {
      window.DotLegend.start(blue);
      // force the red pick so the matchup is the one we asked for
      G.bot.champ = red; G.bot.C = CHAMPS[red]; G.bot.ranks = [0,0,0,0]; G.bot.cds=[0,0,0,0];
      recalc(G.bot, true); G.bot.hp = G.bot.maxHp; G.bot.mp = G.bot.maxMp; G.bot.r = CHAMPS[red].r;
      window.DotLegend.autoplay(true);
      for (let i = 0; i < 40000 && G.phase === 'play'; i++) stepGame(1/30);
      return { t: Math.round(G.clock), win: G.nexusDown === 1 ? 'BLUE' : G.nexusDown === 0 ? 'RED' : 'none',
               b: G.me.k + '/' + G.me.d + ' lvl' + G.me.level + ' cs' + G.me.cs + ' it' + G.me.items.length,
               r: G.bot.k + '/' + G.bot.d + ' lvl' + G.bot.level + ' cs' + G.bot.cs + ' it' + G.bot.items.length };
    }, [blue, red]);
    console.log(`${blue.padEnd(8)} vs ${red.padEnd(8)} -> ${r.win.padEnd(5)} ${String(r.t).padStart(4)}s | blue ${r.b} | red ${r.r}`);
  }
  console.log('ERRORS:', errs.length ? errs.slice(0,5).join('\n') : 'none');
  await b.close();
})();
