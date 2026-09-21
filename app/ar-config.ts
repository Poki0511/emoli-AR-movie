export const AR_CONFIG = {
  targetFile: "/assets/target.mind?v=20260921-2",
  videoFile: "/assets/movie.mp4?v=20260921-2",
  posterFile: "/assets/poster.jpg?v=20260921-2",
  runtimeFile: "/runtime/mindar-runtime.iife.js",
  video: {
    muted: true,
    loop: true,
    playsInline: true,
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
