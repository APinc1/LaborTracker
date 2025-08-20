import { Router } from "express";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/dashboard/v2", async (req, res, next) => {
  try {
    const { getStorage } = await import('../storage');
    const storage = await getStorage();
    
    const locIds = String(req.query.locationIds || "")
      .split(",").map(s => s.trim()).filter(Boolean).map(Number);
    const from = (req.query.from as string) ?? new Date().toISOString().slice(0,10);
    const to   = (req.query.to   as string) ?? from;

    // -------- fast "version probe" (no row scans) ----------
    const db = await storage.db;
    const [tVer, pVer, uVer, cVer] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt, NOW() AS mu
        FROM tasks WHERE task_date BETWEEN ${from}::date AND ${to}::date
      `),
      db.execute(sql`SELECT COUNT(*)::int AS cnt, NOW() AS mu FROM projects`),
      db.execute(sql`SELECT COUNT(*)::int AS cnt, NOW() AS mu FROM users`),
      db.execute(sql`SELECT COUNT(*)::int AS cnt, NOW() AS mu FROM crews`),
    ]);

    const pick = (x: any) => (Array.isArray(x) ? x[0] : x.rows?.[0] || x);
    const vTasks = pick(tVer), vProj = pick(pVer), vUsers = pick(uVer), vCrews = pick(cVer);

    const etag = `W/"v2:${from}:${to}:${vTasks.cnt}:${new Date(vTasks.mu).getTime()}:` +
                 `${vProj.cnt}:${new Date(vProj.mu).getTime()}:` +
                 `${vUsers.cnt}:${new Date(vUsers.mu).getTime()}:` +
                 `${vCrews.cnt}:${new Date(vCrews.mu).getTime()}"`;

    if (req.headers["if-none-match"] === etag) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      return res.status(304).end();
    }

    // -------- actual data (parallel) ----------
    const [projects, users, crews, tasksRange, budgetsAll, tasksAll] = await Promise.all([
      db.execute(sql`SELECT id, project_id, name FROM projects ORDER BY name`),
      db.execute(sql`SELECT id, username, role FROM users ORDER BY username`),
      db.execute(sql`SELECT id, name FROM crews ORDER BY name`),
      db.execute(sql`
        SELECT id, task_id, name, location_id, project_id, task_date, status
        FROM tasks
        WHERE task_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY task_date, location_id
        LIMIT 5000
      `),
      locIds.length
        ? db.execute(sql`SELECT * FROM budget_line_items WHERE location_id = ANY(${locIds}::int[])`)
        : Promise.resolve({ rows: [] }),
      locIds.length
        ? db.execute(sql`SELECT * FROM tasks   WHERE location_id = ANY(${locIds}::int[])`)
        : Promise.resolve({ rows: [] }),
    ]);

    const rows = (x: any) => (Array.isArray(x) ? x : x.rows || []);

    // group by locationId for easy rendering
    const groupBy = <T extends Record<string, any>>(arr: T[], key: 'location_id') =>
      arr.reduce<Record<string, T[]>>((acc, r: any) => {
        const k = String(r[key]);
        (acc[k] ||= []).push(r);
        return acc;
      }, {});

    const budgetsByLoc = groupBy(rows(budgetsAll), "location_id");
    const tasksByLoc   = groupBy(rows(tasksAll),   "location_id");

    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.json({
      projects:   rows(projects),
      users:      rows(users),
      crews:      rows(crews),
      tasksRange: rows(tasksRange),
      budgetsByLoc,
      tasksByLoc,
    });
  } catch (e) { 
    console.error('Dashboard V2 error:', e);
    next(e); 
  }
});

export default router;