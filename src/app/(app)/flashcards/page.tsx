import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getDecks } from '@/server/queries/flashcards';

import { DecksScreen } from './decks-screen';

export const metadata: Metadata = { title: 'Flashcards' };

export default async function FlashcardsPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const decks = await getDecks(ctx);

  return <DecksScreen decks={decks} />;
}
