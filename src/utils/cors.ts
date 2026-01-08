export function corsHeaders(request?: Request) {
  const allowedOrigins = [
    "https://livejournal-sjo1.vercel.app",
    "http://localhost:3000"
  ];
  const requestOrigin = request?.headers.get("Origin") || "";
  const origin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}
