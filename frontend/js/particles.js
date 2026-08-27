/*
  Lightweight canvas ambient particle background. No external library — a single canvas,
  requestAnimationFrame loop, and a small palette/behavior table per theme. Sits behind all
  UI (pointer-events: none, low z-index) and never intercepts clicks.
*/

const FOCUSARC_PARTICLE_THEMES = {
  default: { colors: ['#2dd4bf', '#67e8f9'], count: 46, speed: 0.18, size: [1, 2.6], glow: 10 },
  nature: { colors: ['#4ade80', '#a3e635'], count: 40, speed: 0.14, size: [1, 2.4], glow: 8 },
  dark: { colors: ['#d1d5db', '#f9fafb'], count: 26, speed: 0.08, size: [0.6, 1.6], glow: 5 },
  royal: { colors: ['#5b7cfa', '#f4c95d'], count: 42, speed: 0.15, size: [1, 2.6], glow: 11 },
  vampire: { colors: ['#e11d48', '#f87171'], count: 32, speed: 0.1, size: [1, 2.2], glow: 9 },
  cyberpunk: { colors: ['#22d3ee', '#e879f9'], count: 54, speed: 0.32, size: [1, 2.8], glow: 13 },
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
  let rafId = null;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function spawnParticles(config) {
    particles = Array.from({ length: config.count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: config.size[0] + Math.random() * (config.size[1] - config.size[0]),
      vx: (Math.random() - 0.5) * config.speed,
      vy: -config.speed * (0.4 + Math.random() * 0.8),
      color: config.colors[Math.floor(Math.random() * config.colors.length)],
      alpha: 0.25 + Math.random() * 0.5,
      glow: config.glow,
    }));
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.y < -10) p.y = height + 10;
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      ctx.beginPath();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.glow;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(step);
  }

  function setTheme(theme) {
    const config = FOCUSARC_PARTICLE_THEMES[theme] || FOCUSARC_PARTICLE_THEMES.default;
    spawnParticles(config);
  }

  resize();
  setTheme(document.documentElement.getAttribute('data-theme') || 'default');

  if (!prefersReducedMotion) {
    step();
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
