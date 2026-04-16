'use client';

import { File as FileIcon, Upload, X } from 'lucide-react';
import * as React from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';

import { cn } from '../lib/cn';

/* ============================================================
 * Helpers
 * ============================================================ */

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/* ============================================================
 * FileUploader
 * ============================================================ */

export interface FileUploaderProps {
  /** Selected files (controlled). Pass `undefined` for uncontrolled. */
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  /** MIME or extension whitelist passed to react-dropzone. */
  accept?: Record<string, string[]>;
  /** Max bytes per file. */
  maxSize?: number;
  /** Max number of files; 1 = single-file mode. */
  maxFiles?: number;
  /** Optional per-file upload progress map (0..100), keyed by file.name. */
  progress?: Record<string, number>;
  disabled?: boolean;
  className?: string;
}

/**
 * Drag-and-drop file uploader with preview, validation, and progress.
 *
 * - Drop zone highlights on drag-over
 * - Validates size + accept; shows per-file rejection reason
 * - Image files get a thumbnail preview; others show generic icon
 * - Per-file remove button
 * - Per-file progress bar when `progress` prop is provided
 *
 * The actual upload logic is intentionally NOT inside this component —
 * pass the selected files up via `onFilesChange` and POST them yourself.
 */
export function FileUploader({
  files: controlledFiles,
  onFilesChange,
  accept,
  maxSize,
  maxFiles = 1,
  progress = {},
  disabled = false,
  className,
}: FileUploaderProps) {
  const [internalFiles, setInternalFiles] = React.useState<File[]>([]);
  const files = controlledFiles ?? internalFiles;

  const [rejections, setRejections] = React.useState<FileRejection[]>([]);

  const updateFiles = (next: File[]) => {
    setInternalFiles(next);
    onFilesChange?.(next);
  };

  // updateFiles is closed over `onFilesChange`/`setInternalFiles` which are
  // stable; we only re-create the callback when the list of files or max
  // changes so newly dropped items are merged into the latest state.
  const onDrop = React.useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setRejections(rejected);
      const merged =
        maxFiles === 1 ? accepted.slice(0, 1) : [...files, ...accepted].slice(0, maxFiles);
      setInternalFiles(merged);
      onFilesChange?.(merged);
    },
    [files, maxFiles, onFilesChange],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles,
    disabled,
    multiple: maxFiles > 1,
  });

  const removeFile = (idx: number) => {
    updateFiles(files.filter((_, i) => i !== idx));
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors',
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border bg-surface hover:border-primary/50 hover:bg-surface-2',
          isDragReject && 'border-error bg-error/5',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input {...getInputProps()} />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-foreground">
          {isDragActive ? 'Thả file vào đây…' : 'Kéo thả file hoặc bấm để chọn'}
        </p>
        {(maxSize || accept) && (
          <p className="text-xs text-muted">
            {accept && `Chấp nhận: ${Object.values(accept).flat().join(', ')}`}
            {accept && maxSize && ' · '}
            {maxSize && `Tối đa ${formatBytes(maxSize)}`}
          </p>
        )}
      </div>

      {/* Rejection list */}
      {rejections.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-error">
          {rejections.map((r, idx) => (
            <p key={`${r.file.name}-${idx}`}>
              <strong>{r.file.name}</strong>: {r.errors.map((e) => e.message).join(', ')}
            </p>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((file, idx) => {
            const pct = progress[file.name];
            const isImage = file.type.startsWith('image/');
            const previewUrl = isImage ? URL.createObjectURL(file) : null;
            return (
              <li
                key={`${file.name}-${idx}`}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                {previewUrl ? (
                  /* Plain <img> intentional: this is a generic UI lib, no
                     dependency on next/image. Consumers can wrap if needed. */
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface-2 text-muted">
                    <FileIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  {pct !== undefined && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-error"
                  aria-label={`Xoá ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
