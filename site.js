const replayState = {
  payload: null,
  demoIndex: 0,
  frameIndex: 0,
  playing: true,
  timer: null,
  visualLayer: 'skeleton',
};

const viewer = new window.TommyEngineViewer(document.getElementById('engineCanvas'));
window.tommyViewer = viewer;

function labelize(value) {
  return String(value ?? '').replaceAll('_', ' ').replaceAll('.', ' · ').replace(/\b\w/g, c => c.toUpperCase());
}

function currentDemo() {
  return replayState.payload?.demos?.[replayState.demoIndex] || null;
}

async function ensureDemoLoaded(index) {
  const demo = replayState.payload?.demos?.[index];
  if (!demo || Array.isArray(demo.frames)) return demo;
  if (!demo.data_url) throw new Error('demo_frames_missing');
  const response = await fetch(demo.data_url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`demo_http_${response.status}`);
  const loaded = await response.json();
  if (!Array.isArray(loaded.frames)) throw new Error('demo_frames_invalid');
  replayState.payload.demos[index] = {...demo, ...loaded};
  return replayState.payload.demos[index];
}

function currentFrame() {
  return currentDemo()?.frames?.[replayState.frameIndex] || null;
}

function renderDevelopment(payload) {
  const root = document.getElementById('developmentCards');
  root.innerHTML = '';
  Object.entries(payload.development || {}).forEach(([id, item]) => {
    const card = document.createElement('article');
    card.className = `development-card development-${id}`;
    card.innerHTML = `
      <div class="development-card-head">
        <strong>${item.label || labelize(id)}</strong>
        <span class="development-status">${item.status || '—'}</span>
      </div>
      <p>${item.note || ''}</p>
      <small>${item.evidence || ''}</small>
    `;
    root.appendChild(card);
  });
}

function renderBuild(payload) {
  const source = payload.source || {};
  const commit = String(source.commit || 'unknown');
  document.getElementById('buildMeta').textContent = `main snapshot · ${commit.slice(0, 10)} · ${source.generated_at || ''}`;
  renderDevelopment(payload);

  const rules = document.getElementById('truthRules');
  rules.innerHTML = '';
  (payload.truth_rules || []).forEach(rule => {
    const li = document.createElement('li');
    li.textContent = rule;
    rules.appendChild(li);
  });
}

function renderState(st) {
  document.getElementById('mode').textContent = st?.mode ?? '—';
  document.getElementById('skill').textContent = st?.skill ?? '—';
  document.getElementById('progress').textContent = typeof st?.progress === 'number' ? `${Math.round(st.progress * 100)}%` : '—';
  document.getElementById('activeHand').textContent = st?.active_hand ?? '—';
  document.getElementById('grip').textContent = st?.grip ?? '—';
  document.getElementById('heldObject').textContent = st?.held_object ?? '—';
}

function observedValue(observation, fallback = '—') {
  if (!observation || typeof observation !== 'object' || !Object.prototype.hasOwnProperty.call(observation, 'value')) return fallback;
  return observation.value;
}

function renderCognitive(cognitive) {
  const world = cognitive?.world_state || {};
  const learning = cognitive?.learning || {};
  document.getElementById('cogRepresentation').textContent = world.representation || '—';
  document.getElementById('cogRevision').textContent = String(observedValue(world.revision));
  document.getElementById('cogEntities').textContent = String((world.entities || []).length);
  document.getElementById('cogGoals').textContent = String((world.goals || []).length);
  document.getElementById('cogLearner').textContent = learning.learner_model == null ? 'not active' : 'present';
  document.getElementById('cogControl').textContent = learning.control_authority || '—';

  const truth = document.getElementById('cognitiveTruth');
  if (!cognitive?.read_only) {
    truth.textContent = 'Cognitive observation unavailable or not read-only.';
    truth.classList.add('warning');
    return;
  }
  truth.classList.remove('warning');
  truth.textContent = `${cognitive.source} · ${world.representation || 'world state'} · learner/teacher values remain absent until a truthful runtime source exists.`;
}

function renderJazz(jazz) {
  const panel = document.getElementById('jazzPanel');
  if (!jazz) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  document.getElementById('jazzStatus').textContent = labelize(jazz.status || 'unavailable');
  document.getElementById('jazzCandidate').textContent =
    jazz.decision?.selected_candidate?.name || 'not selected';
  document.getElementById('jazzProfileSource').textContent =
    labelize(jazz.profile_provenance?.source || 'not supplied');
  document.getElementById('jazzContactEvidence').textContent =
    labelize(jazz.evidence_status?.contacts || 'unavailable');
  document.getElementById('jazzGazeEvidence').textContent =
    labelize(jazz.evidence_status?.gaze_direction || 'unavailable');
  document.getElementById('jazzControl').textContent = jazz.control_authority || 'none';
  const missing = Array.isArray(jazz.missing_evidence) ? ` Missing: ${jazz.missing_evidence.join(', ')}.` : '';
  document.getElementById('jazzTruth').textContent =
    `${jazz.truth_rule || 'REFERENCE_DECISION != MOTOR_COMMAND'}.${missing}`;
}

