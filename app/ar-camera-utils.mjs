/** Only use explicitly identifiable physical wide cameras; never guess by index. */
export function standardRearCamera(devices) {
  return devices.find((device) => device.kind === "videoinput" && device.deviceId &&
    /^(back camera|back wide angle camera|背面カメラ|背面広角カメラ)$/i.test(device.label.trim()));
}

/** Ignore height-only changes caused by browser chrome, but handle real rotation. */
export function stableViewport(previous, next) {
  if (!previous || Math.abs(previous.width - next.width) > 2 || previous.orientation !== next.orientation) {
    return { ...next };
  }
  return previous;
}

/** Acquire a physical standard rear lens before recognition starts. */
export async function openRearCamera(mediaDevices) {
  // Preserve the browser's normal camera resolution: raising it also raises tracking cost.
  const base = { frameRate: { ideal: 30, max: 30 } };
  const fallback = { audio: false, video: { ...base, facingMode: { ideal: "environment" } } };
  let stream = await mediaDevices.getUserMedia(fallback);
  let candidate;
  try { candidate = standardRearCamera(await mediaDevices.enumerateDevices()); } catch { /* Labels can be unavailable. */ }
  if (candidate && candidate.deviceId !== stream.getVideoTracks()[0]?.getSettings().deviceId) {
    stream.getTracks().forEach((track) => track.stop());
    try {
      stream = await mediaDevices.getUserMedia({ audio: false, video: { ...base, deviceId: { exact: candidate.deviceId } } });
    } catch {
      // Some browsers list a device that cannot be opened. Restore a usable rear stream.
      stream = await mediaDevices.getUserMedia(fallback);
    }
  }
  return stream;
}
