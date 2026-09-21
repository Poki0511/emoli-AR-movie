import assert from "node:assert/strict";
import test from "node:test";
import { standardRearCamera, stableViewport, openRearCamera } from "../app/ar-camera-utils.mjs";

const device = (label, deviceId = label) => ({ kind: "videoinput", label, deviceId });
test("choose explicitly labeled standard rear, not auto-macro/ultrawide/front lenses", () => {
  const back = device("Back Camera");
  assert.equal(standardRearCamera([device("Front Camera"), device("Back Triple Camera"), device("Back Ultra Wide Camera"), back]), back);
  assert.equal(standardRearCamera([device("背面超広角カメラ"), device("背面広角カメラ")]).label, "背面広角カメラ");
  assert.equal(standardRearCamera([device("camera2 0"), device("camera2 1")]), undefined);
  assert.equal(standardRearCamera([device("")]), undefined);
});
test("toolbar height changes preserve exact layout; real width/orientation changes update", () => {
  const initial = { width: 390, height: 664, orientation: "portrait-primary" };
  assert.equal(stableViewport(initial, { ...initial, height: 750 }), initial);
  assert.equal(stableViewport(initial, { ...initial, width: 391, height: 750 }), initial);
  const rotated = { width: 844, height: 390, orientation: "landscape-primary" };
  assert.deepEqual(stableViewport(initial, rotated), rotated);
  assert.deepEqual(stableViewport(null, initial), initial);
});
function stream(id) {
  const track = { stopped: false, stop() { this.stopped = true; }, getSettings: () => ({ deviceId: id }) };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
test("physical lens selection happens before AR and uses exact deviceId, stops previous stream", async () => {
  const initial = stream("virtual"); const selected = stream("wide"); const calls = [];
  const result = await openRearCamera({
    enumerateDevices: async () => [device("Back Triple Camera", "virtual"), device("Back Camera", "wide")],
    getUserMedia: async c => { calls.push(c); return calls.length === 1 ? initial : selected; },
  });
  assert.equal(result, selected); assert.equal(initial.track.stopped, true);
  assert.deepEqual(calls[1].video.deviceId, { exact: "wide" });
  assert.equal(calls[0].audio, false);
  assert.equal(calls[1].video.frameRate.max, 30);
});
test("no unnecessary reopening when the standard lens is already selected", async () => {
  const original = stream("wide"); let calls = 0;
  const result = await openRearCamera({ enumerateDevices: async () => [device("Back Camera", "wide")], getUserMedia: async () => { calls++; return original; } });
  assert.equal(result, original); assert.equal(calls, 1); assert.equal(original.track.stopped, false);
});
test("unknown or denied camera labels keep the functioning stream", async () => {
  for (const enumerateDevices of [async () => [device("camera2 0")], async () => { throw new Error("denied"); }]) {
    const original = stream("x"); let calls = 0;
    assert.equal(await openRearCamera({ enumerateDevices, getUserMedia: async () => { calls++; return original; } }), original);
    assert.equal(calls, 1); assert.equal(original.track.stopped, false);
  }
});
test("failed physical camera selection reacquires a working environment stream", async () => {
  const initial = stream("virtual"); const restored = stream("virtual"); const calls = [];
  const result = await openRearCamera({ enumerateDevices: async () => [device("Back Camera", "wide")], getUserMedia: async c => {
    calls.push(c); if (calls.length === 2) throw new DOMException("device unavailable", "OverconstrainedError");
    return calls.length === 1 ? initial : restored;
  } });
  assert.equal(result, restored); assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].video.facingMode, { ideal: "environment" });
});