function updateLayerTruth() {
  const truth = viewer.layerTruth();
  document.getElementById('layerTruth').textContent = truth
    ? `${labelize(replayState.visualLayer)} · ${truth.status}. ${truth.claim}`
    : `${labelize(replayState.visualLayer)} layer metadata unavailable.`;
}

function renderFrame() {
  const demo = currentDemo();
  const frame = currentFrame();
  if (!demo || !frame) return;

  if (typeof viewer.setMeasurements === 'function') viewer.setMeasurements(frame.measurements);
  viewer.update(frame.visual);
  window.renderTommyMeasurements?.(frame.measurements);
  renderState(frame.state);
  renderCognitive(frame.cognitive);
  renderJazz(frame.jazz);
  updateLayerTruth();

  const frameCount = demo.frames.length;
  const timeline = document.getElementById('timeline');
  timeline.max = Math.max(0, frameCount - 1);
  timeline.value = replayState.frameIndex;

  document.getElementById('demoTitle').textContent = demo.label;
  document.getElementById('motionStatus').textContent = `${labelize(demo.skill)} · recorded canonical MotorOS replay`;
  document.getElementById('frameStatus').textContent = `Frame ${replayState.frameIndex + 1}/${frameCount} · ${Number(frame.t_s || 0).toFixed(2)}s`;

  const visual = frame.visual;
  const fingerCount = Object.values(visual?.finger_groups || {}).reduce((sum, chain) => sum + (Array.isArray(chain) ? chain.length : 0), 0);
  document.getElementById('visualTruth').textContent = visual?.available
    ? `${visual.source} · ${Object.keys(visual.points || {}).length} points · ${visual.segments?.length || 0} segments · ${fingerCount} finger-chain points · ${visual.jcs_conformance_status}`
    : 'Recorded engine geometry unavailable for this frame.';
}

function scheduleNext() {
  clearTimeout(replayState.timer);
  if (!replayState.playing) return;
  const demo = currentDemo();
  if (!demo?.frames?.length) return;
  const delay = 1000 / Math.max(1, Number(demo.fps || 8));
  replayState.timer = setTimeout(() => {
    replayState.frameIndex += 1;
    if (replayState.frameIndex >= demo.frames.length) replayState.frameIndex = 0;
    renderFrame();
    scheduleNext();
  }, delay);
}

async function selectDemo(index) {
  replayState.demoIndex = Number(index) || 0;
  replayState.frameIndex = 0;
  replayState.playing = false;
  clearTimeout(replayState.timer);
  document.getElementById('motionStatus').textContent = 'Loading validated replay…';
  await ensureDemoLoaded(replayState.demoIndex);
  replayState.playing = true;
  document.getElementById('playPause').textContent = 'Pause';
  renderFrame();
  scheduleNext();
}

function renderDemoOptions() {
  const select = document.getElementById('demoSelect');
  select.innerHTML = '';
  (replayState.payload?.demos || []).forEach((demo, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = demo.label;
    select.appendChild(option);
  });
  select.onchange = () => selectDemo(select.value);
}

document.getElementById('playPause').onclick = () => {
  replayState.playing = !replayState.playing;
  document.getElementById('playPause').textContent = replayState.playing ? 'Pause' : 'Play';
  scheduleNext();
};

document.getElementById('restart').onclick = () => {
  replayState.frameIndex = 0;
  renderFrame();
  scheduleNext();
};

document.getElementById('timeline').oninput = event => {
  replayState.frameIndex = Number(event.target.value) || 0;
  replayState.playing = false;
  document.getElementById('playPause').textContent = 'Play';
  clearTimeout(replayState.timer);
  renderFrame();
};

document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('active', x === button));
    viewer.setView(button.dataset.view);
  };
});

document.querySelectorAll('[data-layer]').forEach(button => {
  button.onclick = () => {
    replayState.visualLayer = button.dataset.layer;
    document.querySelectorAll('[data-layer]').forEach(x => x.classList.toggle('active', x === button));
    viewer.setLayer(replayState.visualLayer);
    updateLayerTruth();
    renderFrame();
  };
});

(async function boot() {
  try {
    const response = await fetch('/data/latest.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`replay_http_${response.status}`);
    const payload = await response.json();
    if (!payload.read_only || payload.runtime_control_available !== false) {
      throw new Error('unsafe_site_payload_contract');
    }
    replayState.payload = payload;
    renderBuild(payload);
    renderDemoOptions();
    document.getElementById('playPause').textContent = 'Pause';
    await selectDemo(0);
  } catch (error) {
    document.getElementById('motionStatus').textContent = `Unable to load validated replay: ${error.message}`;
    replayState.playing = false;
  }
})();
