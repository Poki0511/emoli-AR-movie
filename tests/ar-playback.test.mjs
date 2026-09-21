import assert from "node:assert/strict";
import test from "node:test";
import { ARPlayback } from "../app/ar-playback.mjs";

class Clock {
  time = 0;
  id = 0;
  timers = new Map();
  now = () => this.time;
  setTimeout = (fn, delay) => { const id = ++this.id; this.timers.set(id, { at: this.time + delay, fn }); return id; };
  clearTimeout = (id) => this.timers.delete(id);
  tick(ms) {
    const end = this.time + ms;
    while (true) {
      const next = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.time = timer.at;
      this.timers.delete(id);
      timer.fn();
    }
    this.time = end;
  }
}
class Video extends EventTarget {
  readyState = 0; networkState = 2; currentTime = 0; paused = true; error = null;
  playCalls = 0; pauseCalls = 0; loadCalls = 0; results = [];
  play() { this.playCalls++; this.paused = false; return this.results.shift()?.() ?? Promise.resolve(); }
  pause() { this.pauseCalls++; this.paused = true; }
  load() { this.loadCalls++; this.error = null; this.currentTime = 0; }
  advance(time) { this.readyState = 4; this.currentTime = time; this.dispatchEvent(new Event("timeupdate")); }
}
function setup(options = {}) {
  const clock = new Clock();
  const video = new Video();
  const states = [];
  const playback = new ARPlayback(video, { clock, onState: s => states.push(s), ...options });
  return { clock, video, states, playback };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("default timer adapter preserves browser timer receiver semantics", async () => {
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = function () { assert.equal(this, undefined); return 1; };
  globalThis.clearTimeout = function () { assert.equal(this, undefined); };
  try {
    const playback = new ARPlayback(new Video());
    playback.targetFound();
    playback.dispose();
    await flush();
  } finally {
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});

test("first recognition calls play immediately at HAVE_NOTHING (Safari preload regression)", async () => {
  const { video, playback } = setup();
  assert.equal(video.readyState, 0);
  playback.targetFound();
  assert.equal(video.playCalls, 1);
  await flush();
  assert.equal(playback.state, "loading");
  video.advance(0.1);
  assert.equal(playback.state, "playing");
});

test("resolved play or playing event alone must not report advancing frames", async () => {
  const { video, playback, clock } = setup();
  playback.targetFound();
  await flush();
  video.dispatchEvent(new Event("playing"));
  clock.tick(500);
  assert.equal(playback.state, "loading");
  assert.equal(playback.hasFrame, false);
});

test("policy rejection is explicit, never repeatedly retried, and direct gesture retries synchronously", async () => {
  const { video, playback, clock } = setup();
  video.results.push(() => Promise.reject(new DOMException("Low power policy", "NotAllowedError")));
  playback.targetFound();
  await flush();
  assert.equal(playback.state, "blocked");
  assert.equal(playback.snapshot().lastError, "NotAllowedError");
  clock.tick(60000);
  playback.setPageVisible(false);
  playback.setPageVisible(true);
  assert.equal(video.playCalls, 1);
  playback.retryFromGesture();
  assert.equal(video.playCalls, 2);
  assert.equal(video.loadCalls, 0);
  await flush();
  video.advance(0.15);
  assert.equal(playback.state, "playing");
});

test("brief target loss neither seeks nor calls play a second time", async () => {
  const { video, playback, clock } = setup();
  playback.targetFound();
  await flush();
  video.advance(2);
  playback.targetLost();
  clock.tick(200);
  playback.targetFound();
  clock.tick(100);
  assert.equal(video.currentTime, 2);
  assert.equal(video.playCalls, 1);
  assert.equal(video.pauseCalls, 0);
});

test("confirmed removal resets playback, reinsertion starts once from zero", async () => {
  const { video, playback, clock } = setup();
  playback.targetFound(); await flush(); video.advance(3);
  playback.targetLost(); clock.tick(250);
  assert.equal(video.currentTime, 0);
  assert.equal(video.paused, true);
  assert.equal(playback.state, "idle");
  playback.targetFound(); playback.targetFound();
  assert.equal(video.playCalls, 2);
});

test("ended triggers fade once, never replays on visibility or short tracking loss", async () => {
  let fades = 0;
  const { video, playback, clock } = setup({ onEnded: () => fades++ });
  playback.targetFound(); await flush(); video.advance(6.8);
  video.dispatchEvent(new Event("ended"));
  video.dispatchEvent(new Event("ended"));
  playback.setPageVisible(false); playback.setPageVisible(true);
  playback.targetLost(); clock.tick(100); playback.targetFound();
  assert.equal(fades, 1);
  assert.equal(video.playCalls, 1);
  assert.equal(playback.state, "ended");
  playback.targetLost(); clock.tick(250); playback.targetFound();
  assert.equal(video.playCalls, 2);
  assert.equal(playback.completed, false);
});

test("a late rejection from the removed target cannot block a newer playback", async () => {
  const { video, playback, clock } = setup();
  let reject;
  video.results.push(() => new Promise((_, no) => { reject = no; }));
  playback.targetFound();
  playback.targetLost(); clock.tick(250); playback.targetFound();
  await flush(); video.advance(0.2);
  reject(new DOMException("old play", "NotAllowedError")); await flush();
  assert.equal(playback.state, "playing");
});

test("hung play promise times out visibly, does not spin forever, and can be retried", async () => {
  const { video, playback, clock } = setup();
  video.results.push(() => new Promise(() => {}));
  playback.targetFound(); clock.tick(12000);
  assert.equal(playback.state, "error");
  assert.equal(playback.lastError, "PlaybackTimeout");
  assert.equal(clock.timers.size, 0);
  playback.retryFromGesture(); await flush(); video.advance(0.1);
  assert.equal(playback.state, "playing");
});

test("transient AbortError retries are bounded and can recover", async () => {
  const { video, playback, clock } = setup();
  video.results.push(() => Promise.reject(new DOMException("loading", "AbortError")));
  playback.targetFound(); await flush(); clock.tick(300); await flush(); video.advance(0.1);
  assert.equal(video.playCalls, 2);
  assert.equal(playback.state, "playing");
});

test("repeated AbortErrors stop at three calls", async () => {
  const { video, playback, clock } = setup();
  for (let n = 0; n < 3; n++) video.results.push(() => Promise.reject(new DOMException("aborted", "AbortError")));
  playback.targetFound(); await flush(); clock.tick(300); await flush(); clock.tick(300); await flush();
  clock.tick(30000);
  assert.equal(video.playCalls, 3);
  assert.equal(playback.state, "error");
});

test("background pauses, foreground resumes without rewind, stale promises are ignored", async () => {
  const { video, playback } = setup();
  playback.targetFound(); await flush(); video.advance(3);
  playback.setPageVisible(false);
  assert.equal(video.paused, true);
  playback.setPageVisible(true); await flush();
  assert.equal(video.currentTime, 3);
  video.advance(3.1);
  assert.equal(playback.state, "playing");
});

test("stalled clock switches to buffering, then fails instead of falsely reporting playing", async () => {
  const { video, playback, clock } = setup();
  playback.targetFound(); await flush(); video.advance(1);
  clock.tick(1250); assert.equal(playback.state, "buffering");
  clock.tick(11000); assert.equal(playback.state, "error");
});

test("media error is surfaced and a retry reloads the same element", async () => {
  const { video, playback } = setup();
  playback.targetFound(); await flush();
  video.error = { code: 2 }; video.dispatchEvent(new Event("error"));
  assert.equal(playback.lastError, "MediaError:2");
  playback.retryFromGesture();
  assert.equal(video.loadCalls, 1);
  assert.equal(video.playCalls, 2);
});

test("dispose clears timers and media listeners and ignores late promises", async () => {
  let reject; let fades = 0;
  const { video, playback, clock } = setup({ onEnded: () => fades++ });
  video.results.push(() => new Promise((_, no) => { reject = no; }));
  playback.targetFound(); playback.targetLost(); playback.dispose();
  reject(new DOMException("old", "NotAllowedError")); await flush();
  video.dispatchEvent(new Event("ended"));
  clock.tick(60000);
  assert.equal(fades, 0);
  assert.equal(clock.timers.size, 0);
  assert.notEqual(playback.state, "blocked");
  assert.equal(video.paused, true);
});
