"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AR_CONFIG } from "./ar-config";

type Screen = "camera" | "error";
type TrackingState = "preparing" | "searching" | "found" | "lost" | "error";

type Disposable = { dispose: () => void };
type Anchor = {
  group: { add: (object: unknown) => void };
  onTargetFound: (() => void) | null;
  onTargetLost: (() => void) | null;
};
type MindARInstance = {
  renderer: {
    render: (scene: unknown, camera: unknown) => void;
    setAnimationLoop: (callback: (() => void) | null) => void;
  };
  scene: unknown;
  camera: unknown;
  addAnchor: (index: number) => Anchor;
  start: () => Promise<void>;
  stop: () => void;
};
type ThreeRuntime = {
  VideoTexture: new (video: HTMLVideoElement) => Disposable & {
    colorSpace: unknown;
  };
  PlaneGeometry: new (width: number, height: number) => Disposable;
  MeshBasicMaterial: new (options: Record<string, unknown>) => Disposable;
  Mesh: new (
    geometry: Disposable,
    material: Disposable,
  ) => { position: { set: (x: number, y: number, z: number) => void } };
  DoubleSide: unknown;
  SRGBColorSpace: unknown;
};
type RuntimeBundle = {
  MindARThree: new (options: Record<string, unknown>) => MindARInstance;
  THREE: ThreeRuntime;
};

declare global {
  interface Window {
    MindARRuntime?: RuntimeBundle;
  }
}

let runtimePromise: Promise<RuntimeBundle> | null = null;

function loadRuntime() {
  if (window.MindARRuntime) return Promise.resolve(window.MindARRuntime);
  if (runtimePromise) return runtimePromise;

  runtimePromise = new Promise<RuntimeBundle>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = AR_CONFIG.runtimeFile;
    script.async = true;
    script.onload = () => {
      if (window.MindARRuntime) resolve(window.MindARRuntime);
      else reject(new Error("ARライブラリを初期化できませんでした"));
    };
    script.onerror = () =>
      reject(new Error("ARライブラリを読み込めませんでした"));
    document.head.append(script);
  });

  return runtimePromise;
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "カメラが許可されていません。SafariまたはChromeのサイト設定から、カメラを許可してください。";
    }
    if (error.name === "NotFoundError") {
      return "利用できるカメラが見つかりませんでした。別の端末でお試しください。";
    }
    if (error.name === "NotReadableError") {
      return "ほかのアプリがカメラを使用しています。アプリを閉じて、もう一度お試しください。";
    }
    if (error.name === "SecurityError") {
      return "安全な接続でカメラを開けませんでした。HTTPSのURLからアクセスしてください。";
    }
  }
  return "カメラを開けませんでした。カメラを許可してから、もう一度お試しください。";
}

