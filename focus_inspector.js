(() => {
  const Viewer = window.TommyEngineViewer;
  if (!Viewer) throw new Error('TommyEngineViewer must load before focus_inspector.js');

  const proto = Viewer.prototype;
  const baseProjector = proto._projector;

  proto.focus = 'whole';

  proto.setFocus = function(name) {
    if (!['whole', 'right_hand', 'tool'].includes(name)) return;
    this.focus = name;
    this.draw();
  };

  proto._focusSubset = function(points) {
    if (this.focus === 'whole') return points;

    const subset = {};
    const include = name => {
      if (points[name]) subset[name] = points[name];
    };

    if (this.focus === 'right_hand' || this.focus === 'tool') {
      ['r_elbow', 'r_forearm_pro', 'r_wrist_flex', 'r_wrist_dev', 'endpoint_right_hand'].forEach(include);
      Object.keys(points).forEach(name => {
        if (name.startsWith('right_thumb_') || name.startsWith('right_index_') ||
            name.startsWith('right_middle_') || name.startsWith('right_ring_') ||
            name.startsWith('right_little_')) subset[name] = points[name];
      });
    }

    if (this.focus === 'tool') {
      (this.snapshot?.tools || []).forEach((tool, i) => {
        if (tool.center) subset[`__tool_${i}_center`] = tool.center;
        if (tool.tip) subset[`__tool_${i}_tip`] = tool.tip;
        if (tool.rear) subset[`__tool_${i}_rear`] = tool.rear;
      });
    }

    return Object.keys(subset).length ? subset : points;
  };

  proto._projector = function(points, width, height) {
    return baseProjector.call(this, this._focusSubset(points), width, height);
  };

  function updateFocusTruth(name) {
    const el = document.getElementById('focusTruth');
    if (!el) return;
    const text = {
      whole: 'Whole body framing from the live 3D state.',
      right_hand: 'Right-hand inspection framing only. MotorOS and joints are unchanged.',
      tool: 'Hand + tool inspection framing only. The pencil geometry still comes from the live engine.'
    };
    el.textContent = text[name] || text.whole;
  }

  document.querySelectorAll('[data-focus]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-focus]').forEach(x => x.classList.toggle('active', x === button));
      window.tommyViewer.setFocus(button.dataset.focus);
      updateFocusTruth(button.dataset.focus);
    });
  });

  updateFocusTruth('whole');
})();
