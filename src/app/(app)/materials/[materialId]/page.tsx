import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { BookScreen } from '@/components/textbook/book-screen';
import { TextbookReader } from '@/components/textbook/textbook-reader';
import { Skeleton } from '@/components/ui/feedback';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getBookTopics, getHostedTextbook } from '@/server/queries/textbooks';

export const metadata: Metadata = { title: 'Textbook' };

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A hosted textbook's own page. Awaits nothing itself — the membership check and the lookup
 * sit behind a Suspense boundary, as every runtime read in `(app)` does, so the navigation
 * paints its shell before the server answers.
 */
export default function TextbookPage({ params }: { params: Promise<{ materialId: string }> }) {
  return (
    <Suspense fallback={<BookFallback />}>
      <Book params={params} />
    </Suspense>
  );
}

async function Book({ params }: { params: Promise<{ materialId: string }> }) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { materialId } = await params;
  if (!UUID.test(materialId)) notFound();

  const book = await getHostedTextbook(ctx.cohort.id, materialId);
  if (!book) notFound();

  const topics = await getBookTopics(ctx.cohort.id, book.id, ctx.memberId);

  /*
   * A book nobody has split yet is still a book. It opens straight into the whole-book
   * reader, exactly as it did before chapters existed — the alternative, an empty timeline
   * telling a student to ask their cohort lead, would take away a textbook they can already
   * read in order to advertise a feature they cannot use.
   */
  if (topics.length === 0) {
    return (
      <TextbookReader
        materialId={book.id}
        title={book.title}
        watermark={`${user.fullName} · ${user.email}`}
        backHref="/materials"
      />
    );
  }

  return (
    <BookScreen
      materialId={book.id}
      title={book.title}
      coverVersion={book.coverVersion}
      topics={topics}
    />
  );
}

function BookFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-13 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
