import { createHash } from 'node:crypto';
import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler, only } from '../_lib/auth.js';

const hash = value => createHash('sha256').update(value).digest('hex');
export default handler(async (req, res) => {
  if (!only(req, res, 'GET')) return;
  await ensureSchema();
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (token.length < 30 || token.length > 100) return res.status(400).json({ error: 'Código de seguimiento inválido.' });
  const [order] = await db()`
    select id, customer_name, equipment, service_type, description, status, created_at, updated_at
    from service_orders where tracking_token_hash = ${hash(token)} limit 1
  `;
  if (!order) return res.status(404).json({ error: 'No encontramos una solicitud con ese enlace de seguimiento.' });
  const history = await db()`
    select status, created_at from order_history where order_id = ${order.id} order by created_at asc
  `;
  res.json({ request: { ...order, code: 'R360-' + order.id.slice(0, 8).toUpperCase() }, history });
});
