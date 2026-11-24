import { db } from '../../../_lib/db.js';
import { ensureSchema } from '../../../_lib/schema.js';
import { handler, requireUser } from '../../../_lib/auth.js';
export default handler(async(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método no permitido.'})}
  await ensureSchema();const me=await requireUser(req);
  const [file]=await db()`select a.file_name,a.content_type,a.file_data,o.organization_id,o.assigned_to from order_attachments a join service_orders o on o.id=a.order_id where a.id=${req.query.attachmentId} and o.id=${req.query.id}`;
  if(!file||file.organization_id!==me.organization_id)return res.status(404).json({error:'Archivo no encontrado.'});
  if(me.role==='technician'&&file.assigned_to!==me.id)return res.status(403).json({error:'No tienes permisos.'});
  if(!['owner','admin','technician'].includes(me.role))return res.status(403).json({error:'No tienes permisos.'});
  res.setHeader('Content-Type',file.content_type);res.setHeader('Content-Disposition','inline; filename="'+file.file_name.replace(/"/g,'')+'"');res.setHeader('Cache-Control','private, no-store');return res.status(200).send(file.file_data);
});
