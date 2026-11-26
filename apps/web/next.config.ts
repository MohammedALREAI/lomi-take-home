import type { NextConfig } from "next";

// The browser calls /api/* on the web app's own origin; Next forwards it to
// the API. API_URL is read when the app is built (Docker sets it to the api
// service), so the browser never needs to know where the API lives.
const apiUrl = process.env.API_URL ?? "http://localhost:3001";

const config: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default config;
