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
