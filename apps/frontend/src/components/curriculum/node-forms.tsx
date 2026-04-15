'use client';

import { Button, Input } from '@lms/ui';
import { useState } from 'react';

/**
 * Minimal CRUD forms for each curriculum level — shared structure:
 *   - controlled inputs from props (seeded with existing row when editing)
 *   - onSubmit(formData) returns Promise, caller does the API call +
 *     toast + invalidation
 *
 * Each form is kept compact on purpose; fancier validation goes into the
 * Phase 08 polish pass.
 */

// ---------- Department ----------

export function DepartmentForm({
  initial,
  onSubmit,
  submitting,
  onCancel,
}: {
  initial?: { name: string; code: string; description?: string | null };
  onSubmit: (data: { name: string; code: string; description?: string }) => Promise<void>;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ name, code: code.toUpperCase(), description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Tên ngành" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Mã ngành"
        helper="Chữ HOA, số, - hoặc _"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={!!initial}
        required
      />
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Mô tả</span>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Subject ----------

export function SubjectForm({
  initial,
  departmentId,
  onSubmit,
  submitting,
  onCancel,
}: {
  initial?: { name: string; code: string; description?: string | null };
  departmentId: string;
  onSubmit: (data: {
    departmentId: string;
    name: string;
    code: string;
    description?: string;
  }) => Promise<void>;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ departmentId, name, code: code.toUpperCase(), description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Tên môn học" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input
        label="Mã môn"
        helper="Chữ HOA, số, - hoặc _"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={!!initial}
        required
      />
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Mô tả</span>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Course ----------

export function CourseForm({
  initial,
  subjectId,
  onSubmit,
  submitting,
  onCancel,
}: {
  initial?: { title: string; description?: string | null };
  subjectId: string;
  onSubmit: (data: { subjectId: string; title: string; description?: string }) => Promise<void>;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ subjectId, title, description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Tên khoá học"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Mô tả</span>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Chapter ----------

export function ChapterForm({
  initial,
  onSubmit,
  submitting,
  onCancel,
}: {
  initial?: { title: string; description?: string | null };
  onSubmit: (data: { title: string; description?: string }) => Promise<void>;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ title, description });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Tên chương" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium text-foreground">Mô tả</span>
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-button border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/20"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Lesson ----------

export function LessonForm({
  initial,
  onSubmit,
  submitting,
  onCancel,
}: {
  initial?: { title: string; type: 'THEORY' | 'PRACTICE' };
  onSubmit: (data: { title: string; type: 'THEORY' | 'PRACTICE' }) => Promise<void>;
  submitting?: boolean;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<'THEORY' | 'PRACTICE'>(initial?.type ?? 'THEORY');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ title, type });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Tên bài giảng"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <div>
        <p className="mb-1.5 text-sm font-medium text-foreground">Loại bài</p>
        <div className="grid grid-cols-2 gap-2">
          {(['THEORY', 'PRACTICE'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={
                'rounded-button border-2 px-3 py-2.5 text-sm font-medium transition-all ' +
                (type === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted hover:border-primary/50')
              }
            >
              {t === 'THEORY' ? 'Lý thuyết' : 'Thực hành'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}
