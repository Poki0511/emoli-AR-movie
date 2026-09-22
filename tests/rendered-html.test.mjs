import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const output = (path) => new URL(`../out/${path}`, import.meta.url);

test("exports the camera-first AR screen as the static root page", async () => {
  const html = await readFile(output("index.html"), "utf8");

  assert.match(html, /<title>EMOLI AR/);
  assert.match(html, /カメラを起動中/);
  assert.match(html, /カメラの使用を許可してください/);
  assert.doesNotMatch(html, /A PHOTO COMES ALIVE/);
  assert.doesNotMatch(html, /カメラを起動する/);
  assert.doesNotMatch(html, /scan-guide/);
  assert.doesNotMatch(html, /og:image|twitter:card|og\.png/);
  assert.match(html, /noindex/);
});

test("ships all AR assets and Cloudflare Pages control files", async () => {
  const [config, packageJson, headers, redirects, target, mind, movie, runtime] =
    await Promise.all([
      readFile(new URL("../app/ar-config.ts", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(output("_headers"), "utf8"),
      readFile(output("_redirects"), "utf8"),
      stat(output("assets/target.jpg")),
      stat(output("assets/target.mind")),
      stat(output("assets/movie.mp4")),
      stat(output("runtime/mindar-runtime.iife.js")),
    ]);

  assert.match(config, /targetFile:\s*"\/assets\/target\.mind\?v=[^"]+"/);
  assert.match(config, /videoFile:\s*"\/assets\/movie\.mp4\?v=[^"]+"/);
  assert.match(config, /muted:\s*true/);
  assert.match(config, /loop:\s*false/);
  assert.match(config, /fadeOutMs:\s*1000/);
  assert.match(config, /filterBeta:\s*100\s*,/);
  assert.match(config, /missTolerance:\s*12/);
  assert.match(config, /lostDelayMs:\s*250/);
  // Media behavior is covered by executable state-machine tests, not source regexes.
  assert.match(config, /runtimeFile:\s*"\/runtime\/mindar-runtime\.iife\.js\?v=[^"]+"/);
  assert.match(packageJson, /"build:pages":\s*"next build"/);
  assert.match(headers, /Permissions-Policy:\s*camera=\(self\)/);
  assert.match(headers, /Cache-Control:\s*public, max-age=0, must-revalidate/);
  assert.match(redirects, /\/\*\s+\/index\.html\s+200/);
  assert.ok(target.size > 0);
  assert.ok(mind.size > 0);
  assert.ok(movie.size > 0);
  assert.ok(runtime.size > 0);
});
