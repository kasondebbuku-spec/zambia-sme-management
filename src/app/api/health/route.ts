import { db } from "@/server/db";

// Render calls this to check the app is up. It also checks the database answers, so a
// deploy with a wrong DATABASE_URL is caught before it takes traffic.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "database unavailable" }, { status: 503 });
  }
}
