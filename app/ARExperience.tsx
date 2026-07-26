"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AR_CONFIG } from "./ar-config";

type Screen = "intro" | "camera" | "fallback" | "error";
type TrackingState =
  | "idle"
  | "preparing"
  | "searching"
  | "found"
  | "lost"
  | "error";

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
      return "カメラを使用できませんでした。ブラウザの設定からカメラの使用を許可してください。";
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
  return "カメラの準備中に問題が発生しました。通信環境を確認して、もう一度お試しください。";
}

export function ARExperience() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [tracking, setTracking] = useState<TrackingState>("idle");
  const [message, setMessage] = useState("カード全体を映してください");
  const [errorMessage, setErrorMessage] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundHint, setSoundHint] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [userAgent, setUserAgent] = useState("");

  const arContainerRef = useRef<HTMLDivElement>(null);
  const mindarRef = useRef<MindARInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetVisibleRef = useRef(false);
  const soundEnabledRef = useRef(false);
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
    if (arContainerRef.current) arContainerRef.current.replaceChildren();
  }, [clearLostTimer]);

  useEffect(() => {
    queueMicrotask(() => {
      setDebugEnabled(
        new URLSearchParams(window.location.search).get("debug") === "true",
      );
      setUserAgent(navigator.userAgent);
    });

    const onVisibilityChange = () => {
      if (document.hidden) videoRef.current?.pause();
      else if (targetVisibleRef.current) videoRef.current?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopAR();
    };
  }, [stopAR]);

  const playFromBeginning = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (AR_CONFIG.tracking.restartFromBeginning) video.currentTime = 0;
    video.muted = !soundEnabledRef.current;
    try {
      await video.play();
      setSoundHint(false);
    } catch {
      video.muted = true;
      setSoundHint(soundEnabledRef.current);
      await video.play().catch(() => {});
    }
  }, []);

  const startCamera = async () => {
    setScreen("camera");
    setTracking("preparing");
    setMessage("カメラの使用を許可してください");
    setErrorMessage("");

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setErrorMessage(
        "カメラを利用するには、HTTPSで公開されたページからアクセスしてください。",
      );
      setTracking("error");
      setScreen("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.WebGLRenderingContext) {
      setErrorMessage(
        "このブラウザではARカメラを利用できません。SafariまたはChromeで開いてください。",
      );
      setTracking("error");
      setScreen("error");
      return;
    }

    try {
      // Wait until React has mounted the camera container before MindAR uses it.
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      const container = arContainerRef.current;
      if (!container) throw new Error("カメラ画面を初期化できませんでした");

      const runtime = await loadRuntime();
      const mindar = new runtime.MindARThree({
        container,
        imageTargetSrc: AR_CONFIG.targetFile,
        maxTrack: 1,
        uiLoading: "no",
        uiScanning: "no",
        uiError: "no",
        filterMinCF: 0.001,
        filterBeta: 10,
        warmupTolerance: 5,
        missTolerance: 5,
      });
      mindarRef.current = mindar;

      const video = document.createElement("video");
      video.src = AR_CONFIG.videoFile;
      video.poster = AR_CONFIG.posterFile;
      video.preload = "metadata";
      video.loop = AR_CONFIG.video.loop;
      video.muted = AR_CONFIG.video.muted;
      video.playsInline = AR_CONFIG.video.playsInline;
      video.setAttribute("playsinline", "");
      video.addEventListener("error", () => {
        setErrorMessage(
          "動画を読み込めませんでした。通信環境を確認して、もう一度お試しください。",
        );
      });
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
        setMessage("カードを認識しました");
        playFromBeginning();
      };
      anchor.onTargetLost = () => {
        targetVisibleRef.current = false;
        setTracking("lost");
        setMessage("カードを見失いました");
        clearLostTimer();
        lostTimerRef.current = setTimeout(() => {
          const currentVideo = videoRef.current;
          if (!targetVisibleRef.current && currentVideo) {
            currentVideo.pause();
            currentVideo.currentTime = 0;
            setTracking("searching");
            setMessage("カード全体を映してください");
          }
        }, AR_CONFIG.tracking.lostDelayMs);
      };

      const { renderer, scene, camera } = mindar;
      renderer.setAnimationLoop(() => renderer.render(scene, camera));
      await mindar.start();
      setTracking("searching");
      setMessage("カード全体を映してください");
    } catch (error) {
      console.error("[EMOLI AR]", error);
      stopAR();
      setErrorMessage(cameraErrorMessage(error));
      setTracking("error");
      setScreen("error");
    }
  };

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    const video = videoRef.current;
    if (!video) return;
    video.muted = !next;
    if (next && targetVisibleRef.current) {
      try {
        await video.play();
        setSoundHint(false);
      } catch {
        setSoundHint(true);
      }
    } else {
      setSoundHint(false);
    }
  };

  const returnHome = () => {
    stopAR();
    setTracking("idle");
    setMessage("カード全体を映してください");
    setScreen("intro");
  };

  if (screen === "fallback") {
    return (
      <main className="fallback-screen">
        <button className="text-button back-button" onClick={returnHome}>
          ← トップへ戻る
        </button>
        <section className="fallback-card">
          <p className="eyebrow">MOVIE PREVIEW</p>
          <h1>動画だけを見る</h1>
          <video
            className="fallback-video"
            src={AR_CONFIG.videoFile}
            poster={AR_CONFIG.posterFile}
            controls
            playsInline
          />
          <p className="fallback-note">
            ARを利用できない環境でも、サンプル動画をご覧いただけます。
          </p>
        </section>
      </main>
    );
  }

  if (screen === "error") {
    return (
      <main className="error-screen">
        <section className="error-card" role="alert">
          <span className="error-mark" aria-hidden="true">
            !
          </span>
          <p className="eyebrow">CAMERA ERROR</p>
          <h1>カメラを開けませんでした</h1>
          <p>{errorMessage}</p>
          <button className="primary-button" onClick={startCamera}>
            もう一度試す
          </button>
          <button className="text-button" onClick={returnHome}>
            トップへ戻る
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={screen === "camera" ? "camera-screen" : "intro-screen"}>
      {screen === "intro" && (
        <>
          <header className="intro-header">
            <a className="brand" href="#" aria-label="EMOLI AR MOMENT">
              <span className="brand-mark">E</span>
              <span>
                <strong>EMOLI</strong>
                <small>AR MOMENT</small>
              </span>
            </a>
            <span className="private-badge">端末内で処理</span>
          </header>

          <section className="intro-content">
            <div className="intro-copy">
              <p className="eyebrow">A PHOTO COMES ALIVE</p>
              <h1>
                その一枚が、
                <br />
                <em>動き出す。</em>
              </h1>
              <p className="lead">
                カードにスマートフォンをかざすと、
                <br />
                写真の中の時間が、そっと動き始めます。
              </p>
              <div className="intro-actions">
                <button className="primary-button" onClick={startCamera}>
                  <span aria-hidden="true">◎</span>
                  カメラを起動する
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setScreen("fallback")}
                >
                  動画だけを見る
                </button>
              </div>
              <p className="camera-note">
                カメラはボタンを押した後にのみ起動します
              </p>
            </div>

            <div className="photo-stage" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <figure className="polaroid">
                {/* The native asset path keeps this camera-target preview exact. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={AR_CONFIG.posterFile} alt="" />
                <figcaption>
                  <span>EMOLI</span>
                  <time>2026.07.25</time>
                </figcaption>
              </figure>
              <span className="spark spark-one">✦</span>
              <span className="spark spark-two">✧</span>
            </div>
          </section>

          <footer className="privacy-note">
            <span aria-hidden="true">⌁</span>
            <p>
              カメラ映像は保存・送信されません。
              <br />
              カード認識は、この端末上で行われます。
            </p>
          </footer>
        </>
      )}

      {screen === "camera" && (
        <>
          <div ref={arContainerRef} className="ar-container" />
          <div className="camera-shade" aria-hidden="true" />
          <header className="camera-header">
            <button
              className="camera-control"
              onClick={returnHome}
              aria-label="カメラを閉じてトップへ戻る"
            >
              × <span>閉じる</span>
            </button>
            <span className={`status-pill status-${tracking}`} role="status">
              <i />
              {tracking === "preparing"
                ? "準備中"
                : tracking === "found"
                  ? "認識しました"
                  : "カードを探しています"}
            </span>
            <button
              className="camera-control sound-control"
              onClick={toggleSound}
              aria-label={soundEnabled ? "音声をオフにする" : "音声をオンにする"}
            >
              {soundEnabled ? "◖))" : "◖×"}{" "}
              <span>{soundEnabled ? "音声ON" : "音声OFF"}</span>
            </button>
          </header>

          <div className={`scan-guide guide-${tracking}`}>
            <div className="scan-corner corner-tl" />
            <div className="scan-corner corner-tr" />
            <div className="scan-corner corner-bl" />
            <div className="scan-corner corner-br" />
            <span className="scan-line" />
          </div>

          <section className="camera-instruction" aria-live="polite">
            <strong>{message}</strong>
            <span>
              {tracking === "found"
                ? "そのままカードをゆっくり動かせます"
                : "明るい場所で、写真部分を枠に合わせてください"}
            </span>
          </section>

          {soundHint && (
            <button className="sound-hint" onClick={playFromBeginning}>
              画面をタップすると音声が再生されます
            </button>
          )}

          {debugEnabled && (
            <aside className="debug-panel">
              <strong>DEBUG</strong>
              <span>
                camera: {tracking === "preparing" ? "starting" : "active"}
              </span>
              <span>mindar: {tracking}</span>
              <span>target: {tracking === "found" ? "found" : "none"}</span>
              <span>video: {tracking === "found" ? "playing" : "paused"}</span>
              <span>{userAgent}</span>
            </aside>
          )}
        </>
      )}
    </main>
  );
}
