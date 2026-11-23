import { db } from "./_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    await db()`select 1`;
    return res.status(200).json({
      ok: true,
      application: "Refrigeración 360",
      database: "connected"
    });
  } catch {
    return res.status(503).json({
      ok: false,
      application: "Refrigeración 360",
      database: "unavailable",
      message: "Revisa DATABASE_URL y DATABASE_URL_POOLED en Vercel."
    });
  }
}
