import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OneEuroFilter } from "../node_modules/mind-ar/src/libs/one-euro-filter.js";

test("configured responsive filter follows a moving target closer than A", async () => {
  const config = await readFile(new URL("../app/ar-config.ts", import.meta.url), "utf8");
  const beta = Number(config.match(/filterBeta:\s*(\d+)\s*,/)[1]);
  const minCutOff = Number(config.match(/filterMinCF:\s*([\d.]+)\s*,/)[1]);
  const baseline = new OneEuroFilter({ minCutOff, beta: 10 });
  const responsive = new OneEuroFilter({ minCutOff, beta });
  baseline.filter(0, [0]); responsive.filter(0, [0]);
  let baselineError = 0, responsiveError = 0;
  for (let frame = 1; frame <= 60; frame++) {
    const target = frame * 0.02;
    const a = baseline.filter(frame * 33, [target])[0];
    const b = responsive.filter(frame * 33, [target])[0];
    assert.ok(Number.isFinite(b));
    baselineError += Math.abs(target - a);
    responsiveError += Math.abs(target - b);
  }
  assert.ok(responsiveError < baselineError / 2, `A lag=${baselineError}, responsive lag=${responsiveError}`);
});
