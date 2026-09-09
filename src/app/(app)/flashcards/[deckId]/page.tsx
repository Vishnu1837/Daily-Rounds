import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/feedback';
import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getDeck } from '@/server/queries/flashcards';

import { SessionScreen } from './session-screen';

export const metadata: Metadata = { title: 'Flashcards' };

/** A uuid, loosely — enough to keep a malformed query string out of an `IN` clause. */
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * The session route.
 *
 * The page itself awaits nothing, and the whole of the run — which needs `searchParams`,
 * a cookie and three queries — sits behind a Suspense boundary. That is the same rule the
 * `(app)` layout states for itself: reading runtime data at the top of a route costs the
 * route its prerendered shell, so the navigation cannot paint until the server answers.
 *
 * It matters more here than on most screens. Pressing a deck plays an opening animation
 * before this route is even asked for, so a blocking route would spend that animation
 * waiting on a database rather than covering it — and the student would watch a deck lift
 * off nothing.
 */
export default async function FlashcardSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ cards?: string }>;
}) {
  return (
    <Suspense fallback={<SessionFallback />}>
      <Session params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Session({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ cards?: string }>;
}) {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const { deckId } = await params;
  const { cards } = await searchParams;

  /*
   * `?cards=` is how "review the ones you found hard" is served: the completion screen owns
   * that list, so it does not have to be stored anywhere. The ids are still checked against
   * the deck by `getDeck`, and again by the action before anything is written — a query
   * string is a suggestion, not an authorisation.
   */
  const onlyCardIds = cards
    ?.split(',')
    .map((id) => id.trim())
    .filter((id) => UUID.test(id));

  const deck = await getDeck(ctx, deckId, onlyCardIds);
  if (!deck) notFound();

  return <SessionScreen deck={deck} reviewing={Boolean(onlyCardIds?.length)} />;
}

/**
 * The shape of a session, before the session arrives.
 *
 * Deliberately the card's own silhouette rather than a spinner: the deck cover animating in
 * from the previous screen lands on top of this, so what is underneath has to be a card in
 * the right place — a spinner would flash behind the cover for exactly as long as it takes
 * to notice it.
 */
function SessionFallback() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-36" />
      </div>
      <Skeleton className="h-9 w-24" />
      <Skeleton className="rounded-hero h-[clamp(14rem,calc(100dvh-30rem),27rem)] w-full sm:h-[clamp(15rem,calc(100dvh-21rem),27rem)]" />
    </div>
  );
}
