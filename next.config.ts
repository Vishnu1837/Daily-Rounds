import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  cacheComponents: true,
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  typedRoutes: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
    /*
     * How long a visited route stays reusable in the client's router cache.
     *
     * Next defaults dynamic routes to 0, which means going Today -> Roadmap -> Today
     * re-requests Today from the server and shows the skeleton again, even though the
     * payload arrived seconds ago. Every screen here is a signed-in dashboard, so *all*
     * of them are dynamic and *all* of them paid that toll on every tab switch.
     *
     * Thirty seconds is chosen against the data's real rate of change: points, streaks
     * and check-ins move when the student does something, and every mutation already
     * calls `revalidatePath`, which evicts these entries. So the window only ever serves
     * a payload that nothing has invalidated — a back-and-forth between two tabs is
     * instant, while anything the student actually changes still re-renders at once.
     */
    staleTimes: { dynamic: 30, static: 180 },
    /*
     * How large a server action's payload may be.
     *
     * Next defaults this to 1 MB, which is fine for every action in the app except one: a
     * feedback report carries up to three screenshots. They are re-encoded in the browser
     * before they are sent (see `components/feedback/feedback-survey.tsx`) and the action
     * refuses anything over 2 MB each, so 8 MB is that ceiling plus the multipart overhead
     * and the text — not an invitation to send more.
     *
     * Raising it is not a licence for other actions to get fat. It is the transport limit;
     * the limits that matter are in `lib/domain/feedback.ts` and enforced server-side.
     */
    serverActions: { bodySizeLimit: '8mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
