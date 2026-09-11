import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { TopicReaderScreen } from '@/components/textbook/topic-reader-screen';
import { Skeleton } from '@/components/ui/feedback';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getBookTopics, getTopicForReader } from '@/server/queries/textbooks';

export const metadata: Metadata = { title: 'Chapter' };

const UUID = /^[0-9a-f-]{36}$/i;

export default function TopicReaderPage({
  params,
}: {
  params: Promise<{ materialId: string; topicId: string }>;
}) {
  return (
    <Suspense fallback={<ReaderFallback />}>
      <Topic params={params} />
    </Suspense>
  );
}

async function Topic({ params }: { params: Promise<{ materialId: string; topicId: string }> }) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { materialId, topicId } = await params;
  if (!UUID.test(materialId) || !UUID.test(topicId)) notFound();

  /*
   * The sibling chapters are loaded for two small things — whether this one is already
   * marked, and what "next" means at the bottom of the last page. Cheap: one indexed read
   * of a list that is twenty rows long, against a reader that is about to fetch megabytes.
   *
   * Fired alongside the chapter rather than after it. Neither query needs the other's
   * answer, and this render is what the browser is waiting on before it can even begin
   * loading the book — every round trip spent here is a round trip of blank screen.
   */
  const [topic, siblings] = await Promise.all([
    getTopicForReader(ctx.cohort.id, topicId),
    getBookTopics(ctx.cohort.id, materialId, ctx.memberId),
  ]);

  // The chapter must belong to the book in the URL, not merely to the same cohort: a
  // mismatched pair is a broken link, and following it would open the wrong file.
  if (!topic || topic.materialId !== materialId) notFound();

  const here = siblings.find((t) => t.id === topic.id);
  const next = siblings.find((t) => t.position > topic.position) ?? null;

  return (
    <TopicReaderScreen
      materialId={materialId}
      bookTitle={topic.bookTitle}
      topic={{
        id: topic.id,
        position: topic.position,
        title: topic.title,
        startPage: topic.startPage,
        endPage: topic.endPage,
      }}
      nextTopic={next ? { id: next.id, position: next.position, title: next.title } : null}
      studied={here?.studied ?? false}
      watermark={`${user.fullName} · ${user.email}`}
    />
  );
}

function ReaderFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-13 w-full rounded-2xl" />
      <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[880px]" />
    </div>
  );
}
