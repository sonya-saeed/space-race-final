(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const screens = ["homeScreen", "gameScreen", "resultScreen"];
  const storageKey = "spaceRaceProfileV1";
  const defaultProfile = { lastName: "", totalXp: 0, bestAccuracy: null, crewCode: "" };
  let profile = loadProfile();
  let pilotName = "";
  let selectedAnswer = null;
  let answerSubmitted = false;
  let activeQuestion = null;
  let questionsAsked = 0, correctAnswers = 0, earnedXp = 0;
  let startedAt = 0, elapsed = 0, lastFrame = 0;
  let running = false, paused = false, soundOn = false;
  let obstacleTimer = 0, questionCooldown = 0;
  const keys = new Set();
  const player = { x: 130, y: 260, size: 18, speed: 265 };
  const stars = Array.from({length:95}, () => ({x:Math.random()*900,y:Math.random()*520,s:Math.random()*2+0.5,v:Math.random()*35+15}));
  let asteroids = [];
  const canvas = $("gameCanvas"), ctx = canvas.getContext("2d");

  const questionBank = [
    {domain:"ATTENTION",title:"SIGNAL SCAN",text:"Which symbol is different from the others?",choices:["◆ ◆ ◆ ◇ ◆","● ● ● ● ●","▲ ▲ ▲ ▲ ▲","■ ■ ■ ■ ■"],answer:0},
    {domain:"ATTENTION",title:"FOCUS FILTER",text:"Select the number 7.",choices:["1  3  5  9","2  4  6  8","7  2  4  1","3  5  8  9"],answer:2},
    {domain:"MEMORY",title:"SEQUENCE RECALL",text:"Remember this sequence: 4 – 9 – 2. Which option repeats it?",choices:["4 – 2 – 9","4 – 9 – 2","9 – 4 – 2","2 – 9 – 4"],answer:1},
    {domain:"MEMORY",title:"PATTERN MEMORY",text:"A beacon flashed BLUE, PINK, BLUE. What was the middle colour?",choices:["BLUE","CYAN","PINK","PURPLE"],answer:2},
    {domain:"VISUOSPATIAL",title:"SHAPE MATCH",text:"Which shape has four equal sides and four right angles?",choices:["Circle","Square","Triangle","Oval"],answer:1},
    {domain:"VISUOSPATIAL",title:"ORIENTATION",text:"If your ship turns 90° clockwise from facing up, which way does it face?",choices:["Left","Down","Right","Up"],answer:2},
    {domain:"LANGUAGE",title:"WORD LINK",text:"Which word is closest in meaning to 'rapid'?",choices:["Distant","Swift","Quiet","Careful"],answer:1},
    {domain:"LANGUAGE",title:"WORD LOGIC",text:"Choose the word that does not belong.",choices:["Comet","Planet","Asteroid","Microscope"],answer:3},
    {domain:"REASONING",title:"NUMBER PATTERN",text:"What comes next? 3, 6, 12, 24, ...",choices:["30","36","48","54"],answer:2},
    {domain:"REASONING",title:"LOGIC CHECK",text:"All Zorbs are blue. This object is a Zorb. What must be true?",choices:["It is blue","It is red","It can fly","It is a star"],answer:0}
  ];
  let questionQueue = [];

  function loadProfile() {
    try { return {...defaultProfile, ...JSON.parse(localStorage.getItem(storageKey) || "{}")}; }
    catch { return {...defaultProfile}; }
  }
  function saveProfile() { localStorage.setItem(storageKey, JSON.stringify(profile)); updateHomeStats(); }
  function updateHomeStats() {
    $("pilotNameDisplay").textContent = profile.lastName || "SPACE CADET";
    $("homeXp").textContent = `${profile.totalXp} XP`;
    $("homeBest").textContent = profile.bestAccuracy === null ? "—" : `${profile.bestAccuracy}%`;
  }
  function showScreen(id) { screens.forEach(s => $(s).classList.toggle("hidden", s !== id)); }
  function openNameDialog() {
    $("displayName").value = profile.lastName || "";
    $("nameDialog").showModal();
    setTimeout(() => $("displayName").focus(), 30);
  }
  $("startButton").addEventListener("click", openNameDialog);
  $("againButton").addEventListener("click", openNameDialog);
  $("cancelName").addEventListener("click", () => $("nameDialog").close());
  $("nameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("displayName").value.trim().replace(/\s+/g, " ").slice(0,18);
    if (!name) { $("displayName").focus(); return; }
    pilotName = name;
    profile.lastName = name;
    saveProfile();
    $("nameDialog").close();
    startMatch();
  });

  function startMatch() {
    questionsAsked = 0; correctAnswers = 0; earnedXp = 0; elapsed = 0;
    questionQueue = [...questionBank].sort(() => Math.random() - .5);
    asteroids = []; obstacleTimer = 1.8; questionCooldown = 0;
    player.x = 130; player.y = 260;
    $("matchPilot").textContent = pilotName.toUpperCase();
    $("xpHud").textContent = "0"; $("questionHud").textContent = "0/5";
    $("timeHud").textContent = "00:00";
    $("pauseOverlay").classList.add("hidden");
    showScreen("gameScreen");
    running = true; paused = false; startedAt = performance.now(); lastFrame = startedAt;
    requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastFrame) / 1000, .04);
    lastFrame = now;
    if (!paused) {
      elapsed = (now - startedAt) / 1000;
      update(dt);
    }
    draw();
    if (running) requestAnimationFrame(loop);
  }
  function update(dt) {
    let dx = 0, dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) dx--;
    if (keys.has("ArrowRight") || keys.has("d")) dx++;
    if (keys.has("ArrowUp") || keys.has("w")) dy--;
    if (keys.has("ArrowDown") || keys.has("s")) dy++;
    if (dx && dy) { dx *= .707; dy *= .707; }
    player.x = Math.max(28, Math.min(872, player.x + dx * player.speed * dt));
    player.y = Math.max(28, Math.min(492, player.y + dy * player.speed * dt));
    stars.forEach(star => { star.x -= star.v * dt; if(star.x < 0){star.x=900;star.y=Math.random()*520;} });
    asteroids.forEach(a => { a.x -= a.v * dt; a.spin += dt; });
    asteroids = asteroids.filter(a => a.x > -50);
    obstacleTimer -= dt; questionCooldown -= dt;
    if (obstacleTimer <= 0 && questionsAsked < 5) {
      asteroids.push({x:940,y:65+Math.random()*390,r:22+Math.random()*17,v:110+questionsAsked*15,spin:0});
      obstacleTimer = 3.5 + Math.random()*2;
    }
    if (questionCooldown <= 0 && asteroids.some(a => Math.hypot(a.x-player.x,a.y-player.y) < a.r+player.size)) {
      const a = asteroids.shift();
      if (questionsAsked < 5) showQuestion();
      questionCooldown = 1.2;
    }
    if (questionsAsked >= 5 && elapsed > 8) finishMatch();
  }
  function draw() {
    ctx.clearRect(0,0,900,520);
    const bg = ctx.createLinearGradient(0,0,900,520); bg.addColorStop(0,"#080B4F"); bg.addColorStop(1,"#030522");
    ctx.fillStyle=bg;ctx.fillRect(0,0,900,520);
    stars.forEach(s=>{ctx.fillStyle=`rgba(210,225,255,${.35+s.s/4})`;ctx.fillRect(s.x,s.y,s.s,s.s);});
    // distant nebula bands
    ctx.fillStyle="rgba(120,37,214,.08)";ctx.beginPath();ctx.ellipse(620,250,250,150,-.2,0,Math.PI*2);ctx.fill();
    asteroids.forEach(a=>{
      ctx.save();ctx.translate(a.x,a.y);ctx.rotate(a.spin);
      ctx.fillStyle="#56528b";ctx.strokeStyle="#32DDF2";ctx.lineWidth=2;
      ctx.beginPath();for(let i=0;i<9;i++){const ang=i*Math.PI*2/9,rad=a.r*(.78+(i%3)*.1);const x=Math.cos(ang)*rad,y=Math.sin(ang)*rad;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    });
    // ship
    ctx.save();ctx.translate(player.x,player.y);
    ctx.fillStyle="#32DDF2";ctx.shadowColor="#32DDF2";ctx.shadowBlur=16;
    ctx.beginPath();ctx.moveTo(24,0);ctx.lineTo(-16,-13);ctx.lineTo(-9,0);ctx.lineTo(-16,13);ctx.closePath();ctx.fill();
    ctx.fillStyle="#F52FCB";ctx.fillRect(-22,-4,8,8);ctx.restore();
    ctx.fillStyle="#a9acd9";ctx.font="11px monospace";ctx.fillText("NAVIGATION ONLINE",18,24);
    ctx.fillStyle="#32DDF2";ctx.fillText("SECTOR 05 // COGNITIVE FLIGHT",18,505);
    if(paused){ctx.fillStyle="#fff";ctx.font="bold 15px monospace";ctx.textAlign="center";ctx.fillText("COGNITIVE CHECK IN PROGRESS",450,42);ctx.textAlign="left";}
  }

  function showQuestion() {
    if (questionsAsked >= 5) return;
    paused = true; $("pauseOverlay").classList.remove("hidden");
    activeQuestion = questionQueue[questionsAsked];
    selectedAnswer = null;
    answerSubmitted = false;
    $("questionDomain").textContent = `${activeQuestion.domain} // COGNITIVE CHECK ${questionsAsked+1}/5`;
    $("questionTitle").textContent = activeQuestion.title;
    $("questionText").textContent = activeQuestion.text;
    $("answerFeedback").textContent = "";
    $("submitAnswer").disabled = true;
    const choices = $("answerChoices"); choices.innerHTML = "";
    activeQuestion.choices.forEach((choice,index)=>{
      const button=document.createElement("button");button.type="button";button.className="answer-choice";button.textContent=choice;
      button.addEventListener("click",()=>{
        selectedAnswer=index;
        choices.querySelectorAll("button").forEach(b=>b.classList.remove("selected"));
        button.classList.add("selected");$("submitAnswer").disabled=false;
      });
      choices.appendChild(button);
    });
    $("questionDialog").showModal();
  }
  $("answerForm").addEventListener("submit",event=>{
    event.preventDefault();
    if (!answerSubmitted) {
      if(selectedAnswer===null)return;
      answerSubmitted = true;
      const correct=selectedAnswer===activeQuestion.answer;
      const gained=correct?150:0;
      if(correct)correctAnswers++;
      earnedXp+=gained;questionsAsked++;
      $("xpHud").textContent=earnedXp;
      $("questionHud").textContent=`${questionsAsked}/5`;
      $("answerFeedback").textContent=correct?`CORRECT // +${gained} XP`:"NOT QUITE // KEEP GOING";
      $("submitAnswer").textContent="CONTINUE";
      $("submitAnswer").disabled=false;
      $("answerChoices").querySelectorAll("button").forEach(b=>b.disabled=true);
      return;
    }
    $("submitAnswer").textContent="SUBMIT ANSWER";
    $("questionDialog").close();
    $("pauseOverlay").classList.add("hidden");
    paused=false;questionCooldown=1.5;
    if(questionsAsked>=5){setTimeout(()=>{if(running)finishMatch();},1200);}
  });

  function finishMatch() {
    if(!running)return;
    running=false;paused=false;
    const accuracy=questionsAsked?Math.round(correctAnswers/questionsAsked*100):0;
    profile.totalXp+=earnedXp;
    if(profile.bestAccuracy===null||accuracy>profile.bestAccuracy)profile.bestAccuracy=accuracy;
    saveProfile();
    $("resultPilot").textContent=pilotName.toUpperCase();
    $("resultAccuracy").textContent=`${accuracy}%`;
    $("resultCorrect").textContent=`${correctAnswers}/${questionsAsked}`;
    $("resultTime").textContent=formatTime(elapsed);
    $("resultXp").textContent=earnedXp;
    $("resultMessage").textContent=accuracy===100?"Outstanding flight. All cognitive checks cleared.":accuracy>=60?"Solid mission. Keep training to improve your next run.":"Mission logged. Every run helps build your baseline.";
    showScreen("resultScreen");
  }
  function formatTime(seconds){const m=Math.floor(seconds/60),s=Math.floor(seconds%60);return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;}
  $("endFlightButton").addEventListener("click",finishMatch);
  $("homeButton").addEventListener("click",()=>showScreen("homeScreen"));
  $("howButton").addEventListener("click",()=>$("infoDialog").showModal());
  $("closeInfo").addEventListener("click",()=>$("infoDialog").close());
  $("joinButton").addEventListener("click",()=>$("joinDialog").showModal());
  $("cancelJoin").addEventListener("click",()=>$("joinDialog").close());
  $("joinForm").addEventListener("submit",e=>{
    e.preventDefault();const code=$("crewCode").value.trim();
    if(!code){$("joinFeedback").textContent="Enter a crew link or code first.";return;}
    profile.crewCode=code;saveProfile();$("joinFeedback").textContent="Crew code saved on this device. Live shared rooms are not connected in this starter.";
  });
  $("soundToggle").addEventListener("click",()=>{
    soundOn=!soundOn;$("soundToggle").textContent=`SOUND: ${soundOn?"ON":"OFF"}`;$("soundToggle").setAttribute("aria-pressed",String(soundOn));
  });
  window.addEventListener("keydown",e=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();
    keys.add(e.key.toLowerCase()===" "?" ":e.key);
  });
  window.addEventListener("keyup",e=>keys.delete(e.key));
  document.querySelectorAll("[data-dir]").forEach(button=>{
    const map={up:"ArrowUp",down:"ArrowDown",left:"ArrowLeft",right:"ArrowRight"};
    const down=e=>{e.preventDefault();keys.add(map[button.dataset.dir]);};
    const up=e=>{e.preventDefault();keys.delete(map[button.dataset.dir]);};
    button.addEventListener("pointerdown",down);button.addEventListener("pointerup",up);
    button.addEventListener("pointerleave",up);button.addEventListener("pointercancel",up);
  });
  updateHomeStats();draw();
})();
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const PREFIX = "spacerace-astro-";
  const me = { id: Math.random().toString(36).slice(2, 10), name: "" };
  let party = null;                       // { code, isHost }
  let state = { meta: null, players: {} };
  let peer = null, conns = [], hostConn = null, queue = [];

  /* ---------- helpers ---------- */
  const savedName = () => { try { return JSON.parse(localStorage.getItem("spaceRaceProfileV1") || "{}").lastName || ""; } catch { return ""; } };
  const cleanName = (v) => String(v || "").trim().replace(/\s+/g, " ").slice(0, 18);
  const genCode = () => { const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const parseCode = (v) => {
    const m = String(v).match(/[?&]party=([A-Za-z0-9]+)/);
    const raw = (m ? m[1] : String(v)).trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    return raw.length === 5 ? raw : "";
  };
  const inviteUrl = (code) => location.origin + location.pathname + "?party=" + code;
  const fresh = (name) => ({ name, state: "ready", correct: 0, total: 0, accuracy: 0, time: 0, xp: 0 });
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
  }

  /* ---------- styles ---------- */
  const style = document.createElement("style");
  style.textContent = `
    .pd-code{font-family:"Press Start 2P",monospace;font-size:24px;letter-spacing:6px;color:var(--pink);text-align:center;margin:10px 0}
    .pd-link{word-break:break-all;font-size:10px;color:var(--cyan);border:1px dashed #555bb8;padding:10px;margin:10px 0 14px}
    .pd-roster{list-style:none;margin:10px 0 18px;padding:0;display:grid;gap:6px;font-size:11px}
    .pd-roster li{display:flex;justify-content:space-between;border:1px solid #363b91;background:#0c1054;padding:8px 10px}
    .pd-roster span{color:var(--muted);font-size:9px}
    .crew-board{margin:26px 0 8px;text-align:left}
    .crew-board h3{font-family:"Press Start 2P",monospace;font-size:11px;color:var(--cyan);margin:0 0 14px;line-height:1.6}
    .crew-board table{width:100%;border-collapse:collapse;font-size:11px}
    .crew-board th{font-size:9px;color:var(--muted);text-align:left;padding:6px 4px;border-bottom:1px solid #373b8d;letter-spacing:1px}
    .crew-board td{padding:8px 4px;border-bottom:1px solid #22276f}
    .crew-board tr.me td{color:var(--pink);font-weight:bold}
    .crew-board td.dim{color:var(--muted)}
    .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#0b104e;border:1px solid var(--cyan);color:var(--white);padding:12px 18px;font-size:11px;z-index:50}
  `;
  document.head.appendChild(style);

  /* ---------- UI: party button ---------- */
  const partyBtn = document.createElement("button");
  partyBtn.className = "secondary-button"; partyBtn.id = "partyButton"; partyBtn.type = "button";
  partyBtn.textContent = "CREATE PARTY";
  $("joinButton").before(partyBtn);

  /* ---------- UI: party dialog ---------- */
  const dlg = document.createElement("dialog");
  dlg.id = "partyDialog"; dlg.className = "modal";
  dlg.innerHTML = `
    <div id="pdSetup">
      <div class="eyebrow">CREW PARTY</div>
      <h2>CREATE A PARTY</h2>
      <p>Start a party, share the invite link and compete with your crew. Everyone flies their own match and the scores land on one leaderboard.</p>
      <label for="pdName">DISPLAY NAME</label>
      <input id="pdName" maxlength="18" placeholder="e.g. STAR PILOT" autocomplete="nickname">
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="pdCancel">CANCEL</button>
        <button class="primary-button" type="button" id="pdCreate">CREATE PARTY</button>
      </div>
      <small id="pdError"></small>
    </div>
    <div id="pdLobby" class="hidden">
      <div class="eyebrow">CREW PARTY // <span id="pdRole"></span></div>
      <h2>YOUR CREW</h2>
      <div class="pd-code" id="pdCode"></div>
      <div class="pd-link" id="pdLink"></div>
      <button class="primary-button" type="button" id="pdCopy">COPY INVITE LINK</button>
      <label>CREW ROSTER</label>
      <ul class="pd-roster" id="pdRoster"></ul>
      <p>Press START FLIGHT when you're ready. When your match ends, your score joins the crew leaderboard.</p>
      <div class="modal-actions">
        <button class="secondary-button" type="button" id="pdLeave">LEAVE PARTY</button>
        <button class="primary-button" type="button" id="pdClose">CLOSE</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  /* ---------- UI: leaderboard on the result screen ---------- */
  const board = document.createElement("div");
  board.id = "crewBoard"; board.className = "crew-board hidden";
  board.innerHTML = `
    <h3>CREW LEADERBOARD // <span id="cbCode"></span></h3>
    <table>
      <thead><tr><th>#</th><th>PILOT</th><th>CORRECT</th><th>ACCURACY</th><th>TIME</th><th>XP</th></tr></thead>
      <tbody id="cbBody"></tbody>
    </table>`;
  document.querySelector(".result-card .result-actions").before(board);

  /* ---------- UI: update existing join + info dialogs ---------- */
  const jf = $("joinForm");
  jf.querySelector("p").textContent = "Paste a crew invite link or room code to join your friends' party.";
  jf.querySelector("button[type=submit]").textContent = "JOIN CREW";
  const joinLabel = document.createElement("label"); joinLabel.htmlFor = "joinName"; joinLabel.textContent = "DISPLAY NAME";
  const joinName = document.createElement("input"); joinName.id = "joinName"; joinName.maxLength = 18; joinName.placeholder = "e.g. STAR PILOT"; joinName.autocomplete = "nickname";
  jf.querySelector("label[for=crewCode]").before(joinLabel, joinName);
  const infoPs = $("infoDialog").querySelectorAll("p");
  if (infoPs[1]) infoPs[1].textContent = "Create a party, share the invite link and compare results on the crew leaderboard when each match ends. Your personal XP and last display name are saved on this device.";

  /* ---------- networking (peer-to-peer) ---------- */
  const loadPeer = () => window.Peer ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
    s.onload = res; s.onerror = () => rej(new Error("peerjs failed to load"));
    document.head.appendChild(s);
  });
  const newPeer = (id) => new Promise((res, rej) => {
    const p = id ? new Peer(id) : new Peer();
    p.on("open", () => { p.on("error", (e) => console.warn(e)); res(p); });
    p.on("error", rej);
  });
  const toHost = (msg) => { if (hostConn && hostConn.open) hostConn.send(msg); else queue.push(msg); };
  function commit() { conns.forEach((c) => { if (c.open) c.send({ t: "s", state }); }); render(); }

  async function createParty(name) {
    await loadPeer();
    let p = null, code = "";
    for (let i = 0; i < 6 && !p; i++) {
      code = genCode();
      try { p = await newPeer(PREFIX + code); } catch (e) { if (e.type !== "unavailable-id") throw e; }
    }
    if (!p) throw new Error("no room code");
    peer = p; party = { code, isHost: true };
    state = { meta: { host: me.id }, players: { [me.id]: fresh(name) } };
    peer.on("connection", (c) => {
      conns.push(c);
      c.on("open", () => c.send({ t: "s", state }));
      c.on("data", (m) => {
        if (!m) return;
        if (m.t === "p" && m.id && m.data) {
          c.pid = m.id;
          const d = m.data, old = state.players[m.id] || {};
          state.players[m.id] = { ...old, name: cleanName(d.name) || old.name || "PILOT", state: String(d.state || old.state || "ready").slice(0, 8),
            correct: num(d.correct), total: num(d.total), accuracy: num(d.accuracy), time: num(d.time), xp: num(d.xp) };
          commit();
        } else if (m.t === "r" && m.id) { delete state.players[m.id]; commit(); }
      });
      c.on("close", () => {
        conns = conns.filter((x) => x !== c);
        if (c.pid && state.players[c.pid]) { delete state.players[c.pid]; commit(); }
      });
    });
    render();
  }

  async function joinParty(code, name) {
    await loadPeer();
    const p = await newPeer();
    try {
      const conn = p.connect(PREFIX + code, { reliable: true });
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("timeout")), 9000);
        conn.on("open", () => { clearTimeout(t); res(); });
        p.on("error", (e) => { clearTimeout(t); rej(e); });
      });
      peer = p; hostConn = conn; party = { code, isHost: false };
      conn.on("data", (d) => { if (d && d.t === "s") { state = d.state; state.players = state.players || {}; render(); } });
      conn.on("close", () => { if (party) { resetLocal(); toast("The host left, so the party has ended."); } });
      conn.send({ t: "p", id: me.id, data: fresh(name) });
      queue.forEach((m) => conn.send(m)); queue = [];
      render();
    } catch (e) { try { p.destroy(); } catch {} throw e; }
  }

  function resetLocal() {
    try { conns.forEach((c) => c.close()); } catch {}
    try { peer && peer.destroy(); } catch {}
    peer = null; conns = []; hostConn = null; queue = []; party = null;
    state = { meta: null, players: {} };
    render();
  }
  function leaveParty() {
    if (party && !party.isHost) { try { toHost({ t: "r", id: me.id }); } catch {} }
    resetLocal();
  }
  window.addEventListener("beforeunload", () => { if (party) leaveParty(); });

  function setMine(data) {
    if (!party) return;
    const mine = { ...(state.players[me.id] || fresh(me.name)), ...data };
    if (party.isHost) { state.players[me.id] = mine; commit(); }
    else toHost({ t: "p", id: me.id, data: mine });
  }

  /* ---------- rendering ---------- */
  function sortedPlayers() {
    return Object.entries(state.players).sort(([, a], [, b]) => {
      const da = a.state === "done", db = b.state === "done";
      if (da !== db) return da ? -1 : 1;
      if (da) return b.correct - a.correct || a.time - b.time || b.xp - a.xp;
      return String(a.name).localeCompare(String(b.name));
    });
  }
  function render() {
    partyBtn.textContent = party ? `PARTY · ${party.code}` : "CREATE PARTY";
    // roster
    const ul = $("pdRoster"); ul.innerHTML = "";
    Object.entries(state.players).forEach(([id, p]) => {
      const li = document.createElement("li");
      const n = document.createElement("strong"); n.textContent = p.name + (id === me.id ? " (you)" : "") + (state.meta && state.meta.host === id ? " ★" : "");
      const st = document.createElement("span"); st.textContent = p.state === "done" ? "FINISHED" : p.state === "flying" ? "FLYING…" : "READY";
      li.append(n, st); ul.appendChild(li);
    });
    if (party) { $("pdCode").textContent = party.code; $("pdLink").textContent = inviteUrl(party.code); $("pdRole").textContent = party.isHost ? "HOST" : "MEMBER"; }
    // leaderboard
    board.classList.toggle("hidden", !party);
    if (!party) return;
    $("cbCode").textContent = party.code;
    const body = $("cbBody"); body.innerHTML = "";
    let rank = 0;
    sortedPlayers().forEach(([id, p]) => {
      const tr = document.createElement("tr"); if (id === me.id) tr.className = "me";
      const done = p.state === "done";
      const cells = done
        ? [++rank, p.name, `${p.correct}/${p.total}`, `${p.accuracy}%`, fmtTime(p.time), p.xp]
        : ["–", p.name, p.state === "flying" ? "FLYING…" : "READY", "", "", ""];
      cells.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (!done && i > 1) td.className = "dim"; tr.appendChild(td); });
      body.appendChild(tr);
    });
  }

  function showSetup() { $("pdSetup").classList.remove("hidden"); $("pdLobby").classList.add("hidden"); $("pdName").value = me.name || savedName(); $("pdError").textContent = ""; dlg.showModal(); }
  function showLobby() { $("pdSetup").classList.add("hidden"); $("pdLobby").classList.remove("hidden"); render(); if (!dlg.open) dlg.showModal(); }

  /* ---------- events ---------- */
  partyBtn.addEventListener("click", () => (party ? showLobby() : showSetup()));
  $("pdCancel").addEventListener("click", () => dlg.close());
  $("pdClose").addEventListener("click", () => dlg.close());
  $("pdLeave").addEventListener("click", () => { leaveParty(); dlg.close(); toast("You left the party."); });
  $("pdCreate").addEventListener("click", async () => {
    const name = cleanName($("pdName").value);
    if (!name) { $("pdError").textContent = "Enter a display name first."; return; }
    me.name = name; $("pdError").textContent = "Creating party…";
    try { await createParty(name); showLobby(); }
    catch (e) { console.error(e); resetLocal(); $("pdError").textContent = "Couldn't create a party. Check your internet connection and try again."; }
  });
  $("pdCopy").addEventListener("click", async () => {
    const url = inviteUrl(party.code);
    try { await navigator.clipboard.writeText(url); }
    catch { const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
    $("pdCopy").textContent = "COPIED ✓"; setTimeout(() => ($("pdCopy").textContent = "COPY INVITE LINK"), 1500);
  });

  // Join dialog: replace the old "save code locally" behaviour with a real join.
  $("joinButton").addEventListener("click", () => { if (!joinName.value) joinName.value = me.name || savedName(); });
  $("joinDialog").addEventListener("submit", async (e) => {
    e.preventDefault(); e.stopPropagation();
    const fb = $("joinFeedback");
    const name = cleanName(joinName.value), code = parseCode($("crewCode").value);
    if (!name) { fb.textContent = "Enter a display name first."; return; }
    if (!code) { fb.textContent = "Enter a valid invite link or 5-character room code."; return; }
    if (party) leaveParty();
    me.name = name; fb.textContent = "Connecting…";
    try { await joinParty(code, name); fb.textContent = ""; $("joinDialog").close(); toast("Joined party " + code); showLobby(); }
    catch (err) { console.error(err); fb.textContent = "Couldn't find that party. Check the code, and make sure the host still has the game open."; }
  }, true);

  // Pre-fill the pilot name with the party name when a match starts.
  ["startButton", "againButton"].forEach((id) => $(id).addEventListener("click", () => { if (party && me.name) $("displayName").value = me.name; }));

  // Watch screen changes: mark "flying" at launch, submit score when the match ends.
  let seenGame = false, seenResult = false;
  const watcher = new MutationObserver(() => {
    const g = !$("gameScreen").classList.contains("hidden");
    const r = !$("resultScreen").classList.contains("hidden");
    if (g && !seenGame) setMine({ state: "flying" });
    if (r && !seenResult) submitScore();
    seenGame = g; seenResult = r;
  });
  ["gameScreen", "resultScreen"].forEach((id) => watcher.observe($(id), { attributes: true, attributeFilter: ["class"] }));

  function submitScore() {
    if (!party) return;
    const [c, t] = $("resultCorrect").textContent.split("/").map(Number);
    const [mm, ss] = $("resultTime").textContent.split(":").map(Number);
    me.name = cleanName($("resultPilot").textContent) || me.name;
    setMine({
      name: me.name, state: "done",
      correct: c || 0, total: t || 0,
      accuracy: parseInt($("resultAccuracy").textContent, 10) || 0,
      time: (mm || 0) * 60 + (ss || 0),
      xp: parseInt($("resultXp").textContent, 10) || 0
    });
  }

  // Opened from an invite link? Pre-fill the join dialog.
  const invited = parseCode(new URLSearchParams(location.search).get("party") || "");
  if (invited) {
    $("crewCode").value = invited;
    joinName.value = savedName();
    $("joinFeedback").textContent = "You've been invited! Enter your name and press JOIN CREW.";
    $("joinDialog").showModal();
  }
  render();
})();
