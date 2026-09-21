import { MindARThree as BaseMindARThree } from "mind-ar/src/image-target/three.js";
import { openRearCamera } from "../app/ar-camera-utils.mjs";

// Keep MindAR's tracking/projection math unchanged; only manage camera and layout.
export class MindARThree extends BaseMindARThree {
  async _startVideo() {
    this.stopped = false;
    this.resizeCount = 0;
    const video = document.createElement("video");
    this.video = video;
    video.muted = video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.controls = false;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.style.cssText = "position:absolute;top:0;left:0;z-index:-2";
    this.container.appendChild(video);
    const stream = await openRearCamera(navigator.mediaDevices);
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      throw new DOMException("Camera stopped", "AbortError");
    }
    const track = stream.getVideoTracks()[0];
    this.cameraLabel = track?.label ?? "unknown";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Camera metadata timeout")), 15000);
      const finish = (error) => {
        clearTimeout(timer);
        video.removeEventListener("loadedmetadata", loaded);
        video.removeEventListener("error", failed);
        this.cancelCameraLoad = null;
        if (error) reject(error); else resolve();
      };
      const loaded = () => {
        video.width = video.videoWidth;
        video.height = video.videoHeight;
        finish();
      };
      const failed = () => finish(new Error("Camera video error"));
      this.cancelCameraLoad = () => finish(new DOMException("Camera stopped", "AbortError"));
      video.addEventListener("loadedmetadata", loaded);
      video.addEventListener("error", failed);
      video.srcObject = stream;
      // Permissioned MediaStreams normally play without the file-video policy restriction.
      video.play().catch(finish);
    });
  }

  resize() {
    if (this.stopped || !this.controller || !this.video?.videoWidth) return;
    const key = `${this.container.clientWidth}/${this.container.clientHeight}/${this.video.videoWidth}/${this.video.videoHeight}`;
    if (key === this.layoutKey || !this.container.clientWidth || !this.container.clientHeight) return;
    this.layoutKey = key;
    super.resize();
    this.resizeCount = (this.resizeCount ?? 0) + 1;
  }

  getDiagnostics() {
    return `${this.cameraLabel ?? "starting"} | ${this.video?.videoWidth ?? 0}x${this.video?.videoHeight ?? 0} | viewport ${this.container.clientWidth}x${this.container.clientHeight} | layout ${this.resizeCount ?? 0}`;
  }

  stop() {
    this.stopped = true;
    this.cancelCameraLoad?.();
    window.removeEventListener("resize", this._boundResize);
    this.controller?.stopProcessVideo();
    this.controller?.worker?.terminate();
    this.video?.srcObject?.getTracks().forEach((track) => track.stop());
    this.video?.remove();
    this.renderer.setAnimationLoop(null);
    this.renderer.dispose();
  }
}
