import { createHash, randomBytes } from 'node:crypto';
import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler, only } from '../_lib/auth.js';

const hash = value => createHash('sha256').update(value).digest('hex');
export default handler(async (req, res) => {
  if (!only(req, res, 'POST')) return;
  await ensureSchema();
  const { customer_name, phone, address, equipment, description } = req.body || {};
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const name = clean(customer_name), contact = clean(phone), place = clean(address);
  const device = clean(equipment), problem = clean(description);
  if (name.length < 2 || contact.length < 6 || place.length < 5 || device.length < 2 || problem.length < 10) {
    return res.status(400).json({ error: 'Revisa los datos: completa nombre, contacto, dirección, equipo y una descripción de al menos 10 caracteres.' });
  }
  if ([name, contact, place, device, problem].some(v => v.length > 1200)) {
    return res.status(400).json({ error: 'Uno de los campos supera el límite permitido.' });
  }
  const [organization] = await db()`select id from organizations order by created_at asc limit 1`;
  if (!organization) return res.status(503).json({ error: 'El sistema aún no está configurado. Inténtalo más tarde.' });
  const token = randomBytes(32).toString('base64url');
  const [order] = await db()`
    insert into service_orders
      (organization_id, customer_name, phone, address, equipment, description, quoted_amount, status, tracking_token_hash)
    values
      (${organization.id}, ${name}, ${contact}, ${place}, ${device}, ${problem}, 0, 'Pendiente', ${hash(token)})
    returning id, status, created_at
  `;
  await db()`insert into order_history(order_id, changed_by, status) values(${order.id}, null, 'Pendiente')`;
  res.status(201).json({ request: { id: order.id, code: 'R360-' + order.id.slice(0, 8).toUpperCase(), status: order.status, created_at: order.created_at }, tracking_token: token });
});
