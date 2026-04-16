import { parseStringPromise } from 'xml2js';

export type ScormVersion = '1.2' | '2004';

export interface ScormManifest {
  version: ScormVersion;
  /** Path inside the package to the entry HTML (e.g. "index.html"). */
  entryPoint: string;
  /** Best-effort human title from `<title>` or `<organization>`. */
  title: string;
  /** Full list of identifiers from `<item>` elements — handy for TOC. */
  items: Array<{ identifier: string; title: string; resourceId: string | null }>;
}

/**
 * Parse an `imsmanifest.xml` payload (UTF-8 string) and extract the
 * fields the frontend bridge needs to launch the SCO:
 *
 *   - version — detected by inspecting the schema/version attributes
 *     on the root `<manifest>` element.
 *   - entryPoint — the `href` attribute of the first `<resource>` whose
 *     `adlcp:scormtype` is `sco` (falls back to first resource).
 *   - title — first `<organization>/<title>` or manifest-level `<title>`.
 *
 * Unknown or malformed manifests throw so the caller can surface a 400
 * at upload time instead of storing a package that will break at runtime.
 */
export async function parseImsManifest(xml: string): Promise<ScormManifest> {
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: true,
    explicitCharkey: false,
  });
  const manifest = parsed?.manifest;
  if (!manifest) {
    throw new Error('imsmanifest.xml thiếu thẻ <manifest> gốc');
  }

  const version = detectVersion(manifest);

  // Resources live under manifest.resources.resource. xml2js collapses
  // single-element arrays so we normalise.
  const resourcesNode = manifest.resources?.resource;
  const resources = toArray<{
    identifier?: string;
    href?: string;
    'adlcp:scormtype'?: string;
    scormType?: string;
    type?: string;
  }>(resourcesNode);

  if (resources.length === 0) {
    throw new Error('imsmanifest.xml không có <resource> nào');
  }

  const sco =
    resources.find(
      (r) =>
        (r['adlcp:scormtype'] ?? r.scormType ?? '').toLowerCase() === 'sco' &&
        typeof r.href === 'string' &&
        r.href.length > 0,
    ) ?? resources.find((r) => !!r.href);

  if (!sco?.href) {
    throw new Error('Không tìm thấy entry point (resource có thuộc tính href)');
  }

  // Title: organizations.organization.title → falls back to manifest.metadata.
  const orgsNode = manifest.organizations?.organization;
  const org = toArray<{ title?: string; item?: unknown }>(orgsNode)[0];
  const title =
    (typeof org?.title === 'string' ? org.title : undefined) ??
    (typeof manifest.metadata?.title === 'string' ? manifest.metadata.title : undefined) ??
    'SCORM package';

  // Items (flat list, first level only — enough for progress lookup).
  const items = toArray(org?.item as unknown).map((rawIt) => {
    const it = rawIt as { identifier?: string; title?: string; identifierref?: string };
    return {
      identifier: it.identifier ?? '',
      title: typeof it.title === 'string' ? it.title : 'Untitled',
      resourceId: it.identifierref ?? null,
    };
  });

  return {
    version,
    entryPoint: sco.href,
    title,
    items,
  };
}

/** Detect SCORM 1.2 vs 2004 from a parsed manifest root. */
export function detectVersion(manifest: Record<string, unknown>): ScormVersion {
  // Strategies, in order of reliability:
  //   1. `metadata.schemaversion` — "1.2" or "2004 3rd Edition" (common)
  //   2. schema attr on <manifest> — e.g. xmlns:adlcp="...CP_v1p2"
  //   3. root xmlns — e.g. xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  const meta = manifest.metadata as { schemaversion?: string; schema?: string } | undefined;
  const v = (meta?.schemaversion ?? '').toString().toLowerCase();
  if (v.includes('1.2')) return '1.2';
  if (v.includes('2004')) return '2004';

  const attrs = Object.keys(manifest).filter((k) => k.startsWith('xmlns'));
  for (const attr of attrs) {
    const val = String((manifest as Record<string, unknown>)[attr] ?? '').toLowerCase();
    if (val.includes('cp_v1p2') || val.includes('adlcp_rootv1p2')) return '1.2';
    if (val.includes('adlcp_v1p3') || (val.includes('imscp_v1p1') && val.includes('2004')))
      return '2004';
  }
  // Default: newer projects use 2004 — assume it unless 1.2 marker found.
  return '2004';
}

function toArray<T>(value: T | T[] | undefined | unknown): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
}
