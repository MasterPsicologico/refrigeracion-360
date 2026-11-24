import { createHash } from 'node:crypto';
import { db } from '../_lib/db.js';
import { ensureSchema } from '../_lib/schema.js';
import { handler } from '../_lib/auth.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const MAX_BYTES=1200*1024;
export default handler(async(req,res)=>{
  await ensureSchema();
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Método no permitido.'})}
  const {token,data_url,file_name}=req.body||{};
  if(typeof token!=='string'||token.length<30||token.length>100)return res.status(400).json({error:'Enlace de seguimiento inválido.'});
  const match=typeof data_url==='string'&&data_url.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!match)return res.status(400).json({error:'Solo se permiten imágenes JPG, PNG o WEBP.'});
  const data=Buffer.from(match[2],'base64');
  if(!data.length||data.length>MAX_BYTES)return res.status(413).json({error:'La imagen supera el límite de 1,2 MB.'});
  const [order]=await db()`select id,status from service_orders where tracking_token_hash=${hash(token)} limit 1`;
  if(!order)return res.status(404).json({error:'Solicitud no encontrada.'});
  const name=typeof file_name==='string'?file_name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100):'evidencia-cliente';
  const file=await db().begin(async tx=>{
    const [count] = await tx`select count(*)::int as total from order_attachments where order_id=${order.id}`;
    if(count.total>=10)throw Object.assign(new Error('Esta solicitud alcanzó el límite de 10 fotos.'),{status:400});
    const [saved]=await tx`insert into order_attachments(order_id,source,file_name,content_type,file_size,file_data) values(${order.id},'customer',${name},${match[1]},${data.length},${data}) returning id,file_name,content_type,file_size,source,created_at`;
    await tx`insert into order_history(order_id,changed_by,status,event_type,details) values(${order.id},null,${order.status},'evidence',${tx.json({file_id:saved.id,file_name:name,source:'customer'})})`;
    return saved;
  });
  return res.status(201).json({attachment:file});
});
