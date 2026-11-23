import {handler,requireUser,only} from '../_lib/auth.js';export default handler(async(req,res)=>{if(!only(req,res,'GET'))return;const user=await requireUser(req);res.json({user})});
