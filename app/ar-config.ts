export const AR_CONFIG = {
  targetFile: "/assets/target.mind?v=20260921-3",
  videoFile: "/assets/movie.mp4?v=20260921-3",
  posterFile: "/assets/poster.jpg?v=20260921-3",
  runtimeFile: "/runtime/mindar-runtime.iife.js",
  video: {
    muted: false,
    loop: false,
    playsInline: true,
    fadeOutMs: 1000,
  },
  overlay: {
    width: 1,
    // The new card and movie are both portrait (roughly 1080 x 1456), so the
    // video plane follows that aspect ratio instead of the previous 16:9 one.
    height: 1.3481,
    positionX: 0,
    positionY: 0,
    positionZ: 0.01,
  },
  tracking: {
    // A responsive One Euro filter keeps the movie attached to a moving card
    // without the heavy delay caused by the previous ultra-low beta value.
    filterMinCF: 0.001,
    filterBeta: 100,
    warmupTolerance: 5,
    missTolerance: 12,
    lostDelayMs: 250,
    restartFromBeginning: true,
  },
} as const;
