(() => {
  const Viewer = window.TommyEngineViewer;
  if (!Viewer) throw new Error('TommyEngineViewer must load before contact_overlay.js');

  const proto = Viewer.prototype;
  const baseDrawTools = proto._drawTools;

  proto.measurements = null;

  proto.setMeasurements = function(measurements) {
    // The next visual tick will draw these observations. Avoid a second full
    // Canvas render for the measurement update itself.
    this.measurements = measurements;
  };

  proto._contactObservation = function(digit) {
    return this.measurements?.tool_contact?.digits?.[digit] || null;
  };

  proto._contactColor = function(observation) {
    if (!observation) return '#73c7e8';
    if (observation.mode === 'slide') return '#ff6b6b';
    if (observation.mode === 'roll') return '#f6ad55';
    if (observation.loaded || observation.mode === 'stick') return '#6ee7a8';
    return '#73c7e8';
  };

  proto._drawFingerPadContacts = function(snap, project) {
    const pads = snap.finger_pads || {};
    const detailed = this.layer === 'anatomy' || this.focus === 'right_hand' || this.focus === 'tool';
    const ctx = this.ctx;

    Object.entries(pads).forEach(([digit, pad]) => {
      if (!pad?.point || !pad?.normal) return;
      const observation = this._contactObservation(digit);
      const color = this._contactColor(observation);
      const p = project(pad.point);

      ctx.beginPath();
      ctx.arc(p[0], p[1], detailed ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = detailed ? 0.96 : 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (!detailed) return;

      const normalLengthM = 0.012;
      const end = [
        pad.point[0] + pad.normal[0] * normalLengthM,
        pad.point[1] + pad.normal[1] * normalLengthM,
        pad.point[2] + pad.normal[2] * normalLengthM,
      ];
      const n = project(end);
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(n[0], n[1]);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const mode = observation?.mode || 'geometry';
      const distance = observation?.signed_distance_m;
      const distanceText = typeof distance === 'number' ? ` ${Number(distance * 1000).toFixed(2)}mm` : '';
      ctx.font = '8px system-ui';
      ctx.fillStyle = color;
      ctx.fillText(`${digit} · ${mode}${distanceText}`, p[0] + 6, p[1] - 5);
    });
  };

  proto._drawTools = function(snap, project) {
    baseDrawTools.call(this, snap, project);
    this._drawFingerPadContacts(snap, project);
  };
})();
