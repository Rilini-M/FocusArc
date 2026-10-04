/*
  Public landing page behavior: navbar background on scroll, mobile menu toggle, and a
  subtle fade-up reveal for sections. Content is fully visible without JS — the reveal
  styles only apply once this script adds .js to <html>.
*/

(function initLanding() {
  refreshIcons();

  const nav = document.getElementById('lp-nav');
  const toggle = document.getElementById('lp-nav-toggle');
  const links = document.getElementById('lp-nav-links');

  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 12);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function setMenu(open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || !('IntersectionObserver' in window)) return;

  document.documentElement.classList.add('js');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
})();
