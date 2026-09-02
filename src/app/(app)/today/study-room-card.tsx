'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, Users, Video } from 'lucide-react';

import { AvatarStack } from '@/components/ui/avatar';
import { Badge, LiveDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
  HEARTBEAT_SECONDS,
  LATE_AFTER_MINUTES,
  formatCountdown,
  roomState,
} from '@/lib/domain/study-room';
import {
  type RoomOccupant,
  heartbeatStudyRoomAction,
  joinStudyRoomAction,
  leaveStudyRoomAction,
  studyRoomPulseAction,
} from '@/server/actions/study-room';
import type { HomeData } from '@/server/queries/student';

type Room = HomeData['studyRoom'];

/**
 * The cohort's study room.
 *
 * The name and the times on the card are the student's, not the cohort's: the window is
 * translated into their own timezone before it gets here, and the heading is derived from
 * that translated start time unless the cohort lead named the room themselves. The clock
 * the card *counts* against is still the cohort's — see below.
 *
 * The card runs on the COHORT's clock, not the browser's: the server hands over the current
 * wall-clock minute at render, and this ticks it forward locally. A student sitting in a
 * different timezone — or with a skewed system clock — still sees the same countdown as
 * everyone else, and every poll resyncs the offset.
 *
 * Joining is the real thing. It marks the student present (or late, past the grace period),
 * puts them on the live roster the rest of the cohort can see, and only then opens the
 * meeting. While they hold a place the card heartbeats; when the tab goes away the roster
 * lets them go on its own.
 */
