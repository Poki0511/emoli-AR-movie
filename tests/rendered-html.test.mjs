import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const output = (path) => new URL(`../out/${path}`, import.meta.url);

test("exports the AR start guide as the static root page", async () => {
  const html = await readFile(output("index.html"), "utf8");

  assert.match(html, /<title>EMOLI AR MOMENT/);
  assert.match(html, /その一枚が、/);
  assert.match(html, /動き出す。/);
  assert.match(html, /カメラを起動する/);
  assert.match(html, /カメラ映像は保存・送信されません/);
  assert.match(html, /https:\/\/emoli-ar-moment\.pages\.dev\/og\.png/);
  assert.doesNotMatch(html, /cyberagent\.chatgpt\.site|codex-preview/);
});

test("ships all AR assets and Cloudflare Pages control files", async () => {
  const [config, component, packageJson, headers, redirects, target, mind, movie, runtime] =
    await Promise.all([
      readFile(new URL("../app/ar-config.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/ARExperience.tsx", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(output("_headers"), "utf8"),
      readFile(output("_redirects"), "utf8"),
      stat(output("assets/target.jpg")),
      stat(output("assets/target.mind")),
      stat(output("assets/movie.mp4")),
      stat(output("runtime/mindar-runtime.iife.js")),
    ]);

  assert.match(config, /targetFile:\s*"\/assets\/target\.mind"/);
  assert.match(config, /videoFile:\s*"\/assets\/movie\.mp4"/);
  assert.match(config, /lostDelayMs:\s*400/);
  assert.match(component, /window\.isSecureContext/);
  assert.match(component, /カメラの使用を許可してください/);
  assert.match(component, /await mindar\.start\(\)/);
  assert.match(packageJson, /"build:pages":\s*"next build"/);
  assert.match(headers, /Permissions-Policy:\s*camera=\(self\)/);
  assert.match(redirects, /\/\*\s+\/index\.html\s+200/);
  assert.ok(target.size > 0);
  assert.ok(mind.size > 0);
  assert.ok(movie.size > 0);
  assert.ok(runtime.size > 0);
});
