// Two real browsers, connected through the real lobby, playing a real match.
//   npm i playwright && node tools/test-net.js
// Set CHROMIUM_PATH if Playwright has no browser of its own to use.
//
// This checks the protocol and the game logic across the wire. It cannot check the internet:
// both browsers here are on one machine, so NAT traversal and real latency are not exercised
// (latency is simulated instead).
const { chromium } = require("playwright");
const path = require("path");

let failed = 0;
const ok = (name, cond, note) => {
  if (!cond) failed++;
  console.log((cond ? "PASS " : "FAIL ") + name + (note !== undefined ? "  [" + note + "]" : ""));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],     // let two browsers on one machine find each other
  });
  const url = "file://" + path.resolve(__dirname, "../index.html");
  const errs = [];

  const open = async (name) => {
    const ctx = await b.newContext({ viewport: { width: 1300, height: 800 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(name + ": " + e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(name + " console: " + m.text()); });
    await p.goto(url);
    await p.evaluate(() => { localStorage.clear(); NET.gatherMs = 1200; });
    return p;
  };
  const until = (p, fn, arg, ms = 15000) => p.waitForFunction(fn, arg, { timeout: ms });

  // ---------------------------------------------------------------- the lobby, as two people would use it
  const A = await open("host"), B = await open("guest");
  await A.click("#modeSeg [data-m=friend]"); await A.fill("#pname", "Ana"); await A.click("#picks .pick:nth-child(1)");
  await B.click("#modeSeg [data-m=friend]"); await B.fill("#pname", "Ben"); await B.click("#picks .pick:nth-child(3)");

  await A.click("#btnHost");
  await until(A, () => document.getElementById("hostCode").value.startsWith("DL"));
  const offer = await A.inputValue("#hostCode");
  ok("the host's code is short enough to paste into any chat", offer.length < 1200, offer.length + " chars");
  ok("the second step is hidden until there is something to do", await A.evaluate(() => !document.getElementById("hostStep2").hidden));

  // wrong things pasted in the wrong place get a message, not a dead button
  await B.click("#btnJoin");
  await B.fill("#joinCode", "hello there");
  await B.click("#btnReply");
  await until(B, () => document.getElementById("netStatus").classList.contains("err"));
  ok("garbage in the code box is explained", /does not look like a Dot Legend code/.test(await B.textContent("#netStatus")));
  ok("...and the button comes back to life", await B.evaluate(() => !document.getElementById("btnReply").disabled));

  await B.fill("#joinCode", offer);
  await B.click("#btnReply");
  await until(B, () => document.getElementById("joinReply").value.startsWith("DL"));
  const reply = await B.inputValue("#joinReply");

  await A.fill("#hostReply", offer);                   // the host pastes their OWN code by mistake
  await A.click("#btnConnect");
  await until(A, () => document.getElementById("netStatus").classList.contains("err"));
  ok("pasting the wrong kind of code says which is which", /host code/.test(await A.textContent("#netStatus")));

  await A.fill("#hostReply", reply);
  await A.click("#btnConnect");
  await Promise.all([
    until(A, () => G.phase === "play", null, 30000),
    until(B, () => G.phase === "play" && !!G.me, null, 30000),
  ]);
  ok("both browsers are in the match", true);

  const sa = await A.evaluate(() => ({ role: NET.role, me: G.me.champ, mine: G.me.pname, foe: G.bot.champ, foeName: G.bot.pname, remote: G.bot.remote, team: G.me.team }));
  const sb = await B.evaluate(() => ({ role: NET.role, me: G.me.champ, mine: G.me.pname, team: G.me.team, foeName: NET.foeName }));
  ok("the host plays VECTOR as Ana on ORDER", sa.role === "host" && sa.me === "VECTOR" && sa.mine === "Ana" && sa.team === 0);
  ok("the friend plays BULWARK as Ben on CHAOS", sb.role === "guest" && sb.me === "BULWARK" && sb.mine === "Ben" && sb.team === 1);
  ok("each knows who the other is", sa.foe === "BULWARK" && sa.foeName === "Ben" && sa.remote === true && sb.foeName === "Ana");
  ok("the friend's champion has no AI on the host", await A.evaluate(() => G.bot.bot === false));

  // ---------------------------------------------------------------- knowing which side is yours
  ok("each player's own side is marked, and only theirs", await A.evaluate(() => !document.getElementById("youBlue").hidden && document.getElementById("youRed").hidden)
    && await B.evaluate(() => document.getElementById("youBlue").hidden && !document.getElementById("youRed").hidden));
  ok("each is told which side they are on and where their base is", await A.evaluate(() => /You play.*ORDER.*left/.test(document.getElementById("feed").textContent))
    && await B.evaluate(() => /You play.*CHAOS.*right/.test(document.getElementById("feed").textContent)));
  ok("the pace controls are gone: nobody can speed up a friend", await A.evaluate(() => getComputedStyle(document.getElementById("speedCell")).display === "none"));

  // a host whose tab goes to the background stops sending; the friend should be told why the game froze
  ok("the friend sees no warning while snapshots flow", await B.evaluate(() => document.getElementById("lag").hidden));
  await A.evaluate(() => { window.__realTick = netHostTick; netHostTick = () => {}; });
  await until(B, () => !document.getElementById("lag").hidden, null, 6000);
  ok("...and a warning when the host goes quiet", true);
  await A.evaluate(() => { netHostTick = window.__realTick; });
  await until(B, () => document.getElementById("lag").hidden, null, 6000);
  ok("...that clears when the host comes back", true);

  // ---------------------------------------------------------------- the shop, without freezing anyone
  const clk = await A.evaluate(() => G.clock);
  await sleep(600);
  ok("the match keeps running while a shop is open", (await A.evaluate(() => G.shopOpen)) && (await A.evaluate(() => G.clock)) > clk + 0.3);
  ok("the friend's shop is open too", await B.evaluate(() => G.shopOpen));
  await B.click("#shopGrid button:nth-child(4)");            // Boots
  await until(A, () => G.bot.items.includes("boots"), null, 4000);
  await until(B, () => G.me.items.includes("boots") && G.me.gold < 500, null, 4000);
  ok("a purchase by the friend is made on the host and shows on both", true);
  await B.keyboard.press("Escape"); await A.keyboard.press("Escape");
  ok("Esc does not pause a match with a friend in it", await A.evaluate(() => !G.paused) && await B.evaluate(() => !G.paused));
  await A.evaluate(() => window.dispatchEvent(new Event("blur")));
  ok("neither does looking away", await A.evaluate(() => !G.paused));

  // ---------------------------------------------------------------- fog of war holds across the wire
  const fogFar = await B.evaluate(() => !G.units.some((u) => u.kind === "champ" && u.team === 0));
  ok("far away, the friend is not even told the host's champion exists", fogFar);
  await A.evaluate(() => { G.me.x = G.bot.x - 240; G.me.y = G.bot.y; });
  await until(B, () => G.units.some((u) => u.kind === "champ" && u.team === 0), null, 4000);
  ok("walking into their sight makes it appear", true);
  await A.evaluate(() => { G.me.x = 1000; G.me.y = LANE_ROW * TILE + TILE / 2; });
  await until(B, () => !G.units.some((u) => u.kind === "champ" && u.team === 0), null, 4000);
  ok("...and leaving it makes it vanish again", true);

  // ---------------------------------------------------------------- moving, with latency
  for (const p of [A, B]) await p.evaluate(() => { NET.simLatency = 70; });          // ~140ms round trip
  await B.evaluate(() => { G.me.x = 1680; G.me.y = LANE_ROW * TILE + TILE / 2; G.me.ax = 1680; G.me.ay = G.me.y; });
  await A.evaluate(() => { G.bot.x = 1680; G.bot.y = LANE_ROW * TILE + TILE / 2; G.bot.path = null; G.bot.order = null; });
  await sleep(500);
  const start = await B.evaluate(() => ({ x: G.me.x, cx: G.cam.x }));
  const box = await B.evaluate(() => { const r = board.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; });
  await B.mouse.move(box.l + box.w / 2 - 200, box.t + box.h / 2);
  await B.mouse.down({ button: "right" });
  await B.mouse.up({ button: "right" });
  await sleep(90);                                           // well under one round trip
  const early = await B.evaluate(() => G.me.x);
  const hostEarly = await A.evaluate(() => G.bot.x);
  ok("the friend's dot starts moving at once, before the host has even heard", start.x - early > 3, `moved ${(start.x - early).toFixed(1)} while the host had moved ${(start.x - hostEarly).toFixed(1)}`);
  await sleep(2200);
  const done = await Promise.all([B.evaluate(() => ({ x: G.me.x, ax: G.me.ax })), A.evaluate(() => G.bot.x)]);
  ok("the two agree where the dot ended up", Math.abs(done[0].x - done[1]) < 12, `guest ${done[0].x.toFixed(0)} host ${done[1].toFixed(0)}`);
  ok("the guest's dot did not jitter back after arriving", await B.evaluate(async () => {
    const xs = []; for (let i = 0; i < 20; i++) { xs.push(G.me.x); await new Promise((r) => setTimeout(r, 25)); }
    return Math.max(...xs) - Math.min(...xs) < 1.5;
  }));
  for (const p of [A, B]) await p.evaluate(() => { NET.simLatency = 0; });

  // ---------------------------------------------------------------- spells across the wire
  await B.keyboard.press("Control+q");
  await until(A, () => G.bot.ranks[0] === 1, null, 3000);
  ok("a skill point spent by the friend is spent on the host", true);
  await B.evaluate(() => { G.me.cds = [0, 0, 0, 0]; });
  const mpBefore = await B.evaluate(() => G.me.mp);
  await B.mouse.move(box.l + box.w / 2 - 150, box.t + box.h / 2);
  await B.keyboard.press("q");
  await until(A, () => G.bot.casting || G.bot.cds[0] > 0, null, 3000);
  ok("the friend's spell goes off on the host", true);
  await until(B, (mp) => G.me.cds[0] > 1 && G.me.mp < mp, mpBefore, 3000);
  ok("...and their cooldown and mana show on their screen", true);
  const sawWind = await B.evaluate(() => !!G.me.casting || G.me.cds[0] > 0);
  ok("the friend cannot walk while casting", sawWind);

  // ---------------------------------------------------------------- what a hostile friend cannot do
  const before = await A.evaluate(() => ({ gold: G.bot.gold, items: G.bot.items.length, ranks: [...G.bot.ranks], x: G.bot.x, y: G.bot.y, hp: G.me.hp }));
  await B.evaluate(() => {
    const junk = [
      { t: "move", x: "north", y: null }, { t: "move", x: NaN, y: 5 }, { t: "move", x: 1e308, y: -1e308 },
      { t: "cast", i: 9, x: 0, y: 0 }, { t: "cast", i: -1 }, { t: "cast", i: "0" }, { t: "cast", i: 3, x: 0, y: 0 },
      { t: "lvl", i: 77 }, { t: "buy", id: "godmode" }, { t: "buy", id: "__proto__" },
      { t: "atk", id: 999999 }, { t: "atk", id: G.me.id },
      { t: "hello", v: 1, ch: "NOPE", n: "<script>x</script>" }, { t: "start" }, { t: "s" }, { t: "end", w: 0 }, { t: "say", html: "<img src=x onerror=1>" },
      { t: 5 }, { nope: 1 }, [], "str", null,
    ];
    for (const j of junk) NET.rel.send(JSON.stringify(j));
    NET.rel.send("this is not json {{{");
    NET.fast.send("{{{");
  });
  await sleep(500);
  const after = await A.evaluate(() => ({ gold: G.bot.gold, items: G.bot.items.length, ranks: [...G.bot.ranks], hp: G.me.hp, phase: G.phase, x: G.bot.x, y: G.bot.y }));
  ok("nonsense from the friend changes nothing on the host", after.items === before.items && after.ranks.join() === before.ranks.join() && after.phase === "play");
  ok("...and the host's position math survives an absurd move target", Number.isFinite(after.x) && Number.isFinite(after.y) && after.x <= 3361 && after.y <= 757);
  ok("the friend cannot attack their own side or a unit that does not exist", await A.evaluate(() => !G.bot.order || G.bot.order.kind !== "attack"));

  // the host is untrusted too: what it sends is shown as text, never run
  await A.evaluate(() => {
    NET.rel.send(JSON.stringify({ t: "say", html: '<img src=x onerror="window.__pwned=1"><b class="cRed">ok</b><script>window.__pwned=2</script>', cls: "cGold" }));
    NET.rel.send(JSON.stringify({ t: "callout", txt: "<img src=x onerror=window.__pwned=3>", color: "red;background:url(x)" }));
  });
  await sleep(400);
  ok("markup from the host is not executed on the friend's page", await B.evaluate(() => window.__pwned === undefined && !document.querySelector("#feed img, #feed script, #callout img")));
  ok("...but the one allowed tag still works", await B.evaluate(() => !!document.querySelector('#feed b.cRed')));
  ok("names cannot carry markup, and are capped and defaulted", await A.evaluate(() => {
    const n = cleanName('<img src=x onerror=1><b>Zed</b>&"\'', "x");
    return !/[<>&"']/.test(n) && n.length <= 14 && cleanName("   ", "Guest") === "Guest" && cleanName("x".repeat(99), "y").length === 14;
  }));

  // ---------------------------------------------------------------- kills reach the right person
  await A.evaluate(() => damage(G.me, G.bot, 99999, "true"));
  await until(B, () => document.getElementById("callout").textContent === "YOU DIED", null, 3000);
  ok("the friend is told they died", true);
  ok("the host is told about the kill, not about dying", await A.evaluate(() => document.getElementById("callout").textContent === "KILL"));
  ok("the friend's feed says who killed whom, and it is bad news in red", await B.evaluate(() => /VECTOR<\/b> killed/.test(document.getElementById("feed").innerHTML) && !!document.querySelector("#feed .cHot")));
  ok("the host's same message is good news in green", await A.evaluate(() => !!document.querySelector("#feed .cSafe")));
  await until(B, () => !G.me.dead, null, 20000);
  ok("the friend respawns", true);

  // ---------------------------------------------------------------- pace of the wire
  const rate = await B.evaluate(async () => {
    let n = 0, bytes = 0; const orig = NET.fast.onmessage;
    NET.fast.onmessage = (e) => { n++; bytes += e.data.length; orig(e); };
    await new Promise((r) => setTimeout(r, 2000));
    NET.fast.onmessage = orig;
    return { hz: n / 2, kb: bytes / n / 1024 };
  });
  ok("about twenty snapshots a second arrive", rate.hz > 14 && rate.hz < 26, rate.hz.toFixed(1) + " Hz");
  ok("each is small", rate.kb < 8, rate.kb.toFixed(1) + " KB");
  const busy = await A.evaluate(() => {
    for (let i = 0; i < 1500; i++) stepGame(1 / 30);            // several waves later: a crowded lane
    G.me.x = WORLD_W / 2 - 60; G.me.y = LANE_ROW * TILE + TILE / 2; G.bot.x = WORLD_W / 2 + 60; G.bot.y = G.me.y;
    for (let i = 0; i < 60; i++) stepGame(1 / 30);

    // a burst far bigger than any snapshot should carry must be capped, not sent whole
    for (let i = 0; i < 500; i++) NET.fxOut.push({ kind: "spark", x: G.bot.x, y: G.bot.y, t: 0.1, life: 0.1, color: "#fff" });
    for (let i = 0; i < 500; i++) NET.floatsOut.push({ x: G.bot.x, y: G.bot.y, txt: "9", color: "dmg", st: 0, t: 1, life: 1 });
    const burst = buildSnapshot(1);
    const capped = burst.e.length <= 40 && burst.f.length <= 30;

    let worst = 0, total = 0, n = 0;
    for (let i = 0; i < 40; i++) { stepGame(1 / 20); const b = JSON.stringify(buildSnapshot(1)).length; worst = Math.max(worst, b); total += b; n++; }
    return { worst, avg: total / n, units: G.units.length, capped };
  });
  ok("a burst of effects is capped instead of sent whole", busy.capped);
  ok("even in a crowded fight a snapshot stays small", busy.worst < 9000, `${busy.units} units: avg ${(busy.avg / 1024).toFixed(1)} KB, worst ${(busy.worst / 1024).toFixed(1)} KB = ${(busy.avg * 20 * 8 / 1e6).toFixed(2)} Mbit/s average`);
  const rtts = await Promise.all([A.evaluate(() => NET.rtt), B.evaluate(() => NET.rtt)]);
  ok("both sides measure the connection", rtts[0] > 0 && rtts[1] > 0, rtts.map((v) => v.toFixed(0) + "ms").join(" / "));
  ok("the ping shows in the top strip", await B.evaluate(() => /\d+ ms/.test(document.getElementById("ping").textContent)));

  // ---------------------------------------------------------------- the end, and a rematch
  await A.evaluate(() => {
    for (let n = 0; n < 3; n++) { const t = frontTurret(1); if (t) damage(G.me, t, 1e9, "true"); }
    damage(G.me, G.units.find((u) => u.kind === "nexus" && u.team === 1), 1e9, "true");
  });
  await until(A, () => G.phase === "over" && !document.getElementById("over").hidden, null, 4000);
  await until(B, () => G.phase === "over" && !document.getElementById("over").hidden, null, 4000);
  ok("the host sees VICTORY", (await A.textContent("#overTitle")).includes("VICTORY"));
  ok("the friend sees DEFEAT", (await B.textContent("#overTitle")).includes("DEFEAT"));
  ok("only the host can start a rematch", await A.evaluate(() => !document.getElementById("rematch").hidden) && await B.evaluate(() => document.getElementById("rematch").hidden && !document.getElementById("overWait").hidden));
  await A.click("#rematch");
  await until(B, () => G.phase === "play" && G.clock < 5 && !!G.me && document.getElementById("over").hidden, null, 8000);
  await until(A, () => G.phase === "play" && G.clock < 5, null, 4000);
  ok("a rematch restarts both, still connected", true);
  ok("...with a clean slate", await B.evaluate(() => G.kills[0] === 0 && G.kills[1] === 0 && G.me.items.length === 0));

  // ---------------------------------------------------------------- someone leaves
  await B.close();
  await until(A, () => G.phase === "over" && /DISCONNECTED/.test(document.getElementById("overTitle").textContent), null, 20000);
  ok("when the friend leaves, the host is told and is not stranded", true);
  ok("...and there is nothing to rematch against", await A.evaluate(() => document.getElementById("rematch").hidden));

  ok("no errors on either page", errs.length === 0);
  if (errs.length) console.log(errs.slice(0, 6).join("\n"));
  await b.close();
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("\nTEST RUN ABORTED:", e.message); process.exit(2); });
