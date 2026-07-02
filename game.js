(function(){

const WIDTH = 800, HEIGHT = 560;

// Build projection & path fitted to the geojson extent
const projection = d3.geoMercator().fitSize([WIDTH-20, HEIGHT-20], ROMANIA_GEOJSON);
projection.translate([
  projection.translate()[0]+10,
  projection.translate()[1]+10
]);
const pathGen = d3.geoPath().projection(projection);

const features = ROMANIA_GEOJSON.features.map(f => ({
  ...f,
  name: f.properties.Subunitate
}));

let mode = null;
let order = [];
let currentIndex = 0;
let score = 0;
let results = []; // {name, correct}
let timerInterval = null;
let startTime = null;
let locked = false;

const svg = d3.select('#map-svg');
const tooltip = d3.select('#tooltip');

function shuffled(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function drawMap(svgSel, withLabels){
  svgSel.selectAll('*').remove();
  const g = svgSel.append('g');
  g.selectAll('path.region')
    .data(features)
    .join('path')
    .attr('class','region')
    .attr('d', pathGen)
    .attr('data-name', d => d.name)
    .on('mouseenter', function(event, d){
      if(mode==='find' && !locked){
        const [x,y] = d3.pointer(event, document.getElementById('map-wrap'));
        tooltip.style('opacity',1).style('left',(x+12)+'px').style('top',(y+8)+'px');
      }
    })
    .on('mouseleave', function(){ tooltip.style('opacity',0); })
    .on('click', function(event, d){
      if(mode==='find') handleFindClick(d, this);
    });

  if(withLabels){
    g.selectAll('text.region-label')
      .data(features)
      .join('text')
      .attr('class','region-label')
      .attr('transform', d => {
        const c = pathGen.centroid(d);
        return `translate(${c[0]},${c[1]})`;
      })
      .text(d => '');
  }
}

drawMap(svg, false);

// ---------------- START SCREEN LOGIC ----------------
const cardFind = document.getElementById('card-find');
const cardName = document.getElementById('card-name');
const startBtn = document.getElementById('start-btn');

cardFind.addEventListener('click', () => selectMode('find'));
cardName.addEventListener('click', () => selectMode('name'));

function selectMode(m){
  mode = m;
  cardFind.classList.toggle('selected', m==='find');
  cardName.classList.toggle('selected', m==='name');
  startBtn.disabled = false;
  startBtn.textContent = 'Începe jocul';
}

startBtn.addEventListener('click', startGame);
document.getElementById('quit-btn').addEventListener('click', () => endGame(true));
document.getElementById('replay-btn').addEventListener('click', resetToStart);

function startGame(){
  order = shuffled(features.map(f=>f.name));
  currentIndex = 0;
  score = 0;
  results = [];
  locked = false;

  document.getElementById('start-screen').style.display='none';
  document.getElementById('end-screen').style.display='none';
  document.getElementById('game-screen').style.display='block';

  document.getElementById('choice-list').style.display = (mode==='name') ? 'grid' : 'none';

  drawMap(svg, false);
  startTimer();
  nextQuestion();
}

function startTimer(){
  startTime = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now()-startTime)/1000);
    const m = String(Math.floor(elapsed/60)).padStart(2,'0');
    const s = String(elapsed%60).padStart(2,'0');
    document.getElementById('hud-timer').textContent = `${m}:${s}`;
  }, 250);
}

function updateHud(){
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-progress').textContent = `${currentIndex} / ${order.length}`;
  const answered = results.length;
  const pct = answered ? Math.round((score/answered)*100) : 0;
  document.getElementById('hud-percent').textContent = `${pct}%`;
}

function nextQuestion(){
  updateHud();
  locked = false;
  document.getElementById('prompt-feedback').textContent = '';
  document.getElementById('prompt-feedback').className = 'feedback';

  svg.selectAll('path.region').classed('correct',false).classed('wrong',false).classed('revealed', false);

  if(currentIndex >= order.length){
    endGame(false);
    return;
  }

  const targetName = order[currentIndex];

  if(mode==='find'){
    document.getElementById('prompt-ask').textContent = 'Găsește pe hartă:';
    document.getElementById('prompt-target').textContent = targetName;
  } else {
    document.getElementById('prompt-ask').textContent = 'Cum se numește regiunea evidențiată?';
    document.getElementById('prompt-target').textContent = '';
    svg.selectAll('path.region').filter(d => d.name===targetName).classed('revealed', true);
    renderChoices(targetName);
  }
}

