'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

import { TextbookReader } from '@/components/textbook/textbook-reader';
import { Button, LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { topicPageCount } from '@/lib/domain/textbook-topics';
import { setTopicStudiedAction } from '@/server/actions/textbooks';

export type ReaderTopic = {
  id: string;
  position: number;
  title: string;
  startPage: number;
  endPage: number;
};

/**
 * One chapter, open.
 *
 * The reader itself is unchanged — same document, same per-request membership check, same
 * watermark burnt into the pixels — and is simply told which pages this chapter is. What
 * this adds is the end of the chapter: the two things a student wants at the bottom of the
 * last page are to say they have read it and to start the next one, and both are there
 * rather than behind a trip back to the book page.
 */
export function TopicReaderScreen({
  materialId,
  bookTitle,
  topic,
  nextTopic,
  studied: initialStudied,
  watermark,
}: {
  materialId: string;
  bookTitle: string;
  topic: ReaderTopic;
  nextTopic: { id: string; position: number; title: string } | null;
  studied: boolean;
  watermark: string;
}) {
  const router = useRouter();
  const [studied, setStudied] = useState(initialStudied);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bookHref = `/materials/${materialId}`;

  const toggle = useCallback(async () => {
    const next = !studied;
    setStudied(next);
    setPending(true);
    setError(null);

    const result = await setTopicStudiedAction(topic.id, next);
    setPending(false);
    if (result.ok) {
      // The book page behind this one is now out of date about a chapter it lists.
      router.refresh();
    } else {
      setStudied(!next);
      setError(result.message);
    }
  }, [studied, topic.id, router]);

  const pages = topicPageCount(topic);

  return (
    <TextbookReader
      materialId={materialId}
      title={`Chapter ${topic.position} · ${topic.title}`}
      watermark={watermark}
      backHref={bookHref}
      range={{ startPage: topic.startPage, endPage: topic.endPage }}
      resumeKey={`${materialId}:${topic.id}`}
      footer={
        <Card variant="wash" tone={studied ? 'citrus' : 'pulse'} padding="md">
          <p className="eyebrow mb-1">End of chapter {topic.position}</p>
          <p className="text-fg text-sm font-bold text-balance">{topic.title}</p>
          <p className="text-fg-muted mt-0.5 text-xs font-semibold tabular-nums">
            {pages} {pages === 1 ? 'page' : 'pages'} · {bookTitle}
          </p>

          {error && (
            <p
              className="text-danger-strong dark:text-danger mt-3 text-sm font-semibold"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={studied ? 'outline' : 'success'}
              size="md"
              disabled={pending}
              onClick={() => void toggle()}
              className="flex-1"
            >
              <Check className="size-4" aria-hidden />
              {studied ? 'Studied — tap to undo' : 'Mark as studied'}
            </Button>

            {nextTopic ? (
              <LinkButton
                href={`/materials/${materialId}/topics/${nextTopic.id}`}
                variant="primary"
                size="md"
                className="flex-1"
              >
                Chapter {nextTopic.position}
                <ArrowRight className="size-4" aria-hidden />
              </LinkButton>
            ) : (
              <LinkButton href={bookHref} variant="outline" size="md" className="flex-1">
                Back to the book
              </LinkButton>
            )}
          </div>
        </Card>
      }
    />
  );
}
