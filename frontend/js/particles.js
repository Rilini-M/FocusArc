/*
  Ambient particle background. Single canvas, requestAnimationFrame loop, no external
  library. Sits behind all UI (pointer-events: none, low z-index) and never intercepts
  clicks. Each theme gets its own particle "cast" — not just a recolor — so the
  atmosphere reads as distinct per theme: leaves for the default/nature look, dust for
  dark, sparkles for royal, embers for vampire, neon sparks for cyberpunk.
*/

const FOCUSARC_PARTICLE_THEMES = {
  default: {
    glow: 12,
    mix: [
      { kind: 'leaf', weight: 0.35, colors: ['#2dd4bf', '#67e8f9'] },
      { kind: 'dot', weight: 0.45, colors: ['#2dd4bf', '#67e8f9'] },
      { kind: 'sparkle', weight: 0.2, colors: ['#eafdfb'] },
    ],
  },
  nature: {
    glow: 10,
    mix: [
      { kind: 'leaf', weight: 0.4, colors: ['#4ade80', '#a3e635'] },
      { kind: 'dot', weight: 0.5, colors: ['#4ade80', '#86efac'] },
      { kind: 'sparkle', weight: 0.1, colors: ['#edfdf3'] },
    ],
  },
  dark: {
    glow: 6,
    mix: [
      { kind: 'dust', weight: 0.75, colors: ['#d1d5db', '#f9fafb'] },
      { kind: 'sparkle', weight: 0.25, colors: ['#f9fafb'] },
    ],
  },
  royal: {
    glow: 13,
    mix: [
      { kind: 'sparkle', weight: 0.45, colors: ['#f4c95d', '#5b7cfa'] },
      { kind: 'dot', weight: 0.55, colors: ['#f4c95d', '#5b7cfa'] },
    ],
  },
  vampire: {
    glow: 11,
    mix: [
      { kind: 'ember', weight: 0.55, colors: ['#e11d48', '#f87171'] },
      { kind: 'dust', weight: 0.45, colors: ['#f87171', '#b78a8c'] },
    ],
  },
  cyberpunk: {
    glow: 15,
    mix: [
      { kind: 'spark', weight: 0.45, colors: ['#ff2e9f', '#22d3ee'] },
      { kind: 'dot', weight: 0.35, colors: ['#22d3ee', '#ff2e9f'] },
      { kind: 'sparkle', weight: 0.2, colors: ['#e879f9', '#22d3ee'] },
    ],
  },
};

