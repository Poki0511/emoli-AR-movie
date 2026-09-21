/** Media playback is independent of tracking confidence and React rendering. */
export class ARPlayback {
  /**
   * @param {HTMLVideoElement} video
   * @param {{lostDelayMs?: number, onState?: (state: string) => void,
   * onReset?: () => void, onFrame?: () => void, onEnded?: () => void,
   * clock?: {now: () => number, setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout}}} options
   */
  constructor(video, options = {}) {
    this.video = video;
    this.options = options;
    this.clock = options.clock ?? {
      now: () => performance.now(),
      // Browser timers require Window as their receiver, not this clock object.
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (timer) => clearTimeout(timer),
    };
    this.state = "idle";
    this.lastError = "";
    this.targetPresent = false;
    this.active = false;
    this.completed = false;
    this.suspended = false;
    this.disposed = false;
    this.hasFrame = false;
    this.epoch = 0;
    this.pending = 0;
    this.attempts = 0;
    this.lastTime = video.currentTime;
    this.progressAt = this.clock.now();
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.lostTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.retryTimer = undefined;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.watchTimer = undefined;
    this.events = {
      timeupdate: () => this.checkProgress(),
      ended: () => {
        if (!this.active || this.disposed || this.completed) return;
        this.completed = true;
        this.cancelAttempt();
        this.setState("ended");
        this.options.onEnded?.();
      },
      error: () => {
        if (!this.active || this.disposed) return;
        this.fail(`MediaError:${video.error?.code ?? "unknown"}`);
      },
    };
    for (const [name, listener] of Object.entries(this.events)) {
      video.addEventListener(name, listener);
    }
  }

  /** @param {string} state */
  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.options.onState?.(state);
  }

  cancelAttempt() {
    this.epoch++;
    this.pending = 0;
    this.clock.clearTimeout(this.retryTimer);
    this.clock.clearTimeout(this.watchTimer);
    this.retryTimer = this.watchTimer = undefined;
  }

  targetFound() {
    if (this.disposed || this.targetPresent) return;
    this.targetPresent = true;
    this.clock.clearTimeout(this.lostTimer);
    this.lostTimer = undefined;
    if (!this.active) {
      this.active = true;
      this.completed = false;
      this.hasFrame = false;
      this.attempts = 0;
      this.lastError = "";
      try { this.video.currentTime = 0; } catch { /* Metadata can arrive later. */ }
      this.lastTime = this.video.currentTime;
      this.options.onReset?.();
      this.requestPlay();
    }
    // A brief tracking dropout does not seek, pause, or start a second play().
  }

  targetLost() {
    if (this.disposed || !this.targetPresent) return;
    this.targetPresent = false;
    this.lostTimer = this.clock.setTimeout(() => {
      this.lostTimer = undefined;
      if (this.targetPresent || this.disposed) return;
      this.cancelAttempt();
      this.active = false;
      this.completed = false;
      this.hasFrame = false;
      this.video.pause();
      try { this.video.currentTime = 0; } catch { /* Not loaded yet. */ }
      this.options.onReset?.();
      this.setState("idle");
    }, this.options.lostDelayMs ?? 250);
  }

  /** Call directly from a click handler: no await before HTMLMediaElement.play. */
  retryFromGesture() {
    if (this.disposed || !this.targetPresent || this.completed) return;
    this.cancelAttempt();
    this.attempts = 0;
    this.lastError = "";
    // A media/network error needs load(), a policy rejection does not.
    if (this.video.error || this.state === "error") this.video.load();
    this.requestPlay();
  }

  requestPlay() {
    if (this.disposed || !this.active || this.suspended || this.completed || this.pending) return;
    const epoch = ++this.epoch;
    this.pending = epoch;
    this.attempts++;
    this.progressAt = this.clock.now();
    this.lastTime = this.video.currentTime;
    this.setState("loading");
    this.watch();
    // Never wait for readyState/canplay here: Safari may need play() to load data.
    try {
      const result = this.video.play();
      Promise.resolve(result).then(() => {
        if (this.disposed || epoch !== this.epoch) return;
        this.pending = 0;
        // A resolved promise is NOT evidence that the video clock is advancing.
        this.checkProgress();
      }, (error) => this.playRejected(error, epoch));
    } catch (error) {
      this.playRejected(error, epoch);
    }
  }

  /** @param {unknown} error @param {number} epoch */
  playRejected(error, epoch) {
    if (this.disposed || epoch !== this.epoch) return;
    this.pending = 0;
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "PlaybackError";
    this.lastError = name;
    if (name === "NotAllowedError") {
      this.cancelAttempt();
      this.setState("blocked");
    } else if (name === "AbortError" && this.attempts < 3 && this.active && !this.suspended) {
      this.retryTimer = this.clock.setTimeout(() => this.requestPlay(), 300);
    } else {
      this.fail(name);
    }
  }

  /** @param {string} reason */
  fail(reason) {
    this.lastError = reason;
    this.cancelAttempt();
    this.video.pause();
    this.setState("error");
  }

  checkProgress() {
    if (this.disposed || !this.active || this.completed || this.suspended ||
        this.state === "blocked" || this.state === "error") return;
    const time = this.video.currentTime;
    if (!this.video.paused && this.video.readyState >= 2 && time > this.lastTime + 0.001) {
      this.progressAt = this.clock.now();
      this.lastTime = time;
      if (!this.hasFrame) {
        this.hasFrame = true;
        this.options.onFrame?.();
      }
      this.setState("playing");
    }
  }

  watch() {
    this.clock.clearTimeout(this.watchTimer);
    this.watchTimer = this.clock.setTimeout(() => {
      if (this.disposed || !this.active || this.completed || this.suspended ||
          this.state === "blocked" || this.state === "error") return;
      this.checkProgress();
      const stalledFor = this.clock.now() - this.progressAt;
      if (stalledFor >= 12000) {
        this.fail("PlaybackTimeout");
        return;
      }
      if (stalledFor > 1000 && this.state === "playing") this.setState("buffering");
      this.watch();
    }, 250);
  }

  /** @param {boolean} visible */
  setPageVisible(visible) {
    this.suspended = !visible;
    if (!visible) {
      this.cancelAttempt();
      this.video.pause();
      if (this.active && !this.completed && this.state !== "blocked" && this.state !== "error") this.setState("paused");
    } else if (this.active && !this.completed && this.state !== "blocked" && this.state !== "error") {
      this.requestPlay();
    }
  }

  snapshot() {
    return {
      state: this.state, currentTime: this.video.currentTime,
      readyState: this.video.readyState, networkState: this.video.networkState,
      paused: this.video.paused, hasFrame: this.hasFrame, lastError: this.lastError,
      attempts: this.attempts,
    };
  }

  dispose() {
    this.disposed = true;
    this.cancelAttempt();
    this.clock.clearTimeout(this.lostTimer);
    for (const [name, listener] of Object.entries(this.events)) this.video.removeEventListener(name, listener);
    this.video.pause();
  }
}