export function ARExperience() {
  const [screen, setScreen] = useState<Screen>("camera");
  const [tracking, setTracking] = useState<TrackingState>("preparing");
  const [errorMessage, setErrorMessage] = useState("");
  const [soundHint, setSoundHint] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [userAgent, setUserAgent] = useState("");

  const arContainerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<MindARInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetVisibleRef = useRef(false);
  const startingRef = useRef(false);
  const lostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposablesRef = useRef<Disposable[]>([]);

  const clearLostTimer = useCallback(() => {
    if (lostTimerRef.current) {
      clearTimeout(lostTimerRef.current);
      lostTimerRef.current = null;
    }
  }, []);

  const stopAR = useCallback(() => {
    clearLostTimer();
    targetVisibleRef.current = false;

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.removeAttribute("src");
      video.load();
    }
    videoRef.current = null;

    const mindar = mindarRef.current;
    if (mindar) {
      try {
        mindar.renderer.setAnimationLoop(null);
        mindar.stop();
      } catch {
        // A partially initialized camera can safely be discarded.
      }
    }
    mindarRef.current = null;

    disposablesRef.current.forEach((item) => item.dispose());
    disposablesRef.current = [];
    arContainerRef.current?.replaceChildren();
  }, [clearLostTimer]);

  const playFromBeginning = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (AR_CONFIG.tracking.restartFromBeginning) video.currentTime = 0;
    video.muted = AR_CONFIG.video.muted;
    try {
      await video.play();
      setSoundHint(false);
    } catch {
      // Mobile browsers normally require one page tap before playing audio.
      // Keep sound enabled and ask for that gesture instead of silently muting.
      setSoundHint(true);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    stopAR();
    setScreen("camera");
    setTracking("preparing");
    setErrorMessage("");

    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        throw new DOMException("HTTPS required", "SecurityError");
      }
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !window.WebGLRenderingContext
      ) {
        throw new Error("Camera or WebGL unavailable");
      }

      // The error screen does not mount the camera element, so retry waits for
      // the next painted frame before initializing MindAR.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        );
      });

      const container = arContainerRef.current;
      if (!container) throw new Error("Camera container unavailable");

      const runtime = await loadRuntime();
      const mindar = new runtime.MindARThree({
        container,
        imageTargetSrc: AR_CONFIG.targetFile,
        maxTrack: 1,
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
        filterMinCF: AR_CONFIG.tracking.filterMinCF,
        filterBeta: AR_CONFIG.tracking.filterBeta,
        warmupTolerance: AR_CONFIG.tracking.warmupTolerance,
        missTolerance: AR_CONFIG.tracking.missTolerance,
      });
      mindarRef.current = mindar;

      const video = document.createElement("video");
      video.src = AR_CONFIG.videoFile;
      video.poster = AR_CONFIG.posterFile;
      video.preload = "auto";
      video.loop = AR_CONFIG.video.loop;
      video.muted = AR_CONFIG.video.muted;
      video.playsInline = AR_CONFIG.video.playsInline;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.controls = false;
      video.load();
      videoRef.current = video;

      const texture = new runtime.THREE.VideoTexture(video);
      texture.colorSpace = runtime.THREE.SRGBColorSpace;
      const geometry = new runtime.THREE.PlaneGeometry(
        AR_CONFIG.overlay.width,
        AR_CONFIG.overlay.height,
      );
      const material = new runtime.THREE.MeshBasicMaterial({
        map: texture,
        side: runtime.THREE.DoubleSide,
        toneMapped: false,
      });
      const plane = new runtime.THREE.Mesh(geometry, material);
      plane.position.set(
        AR_CONFIG.overlay.positionX,
        AR_CONFIG.overlay.positionY,
        AR_CONFIG.overlay.positionZ,
      );
      disposablesRef.current = [texture, geometry, material];

      const anchor = mindar.addAnchor(0);
      anchor.group.add(plane);
      anchor.onTargetFound = () => {
        clearLostTimer();
        targetVisibleRef.current = true;
        setTracking("found");
        void playFromBeginning();
      };
      anchor.onTargetLost = () => {
        targetVisibleRef.current = false;
        setTracking("lost");
        clearLostTimer();
        lostTimerRef.current = setTimeout(() => {
          const currentVideo = videoRef.current;
          if (!targetVisibleRef.current && currentVideo) {
            currentVideo.pause();
            currentVideo.currentTime = 0;
            setSoundHint(false);
            setTracking("searching");
          }
        }, AR_CONFIG.tracking.lostDelayMs);
      };

      const { renderer, scene, camera } = mindar;
      renderer.setAnimationLoop(() => renderer.render(scene, camera));
      await mindar.start();
      setTracking("searching");
    } catch (error) {
      console.error("[EMOLI AR]", error);
      stopAR();
      setErrorMessage(cameraErrorMessage(error));
      setTracking("error");
      setScreen("error");
    } finally {
      startingRef.current = false;
    }
  }, [clearLostTimer, playFromBeginning, stopAR]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) videoRef.current?.pause();
      else if (targetVisibleRef.current) videoRef.current?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // A zero-delay task survives React Strict Mode's mount check and starts the
    // permission request immediately after the QR destination renders.
    const startTimer = window.setTimeout(() => {
      setDebugEnabled(
        new URLSearchParams(window.location.search).get("debug") === "true",
      );
      setUserAgent(navigator.userAgent);
      void startCamera();
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopAR();
    };
  }, [startCamera, stopAR]);

  if (screen === "error") {
    return (
      <main className="error-screen">
        <section className="error-card" role="alert">
          <span className="error-mark" aria-hidden="true">
            !
          </span>
          <h1>カメラを開けませんでした</h1>
          <p>{errorMessage}</p>
          <button className="retry-button" onClick={startCamera}>
            もう一度試す
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="camera-screen">
      <div ref={arContainerRef} className="ar-container" />

      <header className="camera-header">
        <span className={`status-pill status-${tracking}`} role="status">
          <i />
          {tracking === "preparing"
            ? "カメラを起動中"
            : tracking === "found"
              ? "認識中"
              : tracking === "lost"
                ? "見失いました"
                : "チェキを映してください"}
        </span>
      </header>

      <section className="camera-instruction" aria-live="polite">
        <strong>
          {tracking === "preparing"
            ? "カメラの使用を許可してください"
            : tracking === "found"
              ? "カードを認識しました"
              : "写真全体を画面に入れてください"}
        </strong>
        {tracking !== "found" && tracking !== "preparing" && (
          <span>反射を避け、ピントが合う距離で映してください</span>
        )}
      </section>

      {soundHint && (
        <button className="sound-hint" onClick={playFromBeginning}>
          タップして再生
        </button>
      )}

      {debugEnabled && (
        <aside className="debug-panel">
          <strong>DEBUG</strong>
          <span>mindar: {tracking}</span>
          <span>target: {tracking === "found" ? "found" : "none"}</span>
          <span>video: {tracking === "found" ? "playing" : "paused"}</span>
          <span>{userAgent}</span>
        </aside>
      )}
    </main>
  );
}
