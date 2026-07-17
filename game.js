(function(){

const WIDTH = 800, HEIGHT = 560;
const BACKGROUND_REGION = 'zona de contact';

const projection = d3.geoMercator().fitSize([WIDTH-20, HEIGHT-20], ROMANIA_GEOJSON);
projection.translate([projection.translate()[0]+10, projection.translate()[1]+10]);
const pathGen = d3.geoPath().projection(projection);

const allFeatures = ROMANIA_GEOJSON.features.map(f => ({...f, name: f.properties.Subunitate}));
const bgFeature = allFeatures.find(f => f.name === BACKGROUND_REGION);
const features = allFeatures.filter(f => f.name !== BACKGROUND_REGION);

let mode = null; // 'learn' | 'find' | 'name'
let order = [];
let currentIndex = 0;
let score = 0;
let results = [];
let timerInterval = null;
let startTime = null;
let locked = false;

// Learning mode state
let attemptsLeft = 3;
let wrongThisRound = 0;
// Map of name -> color class for regions already solved in learning mode
let solvedRegions = {};

const svg = d3.select('#map-svg');
const tooltip = d3.select('#tooltip');

function shuffled(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function drawMap(svgSel, applyLearnColors){
  svgSel.selectAll('*').remove();
  const g = svgSel.append('g');

  if(bgFeature){
    g.append('path').datum(bgFeature)
      .attr('class','region-bg').attr('d',pathGen)
      .style('fill','#101e30').style('stroke','#2a3d55')
      .style('stroke-width','0.5').style('pointer-events','none');
  }

  g.selectAll('path.region')
    .data(features).join('path')
    .attr('class','region')
    .attr('d', pathGen)
    .attr('data-name', d => d.name)
    .each(function(d){
      if(applyLearnColors && solvedRegions[d.name]){
        d3.select(this).classed(solvedRegions[d.name], true);
      }
    })
    .on('mouseenter', function(event, d){
      if((mode==='find'||mode==='learn') && !locked && !solvedRegions[d.name]){
        const wrap = document.getElementById('map-wrap');
        const rect = wrap.getBoundingClientRect();
        tooltip.style('opacity',1)
          .style('left',(event.clientX-rect.left+12)+'px')
          .style('top',(event.clientY-rect.top+8)+'px')
          .text(d.name);
      }
    })
    .on('mouseleave', () => tooltip.style('opacity',0))
    .on('click', function(event, d){
      if(mode==='find') handleFindClick(d, this);
      else if(mode==='learn') handleLearnClick(d, this);
    });
}

drawMap(svg, false);

// ---- MODE CARDS ----
document.getElementById('card-learn').addEventListener('click', () => selectMode('learn'));
document.getElementById('card-find').addEventListener('click', () => selectMode('find'));
document.getElementById('card-name').addEventListener('click', () => selectMode('name'));

function selectMode(m){
  mode = m;
  document.getElementById('card-learn').classList.toggle('selected', m==='learn');
  document.getElementById('card-find').classList.toggle('selected', m==='find');
  document.getElementById('card-name').classList.toggle('selected', m==='name');
  const btn = document.getElementById('start-btn');
  btn.disabled = false;
  btn.textContent = 'Începe jocul';
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('quit-btn').addEventListener('click', () => endGame(true));
document.getElementById('replay-btn').addEventListener('click', resetToStart);

function startGame(){
  order = shuffled(features.map(f=>f.name));
  currentIndex = 0; score = 0; results = []; locked = false;
  solvedRegions = {};

  document.getElementById('start-screen').style.display='none';
  document.getElementById('end-screen').style.display='none';
  document.getElementById('game-screen').style.display='block';
  document.getElementById('choice-list').style.display = (mode==='name') ? 'grid' : 'none';
  document.getElementById('attempts-bar').style.display = (mode==='learn') ? 'flex' : 'none';

  drawMap(svg, false);
  startTimer();
  nextQuestion();
}

function startTimer(){
  startTime = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const e = Math.floor((Date.now()-startTime)/1000);
    document.getElementById('hud-timer').textContent =
      String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0');
  }, 250);
}

function updateHud(){
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-progress').textContent = `${currentIndex} / ${order.length}`;
  const pct = results.length ? Math.round((score/results.length)*100) : 0;
  document.getElementById('hud-percent').textContent = `${pct}%`;
}

function renderAttempts(left){
  const bar = document.getElementById('attempts-bar');
  bar.innerHTML = '';
  for(let i=0;i<3;i++){
    const dot = document.createElement('span');
    dot.className = 'attempt-dot' + (i < left ? ' active' : '');
    bar.appendChild(dot);
  }
}

function nextQuestion(){
  updateHud();
  locked = false;
  document.getElementById('prompt-feedback').textContent='';
  document.getElementById('prompt-feedback').className='feedback';

  if(mode!=='learn'){
    svg.selectAll('path.region').classed('correct',false).classed('wrong',false).classed('revealed',false);
  } else {
    // In learning mode: only clear current highlight, keep solved colors
    svg.selectAll('path.region').classed('revealed',false).classed('wrong',false);
    // Re-apply solved colors
    svg.selectAll('path.region').each(function(d){
      const cls = solvedRegions[d.name];
      d3.select(this)
        .classed('learn-green', cls==='learn-green')
        .classed('learn-yellow', cls==='learn-yellow')
        .classed('learn-orange', cls==='learn-orange')
        .classed('learn-red', cls==='learn-red');
    });
  }

  if(currentIndex >= order.length){ endGame(false); return; }

  const targetName = order[currentIndex];

  if(mode==='learn'){
    attemptsLeft = 3; wrongThisRound = 0;
    renderAttempts(attemptsLeft);
    document.getElementById('prompt-ask').textContent = 'Identifică subunitatea:';
    document.getElementById('prompt-target').textContent = targetName;
  } else if(mode==='find'){
    document.getElementById('prompt-ask').textContent = 'Identifică pe hartă:';
    document.getElementById('prompt-target').textContent = targetName;
  } else {
    document.getElementById('prompt-ask').textContent = 'Cum se numește subunitatea evidențiată?';
    document.getElementById('prompt-target').textContent = '';
    svg.selectAll('path.region').filter(d=>d.name===targetName).classed('revealed',true);
    renderChoices(targetName);
  }
}

function renderChoices(targetName){
  const wrap = document.getElementById('choice-list');
  wrap.innerHTML='';
  const wrong = shuffled(features.map(f=>f.name).filter(n=>n!==targetName)).slice(0,3);
  shuffled([targetName,...wrong]).forEach(name => {
    const btn = document.createElement('button');
    btn.className='ghost-btn';
    btn.style.cssText='padding:10px 12px;font-size:0.88rem;text-align:left;font-family:Arial,sans-serif;';
    btn.textContent=name;
    btn.addEventListener('click', () => handleNameChoice(name, targetName, btn));
    wrap.appendChild(btn);
  });
}

// ---- LEARNING MODE CLICK ----
function handleLearnClick(d, pathEl){
  if(locked) return;
  if(solvedRegions[d.name]) return; // already solved, ignore click

  const targetName = order[currentIndex];
  if(d.name === targetName){
    // Correct!
    const colorClass = wrongThisRound===0 ? 'learn-green'
      : wrongThisRound===1 ? 'learn-yellow'
      : wrongThisRound===2 ? 'learn-orange' : 'learn-red';
    solvedRegions[targetName] = colorClass;
    d3.select(pathEl).classed(colorClass, true);
    score++;
    registerAnswer(targetName, true);
    setFeedback(true, wrongThisRound===0 ? 'Perfect, din prima!' : 'Corect!');
    locked = true;
    setTimeout(() => { currentIndex++; nextQuestion(); }, 900);
  } else {
    // Wrong click
    attemptsLeft--;
    wrongThisRound++;
    renderAttempts(attemptsLeft);
    d3.select(pathEl).classed('wrong', true);
    setTimeout(() => d3.select(pathEl).classed('wrong', false), 500);

    if(attemptsLeft === 0){
      // Out of attempts — show correct region in red, move on
      solvedRegions[targetName] = 'learn-red';
      svg.selectAll('path.region').filter(dd=>dd.name===targetName).classed('learn-red',true);
      registerAnswer(targetName, false);
      setFeedback(false, `Epuizat! Era: ${targetName}`);
      locked = true;
      setTimeout(() => { currentIndex++; nextQuestion(); }, 1300);
    } else {
      const msg = attemptsLeft===2 ? `Greșit! Mai ai 2 încercări.` : `Greșit! Mai ai 1 încercare.`;
      setFeedback(false, msg);
    }
  }
}

// ---- CLASSIC FIND CLICK ----
function handleFindClick(d, pathEl){
  if(locked) return;
  locked = true;
  const targetName = order[currentIndex];
  const correct = d.name === targetName;
  registerAnswer(targetName, correct);
  if(correct){
    d3.select(pathEl).classed('correct',true);
    setFeedback(true, 'Corect!');
  } else {
    d3.select(pathEl).classed('wrong',true);
    svg.selectAll('path.region').filter(dd=>dd.name===targetName).classed('correct',true);
    setFeedback(false, `Ai dat clic pe ${d.name}. Căutai: ${targetName}`);
  }
  setTimeout(() => { currentIndex++; nextQuestion(); }, 1300);
}

// ---- NAME MODE ----
function handleNameChoice(chosen, targetName, btnEl){
  if(locked) return;
  locked = true;
  const correct = chosen===targetName;
  registerAnswer(targetName, correct);
  if(correct){
    btnEl.style.cssText += 'background:#a6ff1f;border-color:#a6ff1f;color:#06140a;';
    svg.selectAll('path.region').filter(d=>d.name===targetName).classed('correct',true).classed('revealed',false);
    setFeedback(true,'Corect!');
  } else {
    btnEl.style.cssText += 'background:#ff4d5e;border-color:#ff4d5e;color:#fff;';
    svg.selectAll('path.region').filter(d=>d.name===targetName).classed('wrong',true).classed('revealed',false);
    setFeedback(false,`Greșit. Era: ${targetName}`);
  }
  setTimeout(() => { currentIndex++; nextQuestion(); }, 1100);
}

function setFeedback(ok, text){
  const el = document.getElementById('prompt-feedback');
  el.textContent=text;
  el.className='feedback '+(ok?'ok':'bad');
}

function registerAnswer(name, correct){
  if(correct) score++;
  results.push({name, correct});
}

function endGame(aborted){
  clearInterval(timerInterval);
  const e = Math.floor((Date.now()-startTime)/1000);
  const mm = String(Math.floor(e/60)).padStart(2,'0'), ss = String(e%60).padStart(2,'0');
  document.getElementById('game-screen').style.display='none';
  document.getElementById('end-screen').style.display='block';
  document.getElementById('final-score').textContent=`${score} / ${order.length}`;
  document.getElementById('final-time').textContent=aborted?`abandonat după ${mm}:${ss}`:`finalizat în ${mm}:${ss}`;

  const svgEnd = d3.select('#map-svg-end');
  drawMap(svgEnd, false);
  svgEnd.selectAll('path.region').each(function(d){
    if(mode==='learn' && solvedRegions[d.name]){
      d3.select(this).classed(solvedRegions[d.name],true);
    } else {
      const r = results.find(x=>x.name===d.name);
      if(r) d3.select(this).classed(r.correct?'correct':'wrong',true);
    }
  });
  svgEnd.selectAll('path.region').on('click',null).style('cursor','default');

  const misses = results.filter(r=>!r.correct);
  const missBox = document.getElementById('miss-list');
  if(misses.length){
    missBox.style.display='block';
    document.getElementById('miss-ul').innerHTML=misses.map(m=>`<li>${m.name}</li>`).join('');
  } else { missBox.style.display='none'; }
}

function resetToStart(){
  document.getElementById('end-screen').style.display='none';
  document.getElementById('start-screen').style.display='block';
  solvedRegions={};
  drawMap(svg,false);
}

})();
