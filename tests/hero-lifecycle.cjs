'use strict';
// Exercise the actual HalftoneField lifecycle with a deterministic browser clock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function target(extra = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    count(type) { return listeners.get(type)?.size || 0; },
  }, extra);
}
function environment({ webgl = true, reduced = false, compile = true, link = true } = {}) {
  let next = 0, t = 0, draws = 0, scheme = 'dark';
  const uniforms = {};
  const frames = new Map();
  const reduce = target({ matches: reduced });
  const color = target({ matches: false });
  const gl = new Proxy({
    COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4,
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    getShaderParameter: () => compile, getProgramParameter: () => link,
    getAttribLocation: () => 0, getUniformLocation: (_p, n) => n,
    uniform1f: (name, value) => { uniforms[name] = value; },
    uniform2f: (name, x, y) => { uniforms[name] = [x, y]; },
    getExtension: () => ({ loseContext() {} }), drawArrays: () => { draws++; },
  }, { get(o, key) { return key in o ? o[key] : () => {}; } });
  const box = target({
    children: [], classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); child.isConnected = true; return child; },
    contains(child) { return this.children.includes(child); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 640, height: 480 }; },
  });
  const document = target({ visibilityState: 'visible', documentElement: {}, createElement(type) {
    assert.equal(type, 'canvas');
    return target({ clientWidth: 640, clientHeight: 480, width: 0, height: 0, isConnected: false,
      setAttribute() {}, getContext() { return webgl ? gl : null; },
      remove() { const index = box.children.indexOf(this); if (index >= 0) box.children.splice(index, 1); this.isConnected = false; },
    });
  } });
  let intersection;
  class FakeIntersectionObserver { constructor(cb) { this.cb = cb; intersection = this; } observe() {} disconnect() { this.disconnected = true; } }
  class FakeResizeObserver { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} }
  const context = {
    document, window: target({ IntersectionObserver: FakeIntersectionObserver, ResizeObserver: FakeResizeObserver }), devicePixelRatio: 1, performance: { now: () => t },
    matchMedia: q => q.includes('reduced-motion') ? reduce : color,
    getComputedStyle: () => ({ colorScheme: scheme, getPropertyValue: () => '#152256' }),
    requestAnimationFrame(fn) { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    IntersectionObserver: FakeIntersectionObserver, ResizeObserver: FakeResizeObserver,
    Float32Array, console,
  };
  // Keep source changes isolated: run the actual implementation rather than a copy.
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const hero = source.slice(source.indexOf('const HERO_VERT='), source.indexOf('\nconst pref='));
  assert.ok(hero.includes('function startHero(') && hero.includes('function stopHero('));
  vm.createContext(context);
  vm.runInContext(hero + '\nthis.start = startHero; this.stop = stopHero;', context);
  return {
    start: () => context.start(box), stop: () => context.stop(), box, document, reduce,
    pending: () => frames.size, draws: () => draws, uniforms, setScheme(value) { scheme = value; color.emit('change'); },
    intersection(visible) { assert.ok(intersection && !intersection.disconnected); intersection.cb([{ isIntersecting: visible }]); },
    frame() { const first = frames.entries().next(); if (first.done) return false; const [id, fn] = first.value; frames.delete(id); t += 20; fn(t); return true; },
  };
}

test('hero resumes after the window becomes visible and stops cleanly', () => {
  const h = environment(); h.start();
  assert.ok(h.pending() > 0, 'visible hero schedules a frame');
  h.frame();
  h.document.visibilityState = 'hidden'; h.document.emit('visibilitychange');
  // A final in-flight frame may already be queued.
  for (let i = 0; i < 3 && h.pending(); i++) h.frame();
  assert.equal(h.pending(), 0, 'hidden hero does not continue scheduling');
  h.document.visibilityState = 'visible'; h.document.emit('visibilitychange');
  assert.ok(h.pending() > 0, 'hero resumes without requiring pointer movement');
  h.intersection(false);
  for (let i = 0; i < 3 && h.pending(); i++) h.frame();
  assert.equal(h.pending(), 0, 'offscreen hero does not continue scheduling');
  h.intersection(true);
  assert.ok(h.pending() > 0, 'onscreen hero resumes');
  h.stop(); assert.equal(h.pending(), 0, 'stopping cancels animation');
});

