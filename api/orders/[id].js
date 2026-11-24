import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler, requireUser, admin, only } from '../_lib/auth.js';

const states = ['Pendiente','Asignado','Aceptado','En camino','En proceso','Terminado','Pagado','Cancelado'];

export default handler(async (req, res) => {
  if (!only(req, res, 'PATCH')) return;
  await ensureSchema();
  const me = await requireUser(req);
  const isAdmin = ['owner','admin'].includes(me.role);
  if (!isAdmin && me.role !== 'technician') {
    return res.status(403).json({ error: 'No tienes permisos para modificar esta orden.' });
  }

  const body = req.body || {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasAssignee = Object.prototype.hasOwnProperty.call(body, 'assigned_to');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0,1000) : '';
  if (!hasStatus && !hasAssignee && !note) {
    return res.status(400).json({ error: 'No hay cambios para guardar.' });
  }
  if (hasStatus && !states.includes(body.status)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }
  if (hasAssignee && !isAdmin) {
    return res.status(403).json({ error: 'Solo el administrador puede asignar técnicos.' });
  }

  const sql = db();
  const result = await sql.begin(async tx => {
    const [current] = await tx`
      select * from service_orders
      where id = ${req.query.id} and organization_id = ${me.organization_id}
      for update
    `;
    if (!current) return { missing: true };
    if (!isAdmin && current.assigned_to !== me.id) return { forbidden: true };

    let assignedTo = current.assigned_to;
    let assignedAt = current.assigned_at;
    if (hasAssignee) {
      assignedTo = body.assigned_to || null;
      if (assignedTo) {
        const [technician] = await tx`
          select id from users
          where id = ${assignedTo} and organization_id = ${me.organization_id}
            and role = 'technician' and active = true
        `;
        if (!technician) throw Object.assign(new Error('El técnico seleccionado no existe o no está activo.'), { status: 400 });
      }
      assignedAt = assignedTo ? (assignedTo === current.assigned_to ? current.assigned_at : new Date()) : null;
    }

    const nextStatus = hasStatus ? body.status : current.status;
    const [updated] = await tx`
      update service_orders
      set status = ${nextStatus},
          assigned_to = ${assignedTo},
          assigned_at = ${assignedAt},
          updated_at = now()
      where id = ${current.id}
      returning *
    `;

    if (hasStatus && nextStatus !== current.status) {
      await tx`
        insert into order_history(order_id, changed_by, status, event_type, details)
        values (${current.id}, ${me.id}, ${nextStatus}, 'status', ${tx.json({ from: current.status, to: nextStatus, note })})
      `;
    }
    if (hasAssignee && assignedTo !== current.assigned_to) {
      const [assignee] = assignedTo
        ? await tx`select full_name from users where id = ${assignedTo}`
        : [{ full_name: null }];
      await tx`
        insert into order_history(order_id, changed_by, status, event_type, details)
        values (${current.id}, ${me.id}, ${nextStatus}, 'assignment', ${tx.json({ from: current.assigned_to, to: assignedTo, technician_name: assignee.full_name })})
      `;
    }
    if (note) {
      await tx`
        insert into order_history(order_id, changed_by, status, event_type, details)
        values (${current.id}, ${me.id}, ${nextStatus}, 'note', ${tx.json({ note })})
      `;
    }
    return { order: updated };
  });

  if (result.missing) return res.status(404).json({ error: 'Orden no encontrada.' });
  if (result.forbidden) return res.status(403).json({ error: 'Esta orden no está asignada a tu usuario.' });
  const [order] = await db()`
    select o.*, u.full_name as assigned_to_name
    from service_orders o left join users u on u.id = o.assigned_to
    where o.id = ${req.query.id}
  `;
  return res.json({ order });
});
