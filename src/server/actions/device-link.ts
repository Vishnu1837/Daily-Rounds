'use server';

import { toString as qrToString } from 'qrcode';

import { requireUserAction } from '@/lib/auth/guards';
import {
  type DeviceLinkStatus,
  TTL_SECONDS,
  deviceLinkStatus,
  mintDeviceLink,
} from '@/lib/auth/device-link';
import { absoluteUrl } from '@/lib/url';

import { type Result, guarded, ok } from './shared';

export type DeviceLinkOffer = {
  id: string;
  /**
   * The QR, already drawn, as an `<svg>` string.
   *
   * Rendered here rather than in the browser so the encoder never reaches the client bundle
   * — it is a few tens of kilobytes to draw one image that most students will never open.
   * The SVG is generated from a token this server just minted, so there is no untrusted
   * markup in it.
   */
  svg: string;
  /** Epoch milliseconds, so the sheet can count down without trusting the client's clock. */
  expiresAt: number;
  ttlSeconds: number;
};

/**
 * Mints a device-link code for the signed-in student and draws it.
 *
 * `requireUserAction` is the whole authorisation story: whoever calls this is already signed
 * in, and the code they get back is for their own account and no one else's. There is no
 * parameter naming a user, deliberately — the only account you can ever pair to is the one
 * you are already holding a session for.
 */
export async function createDeviceLinkAction(): Promise<Result<DeviceLinkOffer>> {
  return guarded(async () => {
    const user = await requireUserAction();
    const link = await mintDeviceLink(user.id);

    // Absolute, because this is read by a camera in another device's browser, where a bare
    // path resolves against nothing at all.
    const url = await absoluteUrl(`/link/${link.token}`);

    const svg = await qrToString(url, {
      type: 'svg',
      // Error correction M survives a phone camera at an angle and a bit of screen glare
      // without inflating the module count the way H would on a URL this long.
      errorCorrectionLevel: 'M',
      margin: 1,
      // Coloured by CSS at the point of use rather than baked in, so the code inverts
      // correctly in dark mode instead of becoming an unscannable dark-on-dark square.
      color: { dark: '#000000', light: '#ffffff' },
    });

    /*
     * The URL itself does not go back to the browser, only the picture of it. The code is a
     * credential either way, but there is no reason to hand the page a copy it can put in
     * text — nothing in the UI offers one, and a string is far easier to leak than an image.
     */
    return ok({ id: link.id, svg, expiresAt: link.expiresAt.getTime(), ttlSeconds: TTL_SECONDS });
  }, 'We could not create a sign-in code just now. Please try again.');
}

export type DeviceLinkState = { status: DeviceLinkStatus; device: string | null };

/** Whether the code the desktop is still showing has been scanned yet. */
export async function deviceLinkStatusAction(id: string): Promise<Result<DeviceLinkState>> {
  return guarded(async () => {
    const user = await requireUserAction();
    return ok(await deviceLinkStatus(id, user.id));
  }, 'We lost track of that sign-in code. Show a new one.');
}
