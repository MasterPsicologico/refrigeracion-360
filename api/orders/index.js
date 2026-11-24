import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler, requireUser, admin, only } from '../_lib/auth.js';

export default handler(async (req, res) => {
  await ensureSchema();
  const me = await requireUser(req);
  if (req.method === 'GET') {
    if (!['owner','admin','technician'].includes(me.role)) return res.status(403).json({ error: 'No tienes permisos.' });
    const rows = await db()`
      select o.*, u.full_name as assigned_to_name
      from service_orders o
      left join users u on u.id = o.assigned_to
      where o.organization_id = ${me.organization_id}
        and (${me.role !== 'technician'} or o.assigned_to = ${me.id})
      order by o.created_at desc
    `;
    return res.json({ orders: rows });
  }
  if (!only(req, res, 'POST')) return;
  await admin(me);
  const { customer_name, phone, address, equipment, service_type, description, scheduled_at, quoted_amount } = req.body || {};
  if (!customer_name || !phone || !address || !description) {
    return res.status(400).json({ error: 'Completa los datos obligatorios.' });
  }
  const [order] = await db()`
    insert into service_orders
      (organization_id,customer_name,phone,address,equipment,service_type,description,scheduled_at,quoted_amount,created_by)
    values
      (${me.organization_id},${customer_name},${phone},${address},${equipment || 'Equipo'},${service_type || 'Reparación'},${description},${scheduled_at || null},${Number(quoted_amount) || 0},${me.id})
    returning *
  `;
  await db()`
    insert into order_history(order_id,changed_by,status,event_type,details)
    values(${order.id},${me.id},${order.status},'created',${db().json({ source: 'admin' })})
  `;
  return res.status(201).json({ order });
});
