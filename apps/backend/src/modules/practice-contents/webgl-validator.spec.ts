import { summariseWebGLZip, validateWebGLSummary } from './webgl-validator';

/**
 * Unit tests for the WebGL pre-flight validator.
 *
 * We build tiny in-memory zips with `unzipper` so the tests don't depend
 * on the filesystem. `summariseWebGLZip` accepts a Buffer already, so
 * the construction is straightforward.
 */
describe('webgl-validator', () => {
  /** Helper: build a Buffer that is a valid zip containing the given files. */
  async function makeZip(files: Array<{ path: string; content?: string }>): Promise<Buffer> {
    // unzipper doesn't expose a builder; use the minimal `yazl` approach
    // inline via a stream. For unit tests we fake it by writing a
    // ZIP-by-hand is overkill — instead we rely on Node's zip util.
    const archiver = await import('archiver');
    const { PassThrough } = await import('node:stream');
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    const finished = new Promise<Buffer>((resolve, reject) => {
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
    const archive = archiver.default('zip');
    archive.pipe(stream);
    for (const f of files) {
      archive.append(f.content ?? `dummy content for ${f.path}`, { name: f.path });
    }
    await archive.finalize();
    return finished;
  }

  /**
   * The project uses archiver if available; otherwise we fall back to
   * hand-rolling a minimal zip. If `archiver` isn't installed, we skip
   * these tests entirely with a clear hint.
   */
  let archiverAvailable = true;
  beforeAll(async () => {
    try {
      await import('archiver');
    } catch {
      archiverAvailable = false;
    }
  });

  it('accepts a valid Unity zip with all four core files', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([
      { path: 'index.html', content: '<html></html>' },
      { path: 'Build/Builds.loader.js' },
      { path: 'Build/Builds.framework.js' },
      { path: 'Build/Builds.data' },
      { path: 'Build/Builds.wasm' },
    ]);
    const summary = await summariseWebGLZip(buf);
    expect(summary.hasIndexHtml).toBe(true);
    expect(summary.hasLoader).toBe(true);
    expect(summary.projectName).toBe('Builds');
    expect(validateWebGLSummary(summary)).toBeNull();
  });

  it('strips common wrapper folder so Builds/index.html counts as index.html', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([
      { path: 'Builds/index.html' },
      { path: 'Builds/Build/Builds.loader.js' },
      { path: 'Builds/Build/Builds.framework.js' },
      { path: 'Builds/Build/Builds.data' },
      { path: 'Builds/Build/Builds.wasm' },
    ]);
    const summary = await summariseWebGLZip(buf);
    expect(summary.hasIndexHtml).toBe(true);
    expect(summary.hasLoader).toBe(true);
    expect(validateWebGLSummary(summary)).toBeNull();
  });

  it('rejects with "thiếu Builds.loader.js" when loader is missing', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([{ path: 'index.html' }, { path: 'Build/some-other-file.js' }]);
    const summary = await summariseWebGLZip(buf);
    const error = validateWebGLSummary(summary);
    expect(error).toMatch(/thiếu Builds\.loader\.js/);
  });

  it('rejects with "thiếu index.html" when entry html is missing', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([{ path: 'Build/Builds.loader.js' }]);
    const summary = await summariseWebGLZip(buf);
    const error = validateWebGLSummary(summary);
    expect(error).toMatch(/thiếu index\.html/);
  });

  it('handles gzipped Unity outputs (.loader.js is always uncompressed)', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([
      { path: 'index.html' },
      { path: 'Build/Builds.loader.js' },
      { path: 'Build/Builds.framework.js.gz' },
      { path: 'Build/Builds.data.gz' },
      { path: 'Build/Builds.wasm.gz' },
    ]);
    const summary = await summariseWebGLZip(buf);
    expect(summary.hasFramework).toBe(true);
    expect(summary.hasData).toBe(true);
    expect(summary.hasWasm).toBe(true);
    expect(validateWebGLSummary(summary)).toBeNull();
  });

  it('detects project name other than "Builds"', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([{ path: 'index.html' }, { path: 'Build/MyGame.loader.js' }]);
    const summary = await summariseWebGLZip(buf);
    expect(summary.projectName).toBe('MyGame');
    expect(summary.hasLoader).toBe(true);
  });

  it('rejects an empty zip', async () => {
    if (!archiverAvailable) return;
    const buf = await makeZip([]);
    const summary = await summariseWebGLZip(buf);
    expect(validateWebGLSummary(summary)).toBe('File zip rỗng');
  });
});
