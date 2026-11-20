import type { NextConfig } from "next";

// Security headers for every page.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" }, // no other site can show Kantemba in a frame to trick users
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" }, // camera kept for barcode scanning later
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }, // HTTPS only once deployed
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
