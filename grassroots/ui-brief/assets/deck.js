// zutot talk slides — minimal slide engine (no dependencies), LTR.
// Keys: →/Space/PageDown = next, ←/PageUp = previous, Home/End,
// F = fullscreen, Esc = back to the home page (also from fullscreen),
// +/-/0 (or Ctrl/Cmd +/-/0, Ctrl+wheel, pinch) = zoom in/out/fit.
// No speaker-notes key: <aside> notes stay hidden. Arrow keys always change slides,
// even when a slider has focus (a deck may add its own non-arrow keys).
(function () {
  const stage = document.getElementById('stage');
  const slides = Array.from(stage.querySelectorAll('.slide'));
  const progress = document.createElement('div'); progress.id = 'progress';
  const counter = document.createElement('div'); counter.id = 'counter';
  document.body.append(progress, counter);

  let i = Math.max(0, Math.min(slides.length - 1, (parseInt(location.hash.slice(1), 10) || 1) - 1));

  // Zoom: the slide opens fitted to the window (zoom = 1). +/-/0, Ctrl/Cmd +/-/0,
  // Ctrl+wheel and trackpad pinch zoom the slide itself (browser zoom would just be
  // re-fitted away); when zoomed in, the page scrolls.
  const view = document.createElement('div'); view.id = 'view';
  const sizer = document.createElement('div'); sizer.id = 'sizer';
  stage.parentNode.insertBefore(view, stage);
  view.appendChild(sizer); sizer.appendChild(stage);
  let zoom = 1, hideTimer = null;

  function fit(ax, ay) {  // (ax, ay): point in the window that stays put while zooming
    const W = view.clientWidth || window.innerWidth, H = view.clientHeight || window.innerHeight;
    const old = stage._s || 1;
    const fx = ax === undefined ? W / 2 : ax, fy = ay === undefined ? H / 2 : ay;
    const px = (view.scrollLeft + fx - (stage._x || 0)) / old;  // slide coordinates under the anchor
    const py = (view.scrollTop + fy - (stage._y || 0)) / old;
    const s = Math.min(W / 1920, H / 1080) * zoom;
    const w = 1920 * s, h = 1080 * s;
    const sw = Math.max(W, w), sh = Math.max(H, h);
    sizer.style.width = `${sw}px`; sizer.style.height = `${sh}px`;
    stage._s = s; stage._x = (sw - w) / 2; stage._y = (sh - h) / 2;
    stage.style.transform = `translate(${stage._x}px, ${stage._y}px) scale(${s})`;
    view.scrollLeft = px * s + stage._x - fx;
    view.scrollTop = py * s + stage._y - fy;
  }

  function setZoom(z, ax, ay) {
    zoom = Math.max(0.25, Math.min(8, z));
    if (Math.abs(zoom - 1) < 0.01) zoom = 1;
    fit(ax, ay);
    counter.textContent = `${Math.round(zoom * 100)}%`;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { counter.textContent = `${i + 1} / ${slides.length}`; }, 1200);
  }
  const zoomKey = (k) => (k === '+' || k === '=') ? 1.25 : (k === '-' || k === '_') ? 0.8 : (k === '0') ? 0 : null;

  // Ctrl/Cmd +/-/0 (browser-zoom shortcuts) zoom the slide instead
  document.addEventListener('keydown', (e) => {
    const f = zoomKey(e.key);
    if (f === null || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    setZoom(f ? zoom * f : 1);
  }, true);
  // Ctrl+wheel, and trackpad pinch (sent as Ctrl+wheel)
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const d = Math.max(-50, Math.min(50, e.deltaY));  // a wheel notch ≈ 25%, pinch is gradual
    setZoom(zoom * Math.exp(-d * 0.005), e.clientX, e.clientY);
  }, { passive: false });

  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((el, k) => el.classList.toggle('active', k === i));
    progress.style.width = `${((i + 1) / slides.length) * 100}%`;
    counter.textContent = `${i + 1} / ${slides.length}`;
    history.replaceState(null, '', `#${i + 1}`);
  }

  const home = () => { location.href = '../../'; };
  let fsByKey = false;
  // Esc in fullscreen is swallowed by the browser (it exits fullscreen): go home then too,
  // unless fullscreen was left with F.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !fsByKey) home();
    fsByKey = false;
  });
  const interactive = (t) => t && t.closest && t.closest('input, select, textarea, .interactive');

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case ' ': case 'PageDown': case 'Enter':
        e.preventDefault(); show(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); show(i - 1); break;
      case 'Home': show(0); break;
      case 'End': show(slides.length - 1); break;
      case 'f': case 'F':
        fsByKey = true;
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen();
        break;
      case 'Escape': home(); break;
      case '+': case '=': setZoom(zoom * 1.25); break;
      case '-': case '_': setZoom(zoom * 0.8); break;
      case '0': setZoom(1); break;
    }
  });

  // click: right half = next, left half = previous
  document.addEventListener('click', (e) => {
    if (e.target.closest('a') || interactive(e.target)) return;
    show(e.clientX > window.innerWidth / 2 ? i + 1 : i - 1);
  });

  // swipe
  let x0 = null;
  // no swipe-to-change while zoomed in (a swipe pans) or with two fingers (pinch)
  const zoomedIn = () => zoom > 1 || (window.visualViewport && window.visualViewport.scale > 1.01);
  document.addEventListener('touchstart', (e) => {
    x0 = (interactive(e.target) || zoomedIn() || e.touches.length > 1) ? null : e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) x0 = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1);
  });

  window.addEventListener('resize', () => fit());
  window.addEventListener('load', () => fit());
  window.addEventListener('hashchange', () => show((parseInt(location.hash.slice(1), 10) || 1) - 1));
  fit(); show(i);
})();
