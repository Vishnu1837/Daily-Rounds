import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireOnboardedUser } from '@/lib/auth/guards';
import { getMemberContext } from '@/server/context';
import { getCheckInContext, getWeeklyReviewContext } from '@/server/queries/student';
import { isoWeekday } from '@/lib/domain/calendar';

import { CheckInScreen } from './check-in-screen';

export const metadata: Metadata = { title: 'Daily check-in' };
export const dynamic = 'force-dynamic';

export default async function CheckInPage() {
  const user = await requireOnboardedUser();
  const ctx = await getMemberContext(user);
  if (!ctx) redirect('/admin');

  const [checkIn, review] = await Promise.all([
    getCheckInContext(ctx),
    getWeeklyReviewContext(ctx),
  ]);

  // The weekly review is offered from Friday onwards, once the week has real data.
  const offerWeeklyReview =
    isoWeekday(ctx.today) >= 5 && !review.alreadySubmitted && review.current.activeDays >= 3;

  return (
    <CheckInScreen
      today={ctx.today}
      context={checkIn}
      weeklyReview={offerWeeklyReview ? review : null}
    />
  );
}