export function StudyRoomCard({ room }: { room: Room }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startJoin] = useTransition();
  const [leaving, startLeave] = useTransition();

  const [nowMinutes, setNowMinutes] = useState(room.nowMinutes);
  const [occupants, setOccupants] = useState<RoomOccupant[]>(room.occupants);
  const [joined, setJoined] = useState(room.joined);

  /*
   * A fresh server render supersedes whatever polling and the local tick had drifted to.
   * Done during render rather than in an effect so the card never paints one frame of
   * stale roster after a refresh.
   */
  const [rendered, setRendered] = useState(room);
  if (rendered !== room) {
    setRendered(room);
    setNowMinutes(room.nowMinutes);
    setOccupants(room.occupants);
    setJoined(room.joined);
  }

  // Tick the cohort clock forward once a minute so the countdown is alive between renders.
  useEffect(() => {
    const id = setInterval(() => setNowMinutes((m) => m + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const state = roomState({
    startTime: room.startTime,
    endTime: room.endTime,
    nowMinutes,
  });

  const open = state.phase === 'open';

  /*
   * One timer covers both cases. Someone who has joined heartbeats — which keeps them on
   * the roster and returns it in the same round trip. Someone who is only watching polls
   * read-only, so watching can never look like attending.
   */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const beat = async () => {
      const result = joined ? await heartbeatStudyRoomAction() : await studyRoomPulseAction();
      if (cancelled || !result.ok) return;
      setOccupants(result.data.occupants);
      setNowMinutes(result.data.nowMinutes);
    };

    const id = setInterval(() => void beat(), HEARTBEAT_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, joined]);

  const join = useCallback(() => {
    startJoin(async () => {
      const result = await joinStudyRoomAction();
      if (!result.ok) {
        toast.error('Could not join the study room', result.message);
        // The window may have closed under us — re-render against the server's clock.
        router.refresh();
        return;
      }

      const {
        url,
        status,
        attendanceRecorded,
        occupants: roster,
        nowMinutes: serverMinutes,
      } = result.data;

      setJoined(true);
      setOccupants(roster);
      setNowMinutes(serverMinutes);

      /*
       * Opened after the action rather than before it, so the attendance write is what
       * decides whether the student is present or late — not how fast a tab loads.
       */
      window.open(url, '_blank', 'noopener,noreferrer');

      if (attendanceRecorded) {
        toast.success(
          status === 'present' ? 'Marked present' : 'Marked late',
          status === 'present'
            ? "You're in the room and today's attendance is recorded."
            : `You joined more than ${LATE_AFTER_MINUTES} minutes after the start.`,
        );
      } else {
        toast.success("You're in the room", 'Your attendance for today was already recorded.');
      }
      router.refresh();
    });
  }, [router, toast]);

  const leave = useCallback(() => {
    startLeave(async () => {
      const result = await leaveStudyRoomAction();
      if (!result.ok) {
        toast.error('Could not sign you out', result.message);
        return;
      }
      setJoined(false);
      setOccupants(result.data.occupants);
      toast.success('Signed out of the room', 'Your attendance for today still stands.');
    });
  }, [toast]);

  const attendedLabel =
    room.attended === 'present'
      ? 'Marked present'
      : room.attended === 'late'
        ? 'Marked late'
        : room.attended === 'absent'
          ? 'Marked absent'
          : null;

  return (
    <Card padding="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {open ? (
            <LiveDot label={state.started ? 'Live study room' : 'Room open'} />
          ) : (
            <p className="eyebrow">Study room</p>
          )}
          <p className="text-fg mt-3 text-lg font-extrabold">{room.title}</p>
          <p className="text-fg-muted flex items-center gap-1.5 text-sm">
            <Clock className="size-3.5" aria-hidden />
            {room.displayStartTime} – {room.displayEndTime}
          </p>
          {room.zoneNote && <p className="text-fg-subtle mt-0.5 text-xs">{room.zoneNote}</p>}
        </div>
        {attendedLabel && (
          <Badge
            tone={
              room.attended === 'absent'
                ? 'danger'
                : room.attended === 'late'
                  ? 'warning'
                  : 'success'
            }
          >
            {attendedLabel}
          </Badge>
        )}
      </div>

      {/* ------------------------------------------------------ who is here */}
      <div className="border-border mt-4 flex min-h-9 items-center gap-3 border-t pt-4">
        {occupants.length > 0 ? (
          <>
            <AvatarStack
              people={occupants.map((o) => ({ name: o.name, avatarUrl: o.avatarUrl }))}
              size="xs"
              max={5}
            />
            <p className="text-fg-muted min-w-0 text-sm">
              <span className="text-fg font-semibold">{occupants.length}</span>
              {occupants.length === 1 ? ' person is' : ' people are'} in the room
            </p>
          </>
        ) : (
          <p className="text-fg-subtle flex items-center gap-2 text-sm">
            <Users className="size-4" aria-hidden />
            {open ? 'Nobody is in the room yet — be first.' : 'The room is empty right now.'}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- the action */}
      {!room.url ? (
        <p className="surface-sunken text-fg-muted mt-4 p-3.5 text-sm">
          No meeting link has been set for the study room yet. Your cohort lead can add one from the
          admin settings.
        </p>
      ) : state.phase === 'before' ? (
        <>
          <Button variant="secondary" size="lg" fullWidth className="mt-4" disabled>
            <Video className="size-[18px]" aria-hidden />
            Opens in {formatCountdown(state.minutesToOpen)}
          </Button>
          <p className="text-fg-subtle mt-2.5 text-center text-xs">
            Doors open a few minutes early; the room starts at {room.displayStartTime}.
          </p>
        </>
      ) : state.phase === 'ended' ? (
        <>
          <Button variant="secondary" size="lg" fullWidth className="mt-4" disabled>
            Room closed for today
          </Button>
          <p className="text-fg-subtle mt-2.5 text-center text-xs">
            Back tomorrow at {room.displayStartTime}.
          </p>
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            className="mt-4"
            loading={pending}
            onClick={join}
          >
            <Video className="size-[18px]" aria-hidden />
            {joined ? 'Rejoin Google Meet' : 'Join Google Meet'}
          </Button>

          <div className="mt-2.5 flex items-center justify-center gap-3 text-xs">
            <p className="text-fg-subtle">
              {!state.started
                ? `Starts in ${formatCountdown(state.minutesToStart)}`
                : state.joinStatus === 'present'
                  ? `Counts as present · ends in ${formatCountdown(state.minutesToEnd)}`
                  : `Counts as late · ends in ${formatCountdown(state.minutesToEnd)}`}
            </p>
            {joined && (
              <button
                type="button"
                onClick={leave}
                disabled={leaving}
                className="text-fg-muted hover:text-fg inline-flex items-center gap-1 font-semibold transition-colors disabled:opacity-50"
              >
                <LogOut className="size-3" aria-hidden />
                Step out
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