test('reduced motion is static, handles changes and cleans up listeners', () => {
  const h = environment({ reduced: true }); h.start();
  for (let i = 0; i < 3 && h.pending(); i++) h.frame();
  assert.equal(h.pending(), 0);
  const before = h.draws();
  h.box.emit('pointermove', { clientX: 400, clientY: 200 });
  for (let i = 0; i < 3 && h.pending(); i++) h.frame();
  assert.equal(h.draws(), before, 'pointer does not move the reduced-motion scene');
  h.reduce.matches = false; h.reduce.emit('change', { matches: false });
  assert.ok(h.pending() > 0, 'turning reduced motion off restarts animation');
  h.frame();
  h.reduce.matches = true; h.reduce.emit('change', { matches: true });
  for (let i = 0; i < 3 && h.pending(); i++) h.frame();
  assert.equal(h.pending(), 0, 'turning reduced motion on stops animation');
  h.stop();
  assert.equal(h.box.count('pointermove'), 0, 'pointer listener removed on stop');
  assert.equal(h.document.count('visibilitychange'), 0, 'visibility listener removed on stop');
  assert.equal(h.reduce.count('change'), 0, 'preference listener removed on stop');
  h.start(); h.stop();
  assert.equal(h.box.count('pointermove'), 0, 'repeated start/stop does not accumulate handlers');
});

test('no WebGL keeps the CSS fallback and schedules no frame', () => {
  for (const opts of [{ webgl: false }, { compile: false }, { link: false }]) {
    const h = environment(opts); h.start();
    assert.equal(h.box.children.length, 0);
    assert.equal(h.pending(), 0);
    h.stop();
  }
});


test('context loss removes the canvas and allows a later fresh hero', () => {
  const h = environment(); h.start();
  const canvas = h.box.children[0];
  assert.ok(canvas && h.pending() > 0);
  canvas.emit('webglcontextlost', {});
  assert.equal(h.pending(), 0, 'context loss cancels rendering');
  assert.equal(h.box.children.length, 0, 'CSS background is no longer covered by lost canvas');
  assert.equal(h.box.count('pointermove'), 0, 'context loss detaches pointer handler');
  assert.equal(h.document.count('visibilitychange'), 0, 'context loss detaches visibility handler');
  assert.equal(h.reduce.count('change'), 0, 'context loss detaches reduced motion handler');
  h.start();
  assert.equal(h.box.children.length, 1, 'later navigation can create a fresh canvas');
  assert.ok(h.pending() > 0, 'new hero renders normally');
  h.stop();
});


test('halftone animation advances and pointer lens opens then closes', () => {
  const h = environment(); h.start(); h.frame();
  const first = h.uniforms.time; h.frame();
  assert.ok(h.uniforms.time > first, 'shader time advances');
  assert.equal(h.uniforms.cell, 9, 'uses the design system dot pitch');
  h.box.emit('pointermove', { clientX: 400, clientY: 200 }); h.frame();
  assert.ok(h.uniforms.lens > 0, 'pointer opens the lens');
  const lens = h.uniforms.lens; h.box.emit('pointerleave'); h.frame();
  assert.ok(h.uniforms.lens < lens, 'lens closes when pointer leaves');
  h.stop(); assert.equal(h.box.count('pointerleave'), 0);
});


test('theme changes update the halftone palette without restarting the hero', () => {
  const h = environment(); h.start();
  assert.equal(h.uniforms.lightTheme, 0);
  h.setScheme('light'); assert.equal(h.uniforms.lightTheme, 1);
  h.setScheme('dark'); assert.equal(h.uniforms.lightTheme, 0);
  assert.equal(h.box.children.length, 1); h.stop();
});
