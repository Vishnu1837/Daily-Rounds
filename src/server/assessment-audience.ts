import 'server-only';

import { type SQL, sql } from 'drizzle-orm';

import { assessmentAudienceMembers, assessments } from '@/db/schema';

/**
 * "Is this assessment for me?", as a WHERE clause.
 *
 * Publishing used to be all-or-nothing, and the gap that left was the one an admin feels
 * every time: there was no way to put a finished paper in front of a single test account,
 * sit it end to end, and only then let the cohort at it. `assessments.audience` closes it,
 * and this is the predicate that enforces it.
 *
 * It is a predicate rather than a filter applied to fetched rows on purpose, and every
 * student-facing read in the module composes it into its own WHERE alongside the cohort
 * scope. An assessment somebody is not an audience for should be un-fetchable — not fetched
 * and then hidden, which is the shape of bug that leaks a title into a list, a count into a
 * badge, or a whole paper into whatever the next reader of that query forgets to re-filter.
 *
 * Not an authorisation boundary on its own: `startAttemptAction` applies the same test again
 * before opening a sitting, because a student who kept a URL from before the audience
 * narrowed would otherwise walk straight past a list they never see.
 */
export function visibleToMember(memberId: string): SQL {
  return sql`(
    ${assessments.audience} = 'everyone'
    OR EXISTS (
      SELECT 1 FROM ${assessmentAudienceMembers}
      WHERE ${assessmentAudienceMembers.assessmentId} = ${assessments.id}
        AND ${assessmentAudienceMembers.memberId} = ${memberId}
    )
  )`;
}
