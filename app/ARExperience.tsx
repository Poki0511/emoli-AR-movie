"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AR_CONFIG } from "./ar-config";
import { ARPlayback } from "./ar-playback.mjs";
import { stableViewport } from "./ar-camera-utils.mjs";

type Screen = "camera" | "error";
type TrackingState = "preparing" | "searching" | "found" | "lost" | "error";

type Disposable = { dispose: () => void };
type VideoMaterial = Disposable & { opacity: number };
type Anchor = {
  group: { add: (object: unknown) => void };
  onTargetFound: (() => void) | null;
  onTargetLost: (() => void) | null;
};
type MindARInstance = {
  renderer: {
    render: (scene: unknown, camera: unknown) => void;
    setAnimationLoop: (callback: (() => void) | null) => void;
    outputColorSpace: unknown;
  };
  scene: unknown;
  camera: unknown;
  addAnchor: (index: number) => Anchor;
  start: () => Promise<void>;
  stop: () => void;
  resize: () => void;
  getDiagnostics: () => string;
};
type ThreeRuntime = {
  VideoTexture: new (video: HTMLVideoElement) => Disposable & {
    colorSpace: unknown;
    needsUpdate: boolean;
    version: number;
  };
  PlaneGeometry: new (width: number, height: number) => Disposable;
  MeshBasicMaterial: new (options: Record<string, unknown>) => VideoMaterial;
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
    script.onerror = () => {
      script.remove();
      reject(new Error("ARライブラリを読み込めませんでした"));
    };
    document.head.append(script);
  });

  runtimePromise.catch(() => { runtimePromise = null; });
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
  const [cameraReady, setCameraReady] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const [playbackState, setPlaybackState] = useState("idle");
  const [diagnostics, setDiagnostics] = useState("");

  const screenRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const arContainerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<MindARInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetVisibleRef = useRef(false);
  const startingRef = useRef(false);
  const generationRef = useRef(0);
  const playbackRef = useRef<ARPlayback | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const videoMaterialRef = useRef<VideoMaterial | null>(null);
  const disposablesRef = useRef<Disposable[]>([]);

  const cancelFade = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }, []);

  const fadeOutVideo = useCallback(() => {
    const material = videoMaterialRef.current;
    if (!material) return;

    cancelFade();
    const startedAt = performance.now();
    const fade = (now: number) => {
      const progress = Math.min(
        (now - startedAt) / AR_CONFIG.video.fadeOutMs,
        1,
      );
      material.opacity = 1 - progress;
      if (progress < 1) {
        fadeFrameRef.current = window.requestAnimationFrame(fade);
      } else {
        fadeFrameRef.current = null;
      }
    };
    fadeFrameRef.current = window.requestAnimationFrame(fade);
  }, [cancelFade]);

  const stopAR = useCallback(() => {
    generationRef.current++;
    playbackRef.current?.dispose();
    playbackRef.current = null;
    cancelFade();
    targetVisibleRef.current = false;

    const video = videoRef.current;
    if (video) {
      video.onended = null;
      video.pause();
      try { video.currentTime = 0; } catch { /* Metadata may not have loaded. */ }
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    videoRef.current = null;
    videoMaterialRef.current = null;

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
  }, [cancelFade]);

  const startCamera = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setCameraReady(false);
    stopAR();
    const generation = generationRef.current;
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
      if (generation !== generationRef.current) return;

      const container = arContainerRef.current;
      if (!container) throw new Error("Camera container unavailable");

      const runtime = await loadRuntime();
      if (generation !== generationRef.current) return;
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
      video.defaultMuted = AR_CONFIG.video.muted;
      video.playsInline = AR_CONFIG.video.playsInline;
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.controls = false;
      video.className = "texture-video";
      // Keep the source mounted separately from the initially hidden camera.
      sourceRef.current?.appendChild(video);
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
        transparent: true,
        opacity: 0,
      });
      videoMaterialRef.current = material;
      const plane = new runtime.THREE.Mesh(geometry, material);
      plane.position.set(
        AR_CONFIG.overlay.positionX,
        AR_CONFIG.overlay.positionY,
        AR_CONFIG.overlay.positionZ,
      );
      disposablesRef.current = [texture, geometry, material];
      const playback = new ARPlayback(video, {
        lostDelayMs: AR_CONFIG.tracking.lostDelayMs,
        onState: (state: string) => {
          setPlaybackState(state);
          if (state === "idle" && !targetVisibleRef.current) setTracking("searching");
        },
        onReset: () => { cancelFade(); material.opacity = 0; },
        onFrame: () => { material.opacity = 1; },
        onEnded: fadeOutVideo,
      });
      playbackRef.current = playback;
      playback.setPageVisible(!document.hidden);

      const anchor = mindar.addAnchor(0);
      anchor.group.add(plane);
      anchor.onTargetFound = () => {
        targetVisibleRef.current = true;
        setTracking("found");
        playback.targetFound();
      };
      anchor.onTargetLost = () => {
        targetVisibleRef.current = false;
        setTracking("lost");
        playback.targetLost();
      };

      const { renderer, scene, camera } = mindar;
      // Keep the decoded video and the WebGL canvas in the same sRGB space.
      // This avoids a darker or more saturated result without post-processing.
      renderer.outputColorSpace = runtime.THREE.SRGBColorSpace;
      await mindar.start();
      if (generation !== generationRef.current) { mindar.stop(); return; }
      let lastTextureTime = -1;
      let lastTextureVersion = texture.version;
      let lastTextureUpdateAt = performance.now();
      renderer.setAnimationLoop(() => {
        // Also update on clock advancement if Safari's frame callback stalls.
        // No canvas readback, extra decoder, color filter, or per-frame React state.
        const now = performance.now();
        if (texture.version !== lastTextureVersion) {
          lastTextureVersion = texture.version;
          lastTextureTime = video.currentTime;
          lastTextureUpdateAt = now;
        } else if (video.readyState >= 2 && video.currentTime !== lastTextureTime && now - lastTextureUpdateAt > 100) {
          // The normal frame callback already updates the texture. Only fall
          // back when it stops for >100ms, avoiding duplicate GPU uploads.
          texture.needsUpdate = true;
          lastTextureVersion = texture.version;
          lastTextureTime = video.currentTime;
          lastTextureUpdateAt = now;
        }
        renderer.render(scene, camera);
      });
      // Keep Safari's temporary native play overlay and its first incorrectly
      // sized camera frame hidden until MindAR has finalized the viewport.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => resolve()),
        );
      });
      if (generation !== generationRef.current) return;
      setCameraReady(true);
      setTracking(targetVisibleRef.current ? "found" : "searching");
    } catch (error) {
      if (generation !== generationRef.current) return;
      console.error("[EMOLI AR]", error);
      stopAR();
      setErrorMessage(cameraErrorMessage(error));
      setTracking("error");
      setScreen("error");
    } finally {
      startingRef.current = false;
    }
  }, [cancelFade, fadeOutVideo, stopAR]);

  useEffect(() => {
    const onVisibilityChange = () => {
      playbackRef.current?.setPageVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    let viewport: {width: number; height: number; orientation: string} | null = null;
    const lockViewport = () => {
      const screen = screenRef.current;
      if (!screen) return;
      const next = stableViewport(viewport, {
        width: document.documentElement.clientWidth,
        height: viewport ? window.innerHeight : screen.clientHeight,
        orientation: window.screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? "landscape" : "portrait"),
      });
      if (next === viewport) return;
      viewport = next;
      screen.style.width = `${next.width}px`;
      screen.style.height = `${next.height}px`;
      mindarRef.current?.resize();
    };
    lockViewport();
    window.addEventListener("resize", lockViewport);

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
      window.removeEventListener("resize", lockViewport);
      stopAR();
    };
  }, [startCamera, stopAR]);

  useEffect(() => {
    if (!debugEnabled) return;
    const timer = window.setInterval(() => {
      const snapshot = playbackRef.current?.snapshot();
      setDiagnostics(`${snapshot ? JSON.stringify(snapshot) : "preparing"}\n${mindarRef.current?.getDiagnostics() ?? ""}`);
    }, 500);
    return () => window.clearInterval(timer);
  }, [debugEnabled]);

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
    <main ref={screenRef} className="camera-screen">
      <div ref={sourceRef} className="video-source" aria-hidden="true" />
      <div
        ref={arContainerRef}
        className={`ar-container${cameraReady ? " is-ready" : ""}`}
      />

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

      {tracking === "found" && (playbackState === "blocked" || playbackState === "error") && (
        <section className="playback-notice" role="status">
          <p>{playbackState === "blocked"
            ? "端末が自動再生を制限しています。低電力モードをOFFにして再読み込みするか、下のボタンを一度押してください。"
            : "動画を読み込めませんでした。通信を確認して再試行してください。"}</p>
          <button className="retry-button" onClick={() => playbackRef.current?.retryFromGesture()}>
            {playbackState === "blocked" ? "動画を再生する" : "動画を再読み込み"}
          </button>
        </section>
      )}

      <section className="camera-instruction" aria-live="polite">
        <strong>
          {tracking === "preparing"
            ? "カメラの使用を許可してください"
            : tracking === "found"
              ? playbackState === "loading" || playbackState === "buffering"
                ? "動画を読み込み中"
                : playbackState === "ended" ? "もう一度見るにはカードを画面外へ" : "カードを認識しました"
              : "写真全体を画面に入れてください"}
        </strong>
        {tracking !== "found" && tracking !== "preparing" && (
          <span>反射を避け、ピントが合う距離で映してください</span>
        )}
      </section>

      {debugEnabled && (
        <aside className="debug-panel">
          <strong>DEBUG {AR_CONFIG.build}</strong>
          <span>mindar: {tracking}</span>
          <span>target: {tracking === "found" ? "found" : "none"}</span>
          <span>video: {playbackState}</span>
          <pre>{diagnostics}</pre>
          <span>{userAgent}</span>
        </aside>
      )}
    </main>
  );
}
