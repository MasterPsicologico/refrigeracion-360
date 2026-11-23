import {handler,clearSession,only} from '../_lib/auth.js';export default handler(async(req,res)=>{if(!only(req,res,'POST'))return;clearSession(res);res.json({ok:true})});
