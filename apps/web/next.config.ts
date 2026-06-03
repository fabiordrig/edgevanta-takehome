import type { NextConfig } from 'next';

/**
 * Next.js configuration for @edgevanta/web.
 *
 * transpilePackages: ['@edgevanta/types'] is REQUIRED for the App Router to
 * resolve the workspace package through pnpm's .pnpm symlink layout.
 * Without it, Next.js throws a module-resolution error on the workspace import.
 * See: RESEARCH Pattern 4, Assumption A2.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@edgevanta/types'],
};

export default nextConfig;
