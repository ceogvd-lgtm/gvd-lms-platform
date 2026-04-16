'use client';

import { cn } from '@lms/ui';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Underline as UnderlineIcon,
} from 'lucide-react';

interface RichTextToolbarProps {
  editor: Editor | null;
  /** Sticky to the parent container's top when scrolling. */
  sticky?: boolean;
}

/**
 * Toolbar for `RichTextEditor`. The editor instance is passed down —
 * we read `editor.isActive(...)` for highlight state and call the
 * chain commands on click.
 */
export function RichTextToolbar({ editor, sticky = true }: RichTextToolbarProps) {
  if (!editor) return null;

  const promptLink = () => {
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL', previousUrl ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const buttons: Array<{
    label: string;
    icon: typeof Bold;
    isActive: () => boolean;
    onClick: () => void;
  }> = [
    {
      label: 'Bold',
      icon: Bold,
      isActive: () => editor.isActive('bold'),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic',
      icon: Italic,
      isActive: () => editor.isActive('italic'),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Underline',
      icon: UnderlineIcon,
      isActive: () => editor.isActive('underline'),
      onClick: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: 'Heading 1',
      icon: Heading1,
      isActive: () => editor.isActive('heading', { level: 1 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Heading 2',
      icon: Heading2,
      isActive: () => editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Heading 3',
      icon: Heading3,
      isActive: () => editor.isActive('heading', { level: 3 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: 'Bullet list',
      icon: List,
      isActive: () => editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Numbered list',
      icon: ListOrdered,
      isActive: () => editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Quote',
      icon: Quote,
      isActive: () => editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Code block',
      icon: Code,
      isActive: () => editor.isActive('codeBlock'),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: 'Link',
      icon: LinkIcon,
      isActive: () => editor.isActive('link'),
      onClick: promptLink,
    },
  ];

  return (
    <div
      className={cn(
        'z-20 flex flex-wrap items-center gap-1 rounded-button border border-border bg-surface p-1',
        sticky && 'sticky top-16',
      )}
    >
      {buttons.map(({ label, icon: Icon, isActive, onClick }) => {
        const active = isActive();
        return (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded transition-colors',
              active
                ? 'bg-primary text-white'
                : 'text-muted hover:bg-surface-2 hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
