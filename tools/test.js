// Drives the real game in a real browser and checks the things that make it feel right.
//   npm i playwright && node tools/test.js
// Set CHROMIUM_PATH if Playwright has no browser of its own to use.
const { chromium } = require("playwright");
const path = require("path");

let failed = 0;
const ok = (name, cond, note) => {
  if (!cond) failed++;
  console.log((cond ? "PASS " : "FAIL ") + name + (note !== undefined ? "  [" + note + "]" : ""));
};

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctxt = await b.newContext({ viewport: { width: 1400, height: 860 } });
  const p = await ctxt.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  const url = "file://" + path.resolve(__dirname, "../index.html");

  const fresh = async (pick = 1) => {
    await p.goto(url);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await p.waitForTimeout(250);
    await p.click(`#picks .pick:nth-child(${pick})`);
    await p.waitForTimeout(300);
  };

  // ---------------------------------------------------------------- the basics
  await fresh(2);   // PULSE
  ok("champion picked", await p.evaluate(() => G.me.champ === "PULSE"));
  ok("shop auto-opens at spawn", await p.evaluate(() => G.shopOpen));
  await p.click("#shopGrid button:nth-child(4)");
  await p.waitForTimeout(100);
  ok("buying takes gold and grants the stat", await p.evaluate(() => G.me.items.length === 1 && G.me.gold < 500 && G.me.stat.ms > G.me.C.ms));
  await p.keyboard.press("Escape");
  ok("Escape closes the shop", await p.evaluate(() => !G.shopOpen && !G.paused));
  await p.keyboard.press("p");
  ok("P reopens it in the fountain", await p.evaluate(() => G.shopOpen));
  await p.keyboard.press("Escape");

  await p.keyboard.press("Control+q");
  ok("Ctrl+Q spends a skill point", await p.evaluate(() => G.me.ranks[0] === 1 && G.me.points === 0));

  const x0 = await p.evaluate(() => G.me.x);
  await p.mouse.move(1000, 430);
  await p.mouse.click(1000, 430, { button: "right" });
  await p.waitForTimeout(1200);
  ok("right click moves", (await p.evaluate(() => G.me.x)) > x0 + 60);

  // ---------------------------------------------------------------- casting
  const mp0 = await p.evaluate(() => G.me.mp);
  await p.mouse.move(1200, 430);
  await p.keyboard.press("q");
  await p.waitForTimeout(60);
  const mid = await p.evaluate(() => ({ casting: !!G.me.casting, armed: G.armed, mp: G.me.mp, cd: G.me.cds[0], projs: G.projs.length }));
  ok("Q quick-casts from the key alone", mid.casting && mid.armed === -1);
  ok("the wind-up takes mana and cooldown but fires nothing yet", mid.mp < mp0 && mid.cd > 0 && mid.projs === 0);
  ok("the wind-up roots you", await p.evaluate(() => { const x = G.me.x; for (let i = 0; i < 5; i++) stepGame(1 / 60); return Math.abs(G.me.x - x) < 0.01; }));
  await p.waitForTimeout(400);
  ok("the projectile then flies", await p.evaluate(() => !G.me.casting && G.projs.length > 0));
  await p.keyboard.press("e");
  ok("an unlearned ability refuses", await p.evaluate(() => !G.me.casting && G.armed === -1));
  await p.evaluate(() => { G.me.cds = [0, 0, 0, 0]; G.me.mp = G.me.maxMp; G.me.casting = null; });
  await p.click("#abilities .ab:nth-child(1)");
  ok("clicking the icon arms for a careful aim", await p.evaluate(() => G.armed === 0));
  await p.mouse.click(1150, 420);
  await p.waitForTimeout(60);
  ok("then the click casts it", await p.evaluate(() => G.armed === -1 && !!G.me.casting));

  // ---------------------------------------------------------------- recall, attack, camera
  await p.evaluate(() => { G.me.casting = null; });
  await p.keyboard.press("b");
  await p.waitForTimeout(150);
  ok("B starts a recall", await p.evaluate(() => G.me.recall > 0));
  await p.evaluate(() => damage(G.bot, G.me, 10, "phys"));
  ok("damage interrupts the recall", await p.evaluate(() => G.me.recall === 0));

  await p.evaluate(() => { for (let i = 0; i < 900; i++) stepGame(1 / 30); });
  ok("right-click attack damages a minion", await p.evaluate(() => {
    const m = G.units.find((u) => u.kind === "minion" && u.team === 1);
    if (!m) return false;
    m.x = G.me.x + 60; m.y = G.me.y; orderAttack(G.me, m);
    const hp = m.hp;
    for (let i = 0; i < 90; i++) stepGame(1 / 30);
    return m.dead || m.hp < hp;
  }));

  ok("wheel zooms and clicks still land where you point", await p.evaluate(() => {
    const before = G.zoom;
    board.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    const r = board.getBoundingClientRect();
    const w = toWorld({ clientX: r.left + 100, clientY: r.top + 100 });
    return G.zoom > before && Math.abs(w.x - (G.cam.x + 100 / G.zoom)) < 0.01;
  }));

  // ---------------------------------------------------------------- feel
  await fresh(3);   // BULWARK
  await p.keyboard.press("Escape");
  const cam = await p.evaluate(() => {
    G.me.x = WORLD_W / 2; G.me.y = LANE_ROW * TILE;
    orderMove(G.me, G.me.x + 400, G.me.y);
    let worst = 0;
    for (let i = 0; i < 90; i++) { stepGame(1 / 60); camUpdate(1 / 60); worst = Math.max(worst, Math.abs(G.me.x - G.cam.x - viewW() / 2)); }
    G.me.x = 120; camUpdate(1 / 60);
    return { worst, edge: G.cam.x === 0 };
  });
  ok("the camera holds your dot dead centre while moving", cam.worst < 0.01, cam.worst.toFixed(3) + "px");
  ok("...and still stops at the map edge", cam.edge);

  ok("a wave standing on you cannot push you", await p.evaluate(() => {
    orderStop(G.me);
    const ms = [];
    for (let i = 0; i < 6; i++) { const m = makeMinion(1, "melee", G.me.x, 0); m.y = G.me.y + (i - 3) * 9; ms.push(m); }
    const x = G.me.x, y = G.me.y;
    for (let i = 0; i < 120; i++) separate();
    const moved = len(G.me.x - x, G.me.y - y);
    for (const m of ms) { G.units.splice(G.units.indexOf(m), 1); G.byId.delete(m.id); }
    return moved < 0.01;
  }));

  const ratio = await p.evaluate(() => G.me.stat.ms / MINION.melee.ms);
  ok("you move at about the wave's pace", ratio > 1.0 && ratio < 1.3, ratio.toFixed(2) + "x");

  const form = await p.evaluate(() => {
    G.units = G.units.filter((u) => u.kind !== "minion");
    G.wave = 0; spawnWave();
    const mine = G.units.filter((u) => u.kind === "minion" && u.team === 0);
    const rows = new Set(mine.map((m) => Math.round(m.yBias)));
    for (let i = 0; i < 600; i++) stepGame(1 / 60);
    const drift = mine.filter((m) => !m.dead).map((m) => Math.abs(m.y - (LANE_ROW * TILE + TILE / 2) - m.yBias));
    return { rows: rows.size, drift: Math.max(...drift) };
  });
  ok("a wave spawns in ranks", form.rows >= 3, form.rows + " rows");
  ok("minions hold their row while marching", form.drift < 12, form.drift.toFixed(1) + "px");

  ok("the pace control clamps to 0.5x - 1.5x", await p.evaluate(() => { setSpeed(0.2); const a = G.speed; setSpeed(9); const b = G.speed; setSpeed(0.9); return a === 0.5 && b === 1.5; }));
  ok("the lane is wide enough to walk around a wave", (await p.evaluate(() => (LANE_BOT - LANE_TOP + 1) * TILE)) >= 250);

  // ---------------------------------------------------------------- held movement follows a STILL cursor
  ok("holding right-click keeps following a cursor that never moves", await p.evaluate(() => {
    G.me.x = 300; G.me.y = LANE_ROW * TILE + TILE / 2; orderStop(G.me);
    G.mouse.sx = G.view.w / 2 + 300; G.mouse.sy = G.view.h / 2;      // parked to the right of the dot
    G.rmb = true; G.holdT = 0;
    const start = G.me.x;
    for (let i = 0; i < 900; i++) { camUpdate(1 / 60); syncMouse(); stepHeldMove(1 / 60); stepGame(1 / 60); }
    G.rmb = false;
    return G.me.x - start > 500;      // far past where the cursor stood when the button went down
  }));

  // ---------------------------------------------------------------- a skillshot you can walk out of
  const dodge = await p.evaluate(() => {
    for (const u of G.units.filter((u) => u.kind === "minion")) { G.units.splice(G.units.indexOf(u), 1); G.byId.delete(u.id); }
    G.me.x = WORLD_W / 2; G.me.y = LANE_ROW * TILE + TILE / 2; G.me.hp = G.me.maxHp; G.me.dead = false;
    const bot = G.bot; bot.x = G.me.x + 320; bot.y = G.me.y; bot.dead = false;
    bot.champ = "VECTOR"; bot.C = CHAMPS.VECTOR; recalc(bot, true);
    bot.ranks = [1, 0, 0, 0]; bot.cds = [0, 0, 0, 0]; bot.mp = bot.maxMp; bot.casting = null;
    const hp = G.me.hp;
    tryCast(bot, 0, G.me.x, G.me.y);
    const telegraphed = !!bot.casting;
    orderMove(G.me, G.me.x, G.me.y - 130);
    for (let i = 0; i < 150; i++) stepGame(1 / 60);
    return { telegraphed, dodged: G.me.hp >= hp };
  });
  ok("an enemy skillshot telegraphs before it fires", dodge.telegraphed);
  ok("stepping off the line dodges it", dodge.dodged);

  // ---------------------------------------------------------------- seeing what you will hit
  ok("the enemy under your cursor is targeted", await p.evaluate(() => {
    G.me.x = 3000; G.me.y = LANE_ROW * TILE + TILE / 2; G.me.dead = false; G.paused = false; G.armed = -1;
    const m = makeMinion(1, "melee", G.me.x + 90, 0); m.y = G.me.y;
    camUpdate(1 / 60);
    G.mouse.sx = (m.x - G.cam.x) * G.zoom; G.mouse.sy = (m.y - G.cam.y) * G.zoom; syncMouse();
    updateHover();
    const hit = G.hover === m;
    G.mouse.sx = 5; G.mouse.sy = 5; syncMouse(); updateHover();
    const clear = G.hover === null;
    G.units.splice(G.units.indexOf(m), 1); G.byId.delete(m.id);
    return hit && clear;
  }));

  ok("a minion glows only when your next hit kills it", await p.evaluate(() => {
    const m = makeMinion(1, "melee", G.me.x + 90, 0);
    m.hp = myHit(m) + 5; const notYet = !killable(m);
    m.hp = myHit(m) - 1; const now = killable(m);
    G.units.splice(G.units.indexOf(m), 1); G.byId.delete(m.id);
    return notYet && now;
  }));

  ok("attacks lunge", await p.evaluate(() => {
    const m = makeMinion(1, "melee", G.me.x + 30, 0); m.y = G.me.y;
    autoAttack(G.me, m);
    const l = G.me.lunge && G.me.lunge.t > 0;
    G.units.splice(G.units.indexOf(m), 1); G.byId.delete(m.id);
    return !!l;
  }));

  // ---------------------------------------------------------------- pause
  await fresh(1);
  await p.keyboard.press("Escape");                    // close the opening shop
  await p.keyboard.press("Escape");                    // nothing open: this one pauses
  ok("Escape with nothing open pauses", await p.evaluate(() => G.paused && !document.getElementById("pause").hidden));
  const clk = await p.evaluate(() => G.clock);
  await p.waitForTimeout(500);
  ok("nothing advances while paused", (await p.evaluate(() => G.clock)) === clk);
  await p.keyboard.press("Escape");
  ok("Escape resumes", await p.evaluate(() => !G.paused));
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  ok("switching away pauses", await p.evaluate(() => G.paused));
  await p.click("#resume");

  // ---------------------------------------------------------------- difficulty
  const diff = await p.evaluate(() => {
    const out = {};
    for (const d of ["easy", "normal", "hard"]) {
      G.diff = d;
      G.me.shieldHp = 0; G.me.hp = G.me.maxHp = 100000;
      out[d] = damage(G.bot, G.me, 100, "true");
    }
    return out;
  });
  ok("the bot hits softer on easy and harder on hard", Math.abs(diff.easy - 70) < 0.5 && Math.abs(diff.normal - 100) < 0.5 && Math.abs(diff.hard - 120) < 0.5,
    `${diff.easy.toFixed(0)} / ${diff.normal.toFixed(0)} / ${diff.hard.toFixed(0)} per 100`);

  const ult = await p.evaluate(() => {
    const out = {};
    for (const d of ["easy", "normal"]) {
      G.diff = d;
      const bot = G.bot; bot.casting = null; bot.cds = [0, 0, 0, 0]; bot.mp = bot.maxMp = 9999; bot.ranks = [0, 0, 0, 1];
      G.me.x = bot.x - 100; G.me.y = bot.y; G.me.dead = false;
      castRotation(bot, G.me, true, 100);
      out[d] = bot.cds[3] > 0;
      bot.casting = null; bot.cds = [0, 0, 0, 0];
    }
    return out;
  });
  ok("the bot never ults on easy, and does on normal", ult.easy === false && ult.normal === true);

  const dodges = await p.evaluate(() => {
    const out = {};
    for (const d of ["easy", "normal", "hard"]) {
      G.diff = d;
      const bot = G.bot; bot.x = 2600; bot.y = LANE_ROW * TILE + TILE / 2; bot.casting = null; bot.dash = null; bot.stun = 0; bot.dead = false;
      G.projs.length = 0;
      // a spell that has been in the air long enough to react to, and that the bot has spotted
      G.projs.push({ x: bot.x - 200, y: bot.y, vx: 520, vy: 0, team: 0, owner: G.me.id, dmg: 1, type: "phys", r: 7, hit: new Set(), life: 1, pierce: true, born: G.clock - 1, noticed: true });
      out[d] = dodgeIncoming(bot);
      G.projs.length = 0; bot.path = null; bot.order = null;
    }
    return out;
  });
  ok("only the hard bot steps out of a spell in flight", !dodges.easy && !dodges.normal && dodges.hard);

  // ...and it is beatable: it needs a moment to react, and it does not spot every spell
  const human = await p.evaluate(() => {
    G.diff = "hard";
    const bot = G.bot; bot.x = 2600; bot.y = LANE_ROW * TILE + TILE / 2; bot.casting = null; bot.dash = null; bot.stun = 0; bot.dead = false;
    const shot = (extra) => ({ x: bot.x - 200, y: bot.y, vx: 520, vy: 0, team: 0, owner: G.me.id, dmg: 1, type: "phys", r: 7, hit: new Set(), life: 1, pierce: true, ...extra });
    G.projs.length = 0; G.projs.push(shot({ born: G.clock, noticed: true }));
    const tooSoon = dodgeIncoming(bot);
    G.projs.length = 0; G.projs.push(shot({ born: G.clock - 1, noticed: false }));
    const unseen = dodgeIncoming(bot);
    G.projs.length = 0; bot.path = null; bot.order = null;
    let seen = 0; for (let i = 0; i < 400; i++) { G.projs.push(shot({ born: G.clock - 1 })); if (dodgeIncoming(bot)) seen++; G.projs.length = 0; bot.path = null; bot.order = null; }
    return { tooSoon, unseen, rate: seen / 400 };
  });
  ok("the hard bot cannot react to a spell the instant it is fired", human.tooSoon === false);
  ok("...and it does not spot every spell", human.unseen === false && human.rate > 0.5 && human.rate < 0.75, `notices ${(human.rate * 100).toFixed(0)}%`);

  // ---------------------------------------------------------------- it remembers you
  await p.evaluate(() => { setSpeed(1.3); G.diff = "hard"; store.set("diff", "hard"); });
  await p.reload();
  await p.waitForTimeout(250);
  const kept = await p.evaluate(() => ({ speed: G.speed, diff: G.diff, on: document.querySelector('#diffSeg [aria-checked="true"]').dataset.k }));
  ok("pace and difficulty survive a reload", kept.speed === 1.3 && kept.diff === "hard" && kept.on === "hard", JSON.stringify(kept));

  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(250);
  await p.click("#picks .pick:nth-child(1)");
  await p.waitForTimeout(200);
  await p.evaluate(() => { for (let i = 0; i < 200; i++) stepGame(1 / 30); });
  const tip1 = await p.evaluate(() => JSON.parse(localStorage.getItem("dotlegend.tips") || "{}"));
  ok("the first coaching tip appears once and is remembered", !!tip1.move);
  await p.evaluate(() => { document.getElementById("feed").innerHTML = ""; for (let i = 0; i < 200; i++) stepGame(1 / 30); });
  ok("...and is not repeated", await p.evaluate(() => !document.getElementById("feed").innerHTML.includes("to move")));

  ok("first-time players get easy", await (async () => {
    await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(200);
    return p.evaluate(() => G.diff === "easy");
  })());

  ok("no runtime errors", errs.length === 0);
  if (errs.length) console.log(errs.slice(0, 5).join("\n"));
  await b.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