function renderChoices(targetName){
  const wrap = document.getElementById('choice-list');
  wrap.innerHTML = '';
  const wrongPool = shuffled(features.map(f=>f.name).filter(n=>n!==targetName)).slice(0,3);
  const choices = shuffled([targetName, ...wrongPool]);
  choices.forEach(choiceName => {
    const btn = document.createElement('button');
    btn.className = 'ghost-btn';
    btn.style.padding='10px 12px';
    btn.style.fontSize='0.88rem';
    btn.style.textAlign='left';
    btn.textContent = choiceName;
    btn.addEventListener('click', () => handleNameChoice(choiceName, targetName, btn));
    wrap.appendChild(btn);
  });
}

function handleNameChoice(chosen, targetName, btnEl){
  if(locked) return;
  locked = true;
  const correct = chosen === targetName;
  registerAnswer(targetName, correct);

  if(correct){
    btnEl.style.background = 'var(--correct)';
    btnEl.style.borderColor = 'var(--correct)';
    btnEl.style.color = '#06140a';
    svg.selectAll('path.region').filter(d=>d.name===targetName).classed('correct', true).classed('revealed', false);
    setFeedback(true, 'Corect!');
  } else {
    btnEl.style.background = 'var(--wrong)';
    btnEl.style.borderColor = 'var(--wrong)';
    btnEl.style.color = '#fff';
    svg.selectAll('path.region').filter(d=>d.name===targetName).classed('wrong', true).classed('revealed', false);
    setFeedback(false, `Greșit. Era: ${targetName}`);
  }

  setTimeout(() => { currentIndex++; nextQuestion(); }, 1100);
}

function handleFindClick(d, pathEl){
  if(locked) return;
  locked = true;
  const targetName = order[currentIndex];
  const correct = d.name === targetName;
  registerAnswer(targetName, correct);

  if(correct){
    d3.select(pathEl).classed('correct', true);
    setFeedback(true, 'Corect!');
  } else {
    d3.select(pathEl).classed('wrong', true);
    svg.selectAll('path.region').filter(dd=>dd.name===targetName).classed('correct', true);
    setFeedback(false, `Ai dat clic pe ${d.name}. Căutai: ${targetName}`);
  }

  setTimeout(() => { currentIndex++; nextQuestion(); }, 1300);
}

function setFeedback(ok, text){
  const el = document.getElementById('prompt-feedback');
  el.textContent = text;
  el.className = 'feedback ' + (ok ? 'ok' : 'bad');
}

function registerAnswer(name, correct){
  if(correct) score++;
  results.push({name, correct});
}

function endGame(aborted){
  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now()-startTime)/1000);
  const m = String(Math.floor(elapsed/60)).padStart(2,'0');
  const s = String(elapsed%60).padStart(2,'0');

  document.getElementById('game-screen').style.display='none';
  document.getElementById('end-screen').style.display='block';
  document.getElementById('final-score').textContent = `${score} / ${order.length}`;
  document.getElementById('final-time').textContent = aborted
    ? `abandonat după ${m}:${s}`
    : `finalizat în ${m}:${s}`;

  const svgEnd = d3.select('#map-svg-end');
  drawMap(svgEnd, false);
  svgEnd.selectAll('path.region').each(function(d){
    const r = results.find(x => x.name === d.name);
    if(r){
      d3.select(this).classed('correct', r.correct).classed('wrong', !r.correct);
    }
  });
  svgEnd.selectAll('path.region').on('click', null).style('cursor','default');

  const misses = results.filter(r => !r.correct);
  const missBox = document.getElementById('miss-list');
  if(misses.length){
    missBox.style.display = 'block';
    const ul = document.getElementById('miss-ul');
    ul.innerHTML = '';
    misses.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m.name;
      ul.appendChild(li);
    });
  } else {
    missBox.style.display = 'none';
  }
}

function resetToStart(){
  document.getElementById('end-screen').style.display='none';
  document.getElementById('start-screen').style.display='block';
}

})();