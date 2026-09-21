// Loaded ONLY by the localhost test server, before the production application's JS.
(() => {
  const params = new URLSearchParams(location.search);
  let visible = true;
  let cameraDenied = params.has("deny-camera");
  const streams = [];
  const canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const target = new Image(); target.src = "/assets/target.jpg";
  const ready = target.decode();
  function draw() {
    ctx.fillStyle = "#333"; ctx.fillRect(0, 0, 720, 1280);
    if (visible && target.complete) ctx.drawImage(target, 90, 270, 540, 728);
  }
  const timer = setInterval(draw, 33);
  navigator.mediaDevices.getUserMedia = async () => {
    if (cameraDenied) throw new DOMException("Test permission denied", "NotAllowedError");
    await ready; draw();
    const stream = canvas.captureStream(30); streams.push(stream); return stream;
  };
  navigator.mediaDevices.enumerateDevices = async () => [];
  if (params.has("block-autoplay")) {
    const play = HTMLMediaElement.prototype.play;
    const unlocked = new WeakSet();
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes("movie.mp4") && !unlocked.has(this)) {
        if (!navigator.userActivation.isActive) return Promise.reject(new DOMException("Simulated autoplay restriction", "NotAllowedError"));
        unlocked.add(this);
      }
      return play.call(this);
    };
  }
  const errors = [];
  window.addEventListener("error", e => errors.push(e.message));
  window.addEventListener("unhandledrejection", e => errors.push(String(e.reason)));
  window.addEventListener("DOMContentLoaded", () => {
    const controls = document.createElement("section");
    controls.style.cssText = "position:fixed;right:10px;top:65px;z-index:1000;background:#fff;color:#000;padding:10px;max-width:260px;font:12px sans-serif";
    const status = document.createElement("pre"); status.id = "fixture-status";
    function button(label, fn) { const b = document.createElement("button"); b.textContent = label; b.onclick = fn; b.style.cssText = "color:#000;margin:4px;padding:8px;background:#ddd"; controls.append(b); }
    button("TEST hide card", () => { visible = false; });
    button("TEST show card", () => { visible = true; });
    button("TEST resize x30", () => { for (let n = 0; n < 30; n++) window.dispatchEvent(new Event("resize")); });
    button("TEST allow camera", () => { cameraDenied = false; });
    controls.append(status); document.body.append(controls);
    setInterval(() => {
      const source = document.querySelector(".texture-video");
      const root = document.querySelector(".ar-container");
      status.textContent = JSON.stringify({ syntheticCamera: true, visible, cameraDenied, sourceCount: document.querySelectorAll(".texture-video").length, time: source?.currentTime, ready: root?.classList.contains("is-ready"), cameraVideos: root?.querySelectorAll("video").length, activeTracks: streams.flatMap(s => s.getTracks()).filter(t => t.readyState === "live").length, errors }, null, 2);
    }, 200);
  });
  window.addEventListener("pagehide", () => { clearInterval(timer); streams.forEach(s => s.getTracks().forEach(t => t.stop())); });
})();
