// Measures how dangerous the bot is at each difficulty.
//
// A fixed-strength AI plays blue in place of a person, against the bot in every champion
// matchup. Win/loss between two AIs is mostly the matchup, so this reports what a player
// would actually feel: damage taken per minute, how often the bot dies, how well it farms,
// and what share of your spells land on it. Each run nudges the wave clock and starting
// gold, because the simulation is otherwise deterministic and repeats would be identical.
//
//   npm i playwright && node tools/simulate.js        (SAMPLES=4 by default)
// Set CHROMIUM_PATH if Playwright has no browser of its own to use.
const { chromium } = require("playwright");
const path = require("path");

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const se = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)) / Math.sqrt(a.length); };

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.resolve(__dirname, "../index.html"));
  await p.waitForTimeout(250);

  const champs = ["VECTOR", "PULSE", "BULWARK"];
  const SAMPLES = Number(process.env.SAMPLES || 4);

  console.log(`n = ${champs.length * champs.length * SAMPLES} matches per difficulty, 7 game-minutes each, mean ± standard error\n`);
  for (const diff of ["easy", "normal", "hard"]) {
    const dmg = [], deaths = [], botDeaths = [], cs = [];
    let fired = 0, landed = 0;
    for (const blue of champs) for (const red of champs) for (let seed = 0; seed < SAMPLES; seed++) {
      const r = await p.evaluate(([blue, red, diff, seed]) => {
        window.DotLegend.start(blue);
        G.diff = diff;
        G.bot.champ = red; G.bot.C = CHAMPS[red]; G.bot.ranks = [0, 0, 0, 0]; G.bot.cds = [0, 0, 0, 0];
        recalc(G.bot, true); G.bot.hp = G.bot.maxHp; G.bot.mp = G.bot.maxMp; G.bot.r = CHAMPS[red].r;
        G.nextWave += seed * 1.7; G.me.gold += seed * 23; G.bot.gold += (3 - seed) * 19;
        window.DotLegend.autoplay(true);

        let toMe = 0; const shots = [];
        const dmgFn = damage, lineFn = lineShot;
        damage = function (src, tgt, raw, type, opt) { const d = dmgFn(src, tgt, raw, type, opt); if (tgt === G.me && src === G.bot) toMe += d; return d; };
        lineShot = function (u, ...rest) { const n = G.projs.length; lineFn(u, ...rest); if (u === G.me && G.projs.length > n) shots.push(G.projs[G.projs.length - 1]); };
        for (let i = 0; i < 420 * 30 && G.phase === "play"; i++) stepGame(1 / 30);
        damage = dmgFn; lineShot = lineFn;

        const mins = G.clock / 60;
        return { toMe: toMe / mins, d: G.me.d / mins, bd: G.bot.d / mins, cs: G.bot.cs / mins,
                 fired: shots.length, landed: shots.filter((s) => s.hit && s.hit.has(G.bot.id)).length };
      }, [blue, red, diff, seed]);
      dmg.push(r.toMe); deaths.push(r.d); botDeaths.push(r.bd); cs.push(r.cs); fired += r.fired; landed += r.landed;
    }
    console.log(diff.padEnd(7),
      `damage to you/min ${mean(dmg).toFixed(0).padStart(4)} ±${se(dmg).toFixed(0).padStart(2)}  `,
      `your deaths/min ${mean(deaths).toFixed(2)}  `,
      `its deaths/min ${mean(botDeaths).toFixed(2)}  `,
      `its CS/min ${mean(cs).toFixed(1)}  `,
      `your spells landing ${(100 * landed / Math.max(1, fired)).toFixed(0)}%`);
  }
  console.log("\nerrors:", errs.length ? errs.slice(0, 3).join(" | ") : "none");
  await b.close();
})();
