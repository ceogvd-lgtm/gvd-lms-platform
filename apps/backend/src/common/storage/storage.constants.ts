/**
 * Single-bucket layout.
 *
 * We use one MinIO bucket (`lms-uploads`) and namespace by key prefix.
 * Rationale: simpler IAM, one public-read policy statement per prefix,
 * one lifecycle rule file, fewer knobs in ops.
 */
export const ROOT_BUCKET = 'lms-uploads';

export const STORAGE_PREFIXES = {
  AVATARS: 'avatars',
  THUMBNAILS: 'thumbnails',
  ATTACHMENTS: 'attachments',
  SCORM: 'content/scorm',
  VIDEO: 'content/video',
  PPT: 'content/ppt',
  WEBGL: 'content/webgl',
  CERTIFICATES: 'certificates',
} as const;

/**
 * Prefixes served via public-read bucket policy — no presigned URL needed.
 *
 * WebGL and SCORM are public because both are "extract-zip-and-serve-as-
 * static-site" patterns. Their `index.html` / `imsmanifest.xml` reference
 * children (`Build/*.loader.js`, `scormdriver.js`, `html5/data/css/*.css`,
 * `story_content/*.js`, …) via relative URLs. A presigned URL only
 * authorises the specific key it was signed for, so the index would load
 * but every child asset would 403.
 *
 * Access control for these lessons lives at the "who can start an
 * attempt / view a lesson" layer (see PracticeService.startAttempt
 * ownership check, theoryContentsApi enrolment check) — not at the
 * static-asset layer. The serving bucket is isolated from user data
 * (no avatars/attachments under these prefixes).
 */
export const PUBLIC_PREFIXES: readonly string[] = [
  STORAGE_PREFIXES.AVATARS,
  STORAGE_PREFIXES.THUMBNAILS,
  STORAGE_PREFIXES.WEBGL,
  STORAGE_PREFIXES.SCORM,
];

/** Size limits per upload type (bytes). */
export const MAX_SIZE = {
  AVATAR: 5 * 1024 * 1024, //   5 MB
  THUMBNAIL: 10 * 1024 * 1024, //  10 MB
  ATTACHMENT: 50 * 1024 * 1024, //  50 MB
  /**
   * 2 GB nominal. In practice, uploads > ~100 MB through the memory-buffered
   * multer path are impractical — production should switch to presigned S3
   * multipart upload directly from the client. See TODOs in upload.service.ts.
   */
  CONTENT: 2 * 1024 * 1024 * 1024,
} as const;

/** Allowed MIME types per upload type. */
export const ALLOWED_MIME = {
  AVATAR: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  THUMBNAIL: ['image/jpeg', 'image/jpg', 'image/png'],
  ATTACHMENT: ['application/pdf'],
  CONTENT: [
    // zip archives (SCORM, WebGL builds)
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    // powerpoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // video
    'video/mp4',
    'video/webm',
  ],
} as const;

/**
 * Content sub-type detection — called on /upload/content with an explicit
 * `contentType` DTO field so we put the file in the correct prefix.
 */
export type ContentKind = 'SCORM' | 'PPT' | 'VIDEO' | 'WEBGL';

export const CONTENT_PREFIX_MAP: Record<ContentKind, string> = {
  SCORM: STORAGE_PREFIXES.SCORM,
  PPT: STORAGE_PREFIXES.PPT,
  VIDEO: STORAGE_PREFIXES.VIDEO,
  WEBGL: STORAGE_PREFIXES.WEBGL,
};

export const WEBGL_EXTRACT_QUEUE = 'webgl-extract';
