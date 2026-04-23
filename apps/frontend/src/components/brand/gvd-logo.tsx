import { cn } from '@lms/ui';

/**
 * GVD next gen LMS logo — inline SVG so that color follows `currentColor`.
 * Pass `className` with any Tailwind text-* color utility.
 *
 * Original source: Logo GVD dương bản (white positive version), stored at
 * /public/logo-gvd.svg for direct <img> usage when currentColor is not needed.
 *
 * The inner paths form a stylised triangle mark built from two mountain-like
 * chevrons plus a baseline. Kept as three <path> elements (identical to the
 * source SVG) so the shape remains editable in Illustrator round-trip.
 */
export function GvdLogo({
  className,
  title = 'GVD next gen LMS',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox="0 0 801.5 692.8"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('fill-current', className)}
    >
      <title>{title}</title>
      <g>
        <path d="M391.7,0L0,682.1l395.2-231.2L391.7,0z M338.5,409.5l-132.6,71.3c-1.5,0.8-3.1-0.9-2.3-2.3L332,255.4c0.4-0.6,1.3-0.4,1.3,0.3l5.6,153.2C338.9,409.1,338.8,409.4,338.5,409.5z" />
        <path d="M801.5,682.1L404.3,0l2,450.8L801.5,682.1z M482.8,250.4l134.8,235.8c0.8,1.5-0.8,3.2-2.3,2.3l-132.8-73.4c-0.2-0.1-0.4-0.4-0.4-0.7l-0.6-163.7C481.5,250,482.5,249.8,482.8,250.4z" />
        <path d="M5.1,692.8h788.4L400.7,463.7L5.1,692.8z M402.6,537.7l141,83.6c0.6,0.4,0.3,1.3-0.4,1.3l-286.9,2c-1.7,0-2.3-2.3-0.9-3.2l146.4-83.7C402,537.6,402.3,537.6,402.6,537.7z" />
      </g>
    </svg>
  );
}
