import { db } from '../../_lib/db.js';
import { ensureSchema } from '../../_lib/schema.js';
import { handler, requireUser } from '../../_lib/auth.js';

const MAX_BYTES = 1200 * 1024;
const allowed = new Set(['image/jpeg','image/png','image/webp']);
function decodeImage(dataUrl) {
  if (typeof dataUrl !== 'string') throw Object.assign(new Error('Selecciona una imagen válida.'),{status:400});
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowed.has(match[1])) throw Object.assign(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'),{status:400});
  const data = Buffer.from(match[2],'base64');
  if (!data.length || data.length > MAX_BYTES) throw Object.assign(new Error('La imagen supera el límite de 1,2 MB. Reduce su tamaño e inténtalo de nuevo.'),{status:413});
  return { contentType: match[1], data };
}
export default handler(async(req,res)=>{
  await ensureSchema();
  const me=await requireUser(req);
  if(!['owner','admin','technician'].includes(me.role))return res.status(403).json({error:'No tienes permisos.'});
  const orderId=req.query.id;
  const [order]=await db()`select id,assigned_to from service_orders where id=${orderId} and organization_id=${me.organization_id}`;
  if(!order)return res.status(404).json({error:'Orden no encontrada.'});
  if(me.role==='technician'&&order.assigned_to!==me.id)return res.status(403).json({error:'Esta orden no está asignada a tu usuario.'});
  if(req.method==='GET'){
    const files=await db()`select id,file_name,content_type,file_size,source,created_at,uploaded_by from order_attachments where order_id=${orderId} order by created_at desc`;
    return res.json({attachments:files});
  }
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Método no permitido.'})}
  const {data_url,file_name}=req.body||{};
  const image=decodeImage(data_url);
  const name=typeof file_name==='string'?file_name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100):'evidencia';
  const result=await db().begin(async tx=>{
    const [file]=await tx`insert into order_attachments(order_id,uploaded_by,source,file_name,content_type,file_size,file_data) values(${orderId},${me.id},'staff',${name},${image.contentType},${image.data.length},${image.data}) returning id,file_name,content_type,file_size,source,created_at`;
    const [current]=await tx`select status from service_orders where id=${orderId}`;
    await tx`insert into order_history(order_id,changed_by,status,event_type,details) values(${orderId},${me.id},${current.status},'evidence',${tx.json({file_id:file.id,file_name:name,source:'staff'})})`;
    return file;
  });
  return res.status(201).json({attachment:result});
});
