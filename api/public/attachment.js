import { createHash } from 'node:crypto';
import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler } from '../_lib/auth.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
export default handler(async(req,res)=>{
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Método no permitido.'})}
  await ensureSchema();const token=typeof req.query.token==='string'?req.query.token:'';
  if(token.length<30||token.length>100)return res.status(400).json({error:'Enlace inválido.'});
  const [file]=await db()`select a.file_name,a.content_type,a.file_data from order_attachments a join service_orders o on o.id=a.order_id where a.id=${req.query.attachment_id} and o.tracking_token_hash=${hash(token)}`;
  if(!file)return res.status(404).json({error:'Imagen no encontrada.'});
  res.setHeader('Content-Type',file.content_type);res.setHeader('Content-Disposition','inline; filename="'+file.file_name.replace(/"/g,'')+'"');res.setHeader('Cache-Control','private, no-store');return res.status(200).send(file.file_data);
});
