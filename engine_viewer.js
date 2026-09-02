(() => {
  const MAJOR_LABELS = [
    'neck_pitch', 'r_shoulder_flex', 'l_shoulder_flex', 'r_elbow', 'l_elbow',
    'r_wrist_dev', 'l_wrist_dev', 'r_hip_flex', 'l_hip_flex', 'r_knee', 'l_knee',
    'r_ankle_flex', 'l_ankle_flex'
  ];

  class TommyEngineViewer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.snapshot = null;
      this.layer = 'skeleton';
      this.yaw = -0.42;
      this.pitch = 0.04;
      this.resizeObserver = new ResizeObserver(() => this.draw());
      this.resizeObserver.observe(canvas);
    }

    setView(name) {
      if (name === 'front') this.yaw = 0;
      if (name === 'threequarter') this.yaw = -0.42;
      if (name === 'side') this.yaw = -Math.PI / 2;
      this.draw();
    }

    setLayer(name) {
      if (!['skeleton', 'anatomy', 'body'].includes(name)) return;
      this.layer = name;
      this.draw();
    }

    layerTruth() {
      const layers = this.snapshot?.visual_layers || {};
      return layers[this.layer] || null;
    }

    update(snapshot) {
      this.snapshot = snapshot;
      this.draw();
    }

    _resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return {width: rect.width, height: rect.height};
    }

    _rotate(p) {
      const [x, y, z] = p;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const x1 = cy * x + sy * z;
      const z1 = -sy * x + cy * z;
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      return [x1, cp * y - sp * z1, sp * y + cp * z1];
    }

    _projector(points, width, height) {
      const rotated = Object.values(points).map(p => this._rotate(p));
      if (!rotated.length) {
        const fallback = () => [width / 2, height / 2, 0];
        fallback.scale = 1;
        return fallback;
      }
      const xs = rotated.map(p => p[0]);
      const ys = rotated.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const spanX = Math.max(0.35, maxX - minX);
      const spanY = Math.max(1.1, maxY - minY);
      const pad = 42;
      const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const project = p => {
        const r = this._rotate(p);
        return [width / 2 + (r[0] - cx) * scale, height / 2 - (r[1] - cy) * scale, r[2]];
      };
      project.scale = scale;
      return project;
    }

    _regionColor(region) {
      return ({
        axial: '#d8e8f7', shoulder: '#9fd8ff', elbow: '#9fd8ff', forearm: '#a9def9',
        wrist: '#f4d6a0', hip: '#b7e4c7', knee: '#b7e4c7', ankle: '#c7f0d8', other: '#dce6ef'
      })[region] || '#dce6ef';
    }

    _point(p, project, radius, fill, alpha = 1) {
      const [x, y] = project(p);
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    _skeletonLine(a, b, project, kind, region = 'other', alpha = 1) {
      const pa = project(a), pb = project(b);
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.lineCap = 'round';
      ctx.lineWidth = kind === 'hand' ? 2.1 : kind === 'endpoint' ? 3.0 : 4.8;
      ctx.strokeStyle = this.layer === 'anatomy'
        ? this._regionColor(region)
        : kind === 'hand' ? '#f3d59b' : kind === 'endpoint' ? '#b8dfff' : '#e7eef6';
      ctx.globalAlpha = alpha * (kind === 'hand' ? 0.98 : 0.9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    _segmentRadiusM(seg) {
      const b = seg.b || '';
      if (seg.kind === 'hand') return 0.009;
      if (b === 'endpoint_head') return 0.075;
      if (b.includes('endpoint_right_hand') || b.includes('endpoint_left_hand')) return 0.045;
      if (b.includes('endpoint_right_foot') || b.includes('endpoint_left_foot')) return 0.055;
      if (b.endsWith('_knee')) return 0.085;
      if (b.includes('ankle_flex')) return 0.062;
      if (b.includes('hip_flex')) return 0.10;
      if (b.endsWith('_elbow')) return 0.058;
      if (b.includes('forearm_pro')) return 0.047;
      if (b.includes('shoulder_flex')) return 0.070;
      if (b === 'neck_yaw') return 0.135;
      if (b === 'neck_pitch') return 0.055;
      if (b.startsWith('thorax_')) return 0.135;
      if (b.startsWith('lumbar_')) return 0.115;
      return seg.kind === 'endpoint' ? 0.04 : 0.055;
    }

    _bodyCapsule(a, b, project, radiusM, fill, alpha = 0.78) {
      const pa = project(a), pb = project(b);
      const ctx = this.ctx;
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (Math.hypot(dx, dy) < 0.4) return;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, 2 * radiusM * project.scale);
      ctx.strokeStyle = fill;
      ctx.globalAlpha = alpha;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    _drawTorsoEnvelope(points, project) {
      const names = ['r_shoulder_flex', 'l_shoulder_flex', 'l_hip_flex', 'r_hip_flex'];
      if (!names.every(n => points[n])) return;
      const p = names.map(n => project(points[n]));
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(p[0][0], p[0][1]);
      p.slice(1).forEach(x => ctx.lineTo(x[0], x[1]));
      ctx.closePath();
      ctx.fillStyle = '#d7bda7';
      ctx.globalAlpha = 0.34;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    _drawHead(points, project) {
      if (!points.neck_pitch || !points.endpoint_head) return;
      const base = project(points.neck_pitch), top = project(points.endpoint_head);
      const dx = top[0] - base[0], dy = top[1] - base[1];
      const length = Math.max(18, Math.hypot(dx, dy));
      const cx = base[0] + dx * 0.62, cy = base[1] + dy * 0.62;
      const angle = Math.atan2(dy, dx) + Math.PI / 2;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(12, length * 0.42), Math.max(16, length * 0.55), 0, 0, Math.PI * 2);
      ctx.fillStyle = '#d8c1ad';
      ctx.globalAlpha = 0.88;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _drawBody(points, snap, project) {
      this._drawTorsoEnvelope(points, project);
      (snap.segments || []).forEach(seg => {
        if (!points[seg.a] || !points[seg.b]) return;
        const radius = this._segmentRadiusM(seg);
        const fill = seg.kind === 'hand' ? '#d9b995' : '#d4b59d';
        this._bodyCapsule(points[seg.a], points[seg.b], project, radius, fill, seg.kind === 'hand' ? 0.92 : 0.76);
      });
      this._drawHead(points, project);
      // Keep a faint engineering skeleton visible under the procedural envelope.
      (snap.segments || []).forEach(seg => {
        if (points[seg.a] && points[seg.b]) this._skeletonLine(points[seg.a], points[seg.b], project, seg.kind, 'other', 0.18);
      });
    }

    _drawAnatomy(points, snap, project) {
      (snap.segments || []).forEach(seg => {
        if (!points[seg.a] || !points[seg.b]) return;
        const region = (snap.joint_regions || {})[seg.b] || (snap.joint_regions || {})[seg.a] || 'other';
        this._skeletonLine(points[seg.a], points[seg.b], project, seg.kind, region, 1);
      });

      const axes = snap.joint_axes_world || {};
      Object.entries(axes).forEach(([name, axis]) => {
        const origin = points[name];
        if (!origin || !axis) return;
        const lengthM = MAJOR_LABELS.includes(name) ? 0.075 : 0.045;
        const end = [origin[0] + axis[0] * lengthM, origin[1] + axis[1] * lengthM, origin[2] + axis[2] * lengthM];
        const a = project(origin), b = project(end);
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineWidth = MAJOR_LABELS.includes(name) ? 2 : 1;
        ctx.strokeStyle = '#ff8e8e';
        ctx.globalAlpha = MAJOR_LABELS.includes(name) ? 0.9 : 0.28;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      MAJOR_LABELS.forEach(name => {
        if (!points[name]) return;
        const [x, y] = project(points[name]);
        const ctx = this.ctx;
        ctx.fillStyle = '#ffffffaa';
        ctx.font = '9px system-ui';
        ctx.fillText(name.replace(/^r_/, 'R ').replace(/^l_/, 'L ').replaceAll('_', ' '), x + 5, y - 5);
      });
    }

    _drawSkeleton(points, snap, project) {
      (snap.segments || []).forEach(seg => {
        if (points[seg.a] && points[seg.b]) this._skeletonLine(points[seg.a], points[seg.b], project, seg.kind);
      });
      Object.entries(points).forEach(([name, p]) => {
        if (name.includes('_thumb_') || name.includes('_index_') || name.includes('_middle_') || name.includes('_ring_') || name.includes('_little_')) {
          this._point(p, project, 2.4, '#ffe4ae');
        } else if (!name.startsWith('endpoint_')) {
          this._point(p, project, 3.0, '#9bd3ff');
        }
      });
    }

    _drawTools(snap, project) {
      (snap.tools || []).forEach(tool => {
        if (tool.rear && tool.tip) {
          const a = project(tool.rear), b = project(tool.tip);
          const ctx = this.ctx;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.lineWidth = this.layer === 'body' ? 7 : 5;
          ctx.lineCap = 'round';
          ctx.strokeStyle = tool.held ? '#f0c766' : '#d5a85e';
          ctx.stroke();
          this._point(tool.tip, project, 3, '#f7e4a9');
        } else if (tool.center) {
          this._point(tool.center, project, 4, '#d5a85e');
        }
      });
    }

    draw() {
      const {width, height} = this._resize();
      const ctx = this.ctx;
      ctx.clearRect(0, 0, width, height);

      const overlay = ctx.createRadialGradient(width * .5, height * .3, 20, width * .5, height * .5, Math.max(width, height) * .7);
      overlay.addColorStop(0, 'rgba(36,48,60,.18)');
      overlay.addColorStop(1, 'rgba(5,8,12,.48)');
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);

      const snap = this.snapshot;
      if (!snap || !snap.available) {
        ctx.fillStyle = '#ffffff99';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Waiting for live engine geometry…', width / 2, height / 2);
        return;
      }

      const points = snap.points || {};
      const project = this._projector(points, width, height);
      const groundY = project([0, -0.94, 0])[1];
      ctx.beginPath();
      ctx.moveTo(20, groundY);
      ctx.lineTo(width - 20, groundY);
      ctx.strokeStyle = '#ffffff18';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (this.layer === 'body') this._drawBody(points, snap, project);
      else if (this.layer === 'anatomy') this._drawAnatomy(points, snap, project);
      else this._drawSkeleton(points, snap, project);

      this._drawTools(snap, project);

      const truth = (snap.visual_layers || {})[this.layer] || {};
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffffb8';
      ctx.font = '11px system-ui';
      ctx.fillText(`${this.layer.toUpperCase()} · LIVE FK`, 14, 20);
      ctx.fillStyle = '#ffffff72';
      ctx.fillText(truth.status || snap.engine_model_status || 'engine model', 14, 37);
    }
  }

  window.TommyEngineViewer = TommyEngineViewer;
})();
