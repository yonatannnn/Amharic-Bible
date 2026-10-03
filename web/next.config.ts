import type { NextConfig } from "next";

// Bible text is served from the bundled statics in /public/bible —
// no external content API, so no proxy rewrites are needed.
const nextConfig: NextConfig = {};

export default nextConfig;
