'use client';

import { cn } from '@lms/ui';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';

import { RichTextToolbar } from './rich-text-toolbar';

interface RichTextEditorProps {
  /** Initial JSON content (TipTap ProseMirror document). null = empty. */
  initialContent: JSONContent | null;
  onChange: (content: JSONContent) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** Hide toolbar — useful for compact "description" inputs. */
  hideToolbar?: boolean;
  /** Min editor height in px. */
  minHeight?: number;
  className?: string;
  /** Sticky toolbar (set false in modal/compact contexts). */
  stickyToolbar?: boolean;
}

const DEFAULT_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Rich-text editor wrapper around TipTap (Phase 10).
 *
 * Storage format: TipTap JSON ProseMirror — `editor.getJSON()` produces
 * a serialisable document we persist as `theory_contents.body`.
 *
 * Performance: the parent passes a stable `onChange` (memoised). We
 * intentionally do NOT support `value` / fully controlled mode because
 * TipTap is uncontrolled internally — re-setting content on every
 * keystroke would lose cursor position. Initial content is the only
 * external input.
 */
export function RichTextEditor({
  initialContent,
  onChange,
  placeholder = 'Bắt đầu soạn nội dung…',
  readOnly = false,
  hideToolbar = false,
  minHeight = 320,
  className,
  stickyToolbar = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Heading levels 1-3 only (matches toolbar buttons).
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent ?? DEFAULT_DOC,
    editable: !readOnly,
    immediatelyRender: false, // SSR safety in Next.js App Router
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON());
    },
  });

  // If parent flips read-only state (e.g. preview mode), reflect it.
  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={cn('space-y-3', className)}>
      {!hideToolbar && !readOnly && <RichTextToolbar editor={editor} sticky={stickyToolbar} />}
      <div
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none',
          'rounded-card border border-border bg-surface px-4 py-3',
          'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15',
          readOnly && 'bg-surface-2/40',
        )}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export type { JSONContent };
