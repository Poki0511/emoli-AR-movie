export const AR_CONFIG = {
  targetFile: "/assets/target.mind?v=20260922-2",
  videoFile: "/assets/movie.mp4?v=20260922-2",
  posterFile: "/assets/poster.jpg?v=20260922-2",
  runtimeFile: "/runtime/mindar-runtime.iife.js",
  video: {
    // Muted playback is required for automatic playback on iPhone Safari and
    // Android Chrome. Sounded playback always requires a user gesture.
    muted: true,
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
    // Stability-first adaptive tracking. This remains 100 times more
    // responsive than the old 0.01 value, but rejects brief pose spikes.
    filterMinCF: 0.001,
    filterBeta: 1,
    warmupTolerance: 5,
    missTolerance: 12,
    lostDelayMs: 250,
    restartFromBeginning: true,
  },
} as const;
