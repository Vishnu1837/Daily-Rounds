import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { requireUser } from '@/lib/auth/guards';
import { listSubjects } from '@/server/actions/onboarding';

import { OnboardingWizard } from './wizard';
import { STUDENT_HOME } from '@/lib/routes';

export const metadata: Metadata = { title: 'Set up your cohort' };

// Not prerendered: a one-off screen with no frame worth showing ahead of its data.
export const instant = false;

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.onboardingCompletedAt) redirect(STUDENT_HOME);

  const subjects = await listSubjects();

  return (
    <div className="relative min-h-dvh">
      <div
        className="from-pulse-500/12 pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b to-transparent"
        aria-hidden
      />
      <main id="main" className="relative mx-auto max-w-lg px-4 py-8 sm:py-12">
        <OnboardingWizard
          defaultName={user.fullName}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, phaseLabel: s.phaseLabel }))}
        />
      </main>
    </div>
  );
}