(function initFocusArcParticles() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.id = 'focusarc-particles';
  canvas.style.cssText =
    'position:fixed; inset:0; width:100%; height:100%; z-index:1; pointer-events:none;';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let particles = [];
  let width = 0;
  let height = 0;
  let clock = 0;

  function baseCount() {
    // Desktop gets a full, clearly-visible atmosphere; smaller viewports scale down so
    // the canvas stays cheap on phones without looking empty.
    const area = width * height;
    if (width < 560) return 40;
    if (width < 900) return 70;
    return Math.min(150, Math.round(area / 9000));
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function pickWeighted(mix) {
    const roll = Math.random();
    let acc = 0;
    for (const entry of mix) {
      acc += entry.weight;
      if (roll <= acc) return entry;
    }
    return mix[mix.length - 1];
  }

  function spawnOne(entry, config) {
    const kind = entry.kind;
    const color = entry.colors[Math.floor(Math.random() * entry.colors.length)];
    const base = {
      kind,
      color,
      x: Math.random() * width,
      y: Math.random() * height,
      glow: config.glow,
      alpha: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    };

    if (kind === 'leaf') {
      return {
        ...base,
        r: 6 + Math.random() * 8,
        vx: (Math.random() - 0.5) * 0.35,
        vy: 0.12 + Math.random() * 0.28,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        sway: 0.6 + Math.random() * 1.2,
      };
    }
    if (kind === 'dust') {
      return {
        ...base,
        r: 0.6 + Math.random() * 1.6,
        vx: (Math.random() - 0.5) * 0.08,
        vy: -0.03 - Math.random() * 0.07,
      };
    }
    if (kind === 'sparkle') {
      return {
        ...base,
        r: 2 + Math.random() * 3,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -0.03 - Math.random() * 0.1,
        twinkleSpeed: 0.03 + Math.random() * 0.05,
      };
    }
    if (kind === 'ember') {
      return {
        ...base,
        r: 1 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.15 - Math.random() * 0.35,
        flickerSpeed: 0.05 + Math.random() * 0.08,
      };
    }
    if (kind === 'spark') {
      return {
        ...base,
        r: 2 + Math.random() * 4,
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.5,
        rotation: Math.random() * Math.PI * 2,
      };
    }
    // dot fallback
    return {
      ...base,
      r: 1 + Math.random() * 1.8,
      vx: (Math.random() - 0.5) * 0.18,
      vy: -0.18 * (0.4 + Math.random() * 0.8),
    };
  }

  function spawnParticles(config) {
    const count = baseCount();
    particles = Array.from({ length: count }, () => spawnOne(pickWeighted(config.mix), config));
  }

  function wrap(p) {
    if (p.y < -20) p.y = height + 20;
    if (p.y > height + 20) p.y = -20;
    if (p.x < -20) p.x = width + 20;
    if (p.x > width + 20) p.x = -20;
  }

  function drawDot(p) {
    ctx.beginPath();
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.glow;
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLeaf(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.glow;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.quadraticCurveTo(p.r * 0.9, -p.r * 0.2, 0, p.r);
    ctx.quadraticCurveTo(-p.r * 0.9, -p.r * 0.2, 0, -p.r);
    ctx.fill();
    ctx.restore();
  }

  function drawSparkle(p) {
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(clock * (p.twinkleSpeed || 0.04) + p.phase));
    ctx.save();
    ctx.globalAlpha = p.alpha * twinkle;
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.glow;
    ctx.lineWidth = Math.max(1, p.r * 0.35);
    ctx.beginPath();
    ctx.moveTo(p.x - p.r, p.y);
    ctx.lineTo(p.x + p.r, p.y);
    ctx.moveTo(p.x, p.y - p.r);
    ctx.lineTo(p.x, p.y + p.r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEmber(p) {
    const flicker = 0.5 + 0.5 * Math.abs(Math.sin(clock * (p.flickerSpeed || 0.06) + p.phase));
    ctx.save();
    ctx.globalAlpha = p.alpha * flicker;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.glow * flicker;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpark(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.strokeStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.glow;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-p.r, 0);
    ctx.lineTo(p.r, 0);
    ctx.stroke();
    ctx.restore();
  }

  function draw(p) {
    ctx.globalAlpha = p.alpha;
    if (p.kind === 'leaf') drawLeaf(p);
    else if (p.kind === 'sparkle') drawSparkle(p);
    else if (p.kind === 'ember') drawEmber(p);
    else if (p.kind === 'spark') drawSpark(p);
    else drawDot(p);
  }

  function step() {
    clock += 1;
    ctx.clearRect(0, 0, width, height);

    particles.forEach((p) => {
      // Leaves sway and spin as they fall; every other kind drifts in a straight line.
      if (p.kind === 'leaf') {
        p.x += p.vx + Math.sin(clock * 0.01 + p.phase) * p.sway * 0.05;
        p.rotation += p.rotationSpeed;
      } else {
        p.x += p.vx;
      }
      p.y += p.vy;
      wrap(p);
      draw(p);
    });

    ctx.globalAlpha = 1;
    requestAnimationFrame(step);
  }

  function setTheme(theme) {
    const config = FOCUSARC_PARTICLE_THEMES[theme] || FOCUSARC_PARTICLE_THEMES.default;
    spawnParticles(config);
  }

  resize();
  setTheme(document.documentElement.getAttribute('data-theme') || 'default');

  if (!prefersReducedMotion) {
    step();
  } else {
    // Still render one still frame so the atmosphere isn't completely absent.
    ctx.clearRect(0, 0, width, height);
    particles.forEach(draw);
    ctx.globalAlpha = 1;
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      setTheme(document.documentElement.getAttribute('data-theme') || 'default');
    }, 200);
  });

  window.FocusArcParticles = { setTheme };
})();
