export const AR_CONFIG = {
  targetFile: "/assets/target.mind",
  videoFile: "/assets/movie.mp4",
  posterFile: "/assets/poster.jpg",
  runtimeFile: "/runtime/mindar-runtime.iife.js",
  video: {
    muted: true,
    loop: true,
    playsInline: true,
  },
  overlay: {
    width: 1,
    height: 0.5625,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
  },
  tracking: {
    lostDelayMs: 400,
    restartFromBeginning: true,
  },
} as const;
