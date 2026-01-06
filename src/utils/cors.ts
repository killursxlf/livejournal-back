export function corsHeaders(request?: Request) {
  const allowedOrigins = [
    "http://localhost:3001",
    "http://26.182.91.97:3001",
    "http://192.168.178.24:3001",
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
