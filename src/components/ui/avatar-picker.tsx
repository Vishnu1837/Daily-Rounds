'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Trash2 } from 'lucide-react';

import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/** The square the picture is downscaled to before it is ever uploaded. */
const TARGET_PX = 256;
const QUALITY = 0.82;

/**
 * Reads a file, centre-crops it to a square and re-encodes it small.
 *
 * All of it happens in the browser, which is what makes storing the picture inline
 * reasonable: whatever a phone camera produced — a 4MB 12-megapixel JPEG — leaves here as a
 * 256px square of a few tens of kilobytes.
 */
async function toSquareDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = TARGET_PX;
    canvas.height = TARGET_PX;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process that image.');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_PX, TARGET_PX);

    // JPEG, not PNG: a photograph as PNG is several times larger for no visible gain.
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}

/**
 * The profile picture control: the avatar itself is the upload target.
 *
 * Nobody is obliged to add a photo — the generated monogram is a real fallback, not a
 * placeholder — so removing the picture is offered as plainly as adding one.
 */
export function AvatarPicker({
  name,
  avatarUrl,
  size = 'xl',
  onSave,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  size?: 'lg' | 'xl';
  /** Persists the picture. `null` clears it. */
  onSave: (dataUrl: string | null) => Promise<{ ok: boolean; message?: string }>;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  // Shown immediately so the new picture does not wait on a round trip.
  const [preview, setPreview] = useState<string | null>(avatarUrl);

  const save = useCallback(
    (dataUrl: string | null, previous: string | null) => {
      startTransition(async () => {
        const result = await onSave(dataUrl);
        if (!result.ok) {
          setPreview(previous); // put the old picture back rather than lying about the save
          toast.error('Could not save your picture', result.message);
          return;
        }
        toast.success(dataUrl ? 'Profile picture updated' : 'Profile picture removed');
        router.refresh();
      });
    },
    [onSave, router, toast],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        toast.error('That file is not an image');
        return;
      }

      const previous = preview;
      try {
        const dataUrl = await toSquareDataUrl(file);
        setPreview(dataUrl);
        save(dataUrl, previous);
      } catch {
        toast.error('We could not read that image', 'Try a JPEG or PNG.');
      }
    },
    [preview, save, toast],
  );

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="group relative rounded-full disabled:opacity-60"
        aria-label={preview ? 'Change your profile picture' : 'Add a profile picture'}
      >
        <Avatar name={name} src={preview} size={size} ring />
        <span
          className={cn(
            'absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
            pending && 'opacity-100',
          )}
          aria-hidden
        >
          <Camera className="size-5" />
        </span>
      </button>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="text-sm font-semibold underline underline-offset-2 disabled:opacity-60"
        >
          {pending ? 'Saving…' : preview ? 'Change picture' : 'Add a picture'}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              const previous = preview;
              setPreview(null);
              save(null, previous);
            }}
            disabled={pending}
            className="mt-1 flex items-center gap-1.5 text-xs font-semibold opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          // Clear the input so picking the same file twice still fires a change.
          e.target.value = '';
        }}
      />
    </div>
  );
}
