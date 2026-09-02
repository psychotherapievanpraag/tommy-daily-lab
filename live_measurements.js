(() => {
  let latest = null;

  const priority = [
    'pen_tip_error', 'paper_distance', 'writing_normal_force', 'writing_drag_force',
    'writing_speed', 'grip_force_applied', 'grip_force_desired', 'grip_force_command',
    'static_stable_at_applied_force', 'static_stable', 'tactile_friction_utilization',
    'minimum_friction_margin', 'loaded_contact_count', 'geometric_contact_count',
    'required_torque_max', 'required_torque_rms', 'actuator_power', 'kinetic_energy',
    'maximum_body_joint_speed', 'maximum_body_joint_acceleration', 'maximum_body_joint_jerk'
  ];

  function labelize(id) {
    return String(id).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function fixed(value, digits = 2) {
    return Number(value).toFixed(digits).replace(/\.00$/, '');
  }

  function displayMetric(metric) {
    const value = metric.value;
    const unit = metric.unit;
    if (unit === 'boolean') return {main: value ? 'YES' : 'NO', sub: 'boolean runtime state'};
    if (unit === 'count') return {main: String(value), sub: 'count'};
    if (unit === 'm') return {main: `${fixed(Number(value) * 1000, 2)} mm`, sub: `${Number(value).toExponential(3)} m engine value`};
    if (unit === 'm/s') return {main: `${fixed(Number(value) * 1000, 2)} mm/s`, sub: `${Number(value).toExponential(3)} m/s engine value`};
    if (unit === '1') return {main: `${fixed(Number(value) * 100, 1)}%`, sub: `${fixed(value, 4)} dimensionless`};
    return {main: `${fixed(value, 3)} ${unit}`, sub: metric.status || 'runtime observation'};
  }

  function setSelectOptions(select, items, preferredNames = []) {
    const names = items.map(x => x.name);
    const signature = names.join('|');
    if (select.dataset.schemaSignature === signature) return;
    const prior = select.value;
    const validNames = new Set(names);
    select.innerHTML = '';
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.name;
      option.textContent = labelize(item.name);
      select.appendChild(option);
    });
    select.dataset.schemaSignature = signature;
    if (validNames.has(prior)) select.value = prior;
    else {
      const preferred = preferredNames.find(x => validNames.has(x));
      if (preferred) select.value = preferred;
    }
  }

  function readingRow(label, value) {
    const row = document.createElement('div');
    const key = document.createElement('span');
    const val = document.createElement('strong');
    key.textContent = label;
    val.textContent = value;
    row.append(key, val);
    return row;
  }

  function renderBodyJoint() {
    const host = document.getElementById('bodyJointReading');
    const select = document.getElementById('bodyJointSelect');
    host.innerHTML = '';
    const item = latest?.body?.joints?.find(x => x.name === select.value);
    if (!item) return;
    host.append(
      readingRow('Current', `${fixed(item.value_deg, 2)}° · ${fixed(item.value_rad, 4)} rad`),
      readingRow('Engine envelope', `${fixed(item.engine_envelope_deg[0], 1)}° … ${fixed(item.engine_envelope_deg[1], 1)}°`),
      readingRow('Range status', item.range_status),
      readingRow('JCS status', item.anatomical_conformance_status),
    );
  }

  function renderHandJoint() {
    const host = document.getElementById('handJointReading');
    const select = document.getElementById('handJointSelect');
    host.innerHTML = '';
    const item = latest?.hand?.joints?.find(x => x.name === select.value);
    if (!item) return;
    const unit = item.native_unit === 'deg' ? '°' : '';
    host.append(
      readingRow('Current', `${fixed(item.value, 2)}${unit}`),
      readingRow('Engine envelope', `${fixed(item.engine_envelope[0], 1)}${unit} … ${fixed(item.engine_envelope[1], 1)}${unit}`),
      readingRow('Group', item.group),
      readingRow('Range status', item.range_status),
    );
  }

  function renderToolMetrics() {
    const host = document.getElementById('toolMetricCards');
    host.innerHTML = '';
    const metrics = latest?.tool_contact?.metrics || [];
    const rank = id => {
      const i = priority.indexOf(id);
      return i < 0 ? priority.length + 1 : i;
    };
    metrics.slice().sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id)).forEach(metric => {
      const card = document.createElement('div');
      card.className = 'metric-card';
      const label = document.createElement('small');
      const value = document.createElement('strong');
      const meta = document.createElement('span');
      const shown = displayMetric(metric);
      label.textContent = labelize(metric.id);
      value.textContent = shown.main;
      meta.textContent = `${shown.sub} · ${metric.source}`;
      card.append(label, value, meta);
      host.appendChild(card);
    });
    if (!metrics.length) {
      const empty = document.createElement('p');
      empty.className = 'measurement-empty';
      empty.textContent = 'No active tool/contact metrics yet. Run a grasp or writing skill to populate them.';
      host.appendChild(empty);
    }
  }

  function renderDigitContacts() {
    const host = document.getElementById('digitContactTable');
    host.innerHTML = '';
    const digits = latest?.tool_contact?.digits || {};
    const entries = Object.entries(digits);
    if (!entries.length) return;
    const title = document.createElement('h3');
    title.textContent = 'Digit contact observer';
    host.appendChild(title);
    entries.forEach(([digit, item]) => {
      const row = document.createElement('div');
      row.className = 'digit-contact-row';
      const name = document.createElement('strong');
      const mode = document.createElement('span');
      const loaded = document.createElement('span');
      const distance = document.createElement('span');
      name.textContent = labelize(digit);
      mode.textContent = item.mode || '—';
      loaded.textContent = item.loaded == null ? 'load —' : item.loaded ? 'loaded' : 'not loaded';
      distance.textContent = item.signed_distance_m == null ? 'distance —' : `${fixed(item.signed_distance_m * 1000, 3)} mm`;
      row.append(name, mode, loaded, distance);
      host.appendChild(row);
    });
  }

  function render(measurements) {
    latest = measurements;
    window.tommyViewer?.setMeasurements?.(measurements);
    const truth = document.getElementById('measurementTruth');
    if (!measurements || !measurements.available) {
      truth.textContent = 'Live measurements unavailable — no numerical claim is shown.';
      truth.classList.add('warning');
      return;
    }
    truth.classList.remove('warning');
    truth.textContent = `${measurements.source} · ${measurements.truth_rule}. Body=${measurements.body.range_status}; Hand=${measurements.hand.range_status}.`;

    const bodySelect = document.getElementById('bodyJointSelect');
    const handSelect = document.getElementById('handJointSelect');
    setSelectOptions(bodySelect, measurements.body.joints || [], ['r_elbow', 'r_shoulder_flex', 'r_wrist_flex']);
    setSelectOptions(handSelect, measurements.hand.joints || [], ['index_mcp_flex', 'thumb_cmc_abd', 'middle_mcp_flex']);
    renderBodyJoint();
    renderHandJoint();
    renderToolMetrics();
    renderDigitContacts();
  }

  document.getElementById('bodyJointSelect')?.addEventListener('change', renderBodyJoint);
  document.getElementById('handJointSelect')?.addEventListener('change', renderHandJoint);
  window.renderTommyMeasurements = render;
})();
