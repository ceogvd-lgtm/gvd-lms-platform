import { patchIndexHtml } from './webgl-extract.processor';

/**
 * Unit tests for the Unity `index.html` patcher. The patcher must:
 *   1. Strip Unity's `navigator.serviceWorker.register(...)` block.
 *   2. Inject a cleanup script that unregisters stale SWs + purges Cache
 *      Storage on next page load — so learners whose browsers installed
 *      the pre-fix SW recover automatically.
 *   3. Be idempotent (safe to re-run on already-patched HTML).
 */
describe('patchIndexHtml', () => {
  const unityTemplate = `<!DOCTYPE html>
<html>
  <head><title>Unity Web Player</title></head>
  <body>
    <div id="unity-container"></div>
    <script>
      window.addEventListener("load", function () {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.register("ServiceWorker.js");
        }
      });
      var buildUrl = "Build";
      var config = { dataUrl: buildUrl + "/WebGL.data.gz" };
    </script>
  </body>
</html>`;

  it('strips the Unity SW registration block', () => {
    const out = patchIndexHtml(unityTemplate);
    expect(out).not.toMatch(/navigator\.serviceWorker\.register\(/);
    expect(out).toContain('SW registration stripped by LMS extractor');
  });

  it('injects a cleanup script that unregisters stale SWs', () => {
    const out = patchIndexHtml(unityTemplate);
    expect(out).toMatch(/LMS extractor — neutralises Unity PWA ServiceWorker/);
    expect(out).toMatch(/navigator\.serviceWorker\.getRegistrations\(\)/);
    expect(out).toMatch(/caches\.keys\(\)/);
  });

  it('preserves the rest of the Unity config', () => {
    const out = patchIndexHtml(unityTemplate);
    expect(out).toContain('var buildUrl = "Build"');
    expect(out).toContain('WebGL.data.gz');
    expect(out).toContain('<div id="unity-container">');
  });

  it('is idempotent — running twice does not duplicate the cleanup', () => {
    const once = patchIndexHtml(unityTemplate);
    const twice = patchIndexHtml(once);
    const matches = twice.match(/LMS extractor — neutralises/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it('tolerates single quotes in the SW register block', () => {
    const html = unityTemplate.replace(/"serviceWorker"/g, "'serviceWorker'");
    const out = patchIndexHtml(html);
    expect(out).not.toMatch(/navigator\.serviceWorker\.register\(/);
  });

  it('falls back to cleanup injection when SW block is not found', () => {
    const htmlWithoutSw = `<!DOCTYPE html><html><body>\n  <canvas id="unity-canvas"></canvas>\n</body></html>`;
    const out = patchIndexHtml(htmlWithoutSw);
    // No SW block → nothing to strip, but cleanup script still injected.
    expect(out).toMatch(/LMS extractor — neutralises Unity PWA ServiceWorker/);
    expect(out).toMatch(/<canvas id="unity-canvas">/);
  });
});
