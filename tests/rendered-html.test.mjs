import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("https://emoli.example/", {
      headers: { accept: "text/html", host: "emoli.example" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the EMOLI start screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>EMOLI AR MOMENT/);
  assert.match(html, /その一枚が、/);
  assert.match(html, /動き出す。/);
  assert.match(html, /カメラを起動する/);
  assert.match(html, /カメラ映像は保存・送信されません/);
  assert.match(html, /https:\/\/emoli\.example\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the configured AR assets", async () => {
  const [config, packageJson, target, mind, movie, runtime] = await Promise.all([
    readFile(new URL("../app/ar-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/assets/target.jpg", import.meta.url)),
    stat(new URL("../public/assets/target.mind", import.meta.url)),
    stat(new URL("../public/assets/movie.mp4", import.meta.url)),
    stat(
      new URL(
        "../public/runtime/mindar-runtime.iife.js",
        import.meta.url,
      ),
    ),
  ]);

  assert.match(config, /targetFile:\s*"\/assets\/target\.mind"/);
  assert.match(config, /videoFile:\s*"\/assets\/movie\.mp4"/);
  assert.match(config, /lostDelayMs:\s*400/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.ok(target.size > 0);
  assert.ok(mind.size > 0);
  assert.ok(movie.size > 0);
  assert.ok(runtime.size > 0);
});
