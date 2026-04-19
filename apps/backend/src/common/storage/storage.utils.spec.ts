import { extractMinioKey } from './storage.utils';

describe('extractMinioKey', () => {
  it('parse absolute URL qua localhost MinIO', () => {
    expect(extractMinioKey('http://localhost:9000/lms-uploads/thumbnails/abc.webp')).toBe(
      'thumbnails/abc.webp',
    );
  });

  it('parse absolute URL qua CDN domain khác + bucket name', () => {
    expect(extractMinioKey('https://cdn.example.com/lms-uploads/content/video/x.mp4')).toBe(
      'content/video/x.mp4',
    );
  });

  it('parse proxy path /minio/*', () => {
    expect(extractMinioKey('/minio/avatars/uid.webp')).toBe('avatars/uid.webp');
  });

  it('parse SCORM proxy /scorm-content/* → content/scorm/*', () => {
    expect(extractMinioKey('/scorm-content/course-xyz/index.html')).toBe(
      'content/scorm/course-xyz/index.html',
    );
  });

  it('parse bare key (như Certificate.pdfUrl lưu)', () => {
    expect(extractMinioKey('certificates/cert123.pdf')).toBe('certificates/cert123.pdf');
  });

  it('chấp nhận mọi prefix trong STORAGE_PREFIXES', () => {
    expect(extractMinioKey('/minio/attachments/a.pdf')).toBe('attachments/a.pdf');
    expect(extractMinioKey('/minio/content/ppt/deck.pptx')).toBe('content/ppt/deck.pptx');
    expect(extractMinioKey('/minio/content/webgl/game/index.html')).toBe(
      'content/webgl/game/index.html',
    );
  });

  it('strip nhiều leading slash', () => {
    expect(extractMinioKey('///minio//thumbnails/x.webp')).toBe('thumbnails/x.webp');
  });

  it('trả null khi null/undefined/rỗng', () => {
    expect(extractMinioKey(null)).toBeNull();
    expect(extractMinioKey(undefined)).toBeNull();
    expect(extractMinioKey('')).toBeNull();
    expect(extractMinioKey('   ')).toBeNull();
  });

  it('trả null khi URL external không thuộc hệ thống', () => {
    expect(extractMinioKey('https://s3.amazonaws.com/other-bucket/x.jpg')).toBeNull();
    expect(extractMinioKey('https://example.com/image.png')).toBeNull();
  });

  it('trả null khi path không match prefix hợp lệ', () => {
    expect(extractMinioKey('/random/path/file.txt')).toBeNull();
    expect(extractMinioKey('unknown-prefix/file.webp')).toBeNull();
  });

  it('trả null cho URL parse fail nhưng không match prefix', () => {
    expect(extractMinioKey('://malformed')).toBeNull();
  });
});
