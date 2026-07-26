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
    positionZ: 0.01,
  },
  tracking: {
    // Lower beta smooths pose jitter. A longer miss tolerance prevents brief
    // glare or motion blur from immediately dropping the target.
    filterMinCF: 0.0005,
    filterBeta: 0.01,
    warmupTolerance: 7,
    missTolerance: 12,
    lostDelayMs: 250,
    restartFromBeginning: true,
  },
} as const;
