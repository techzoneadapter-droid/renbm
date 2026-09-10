import { createClient } from '@supabase/supabase-js';
import { createBusiness, inviteAdmin, shareAdAccountToPartner } from '../api/_metaMutations.js';

const db = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth:{persistSession:false} });
const cap = () => Math.max(1, Math.min(10, Number(process.env.MAX_BM_CREATE_RATE_PER_MINUTE || 3)));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const retryable = e => e?.transient === true || e?.status === 429 || e?.status >= 500;
async function withRetry(fn, budget=3) { let last; for(let i=0;i<budget;i++){ try{return await fn();}catch(e){last=e;if(!retryable(e))throw e;await sleep(Math.min(30000,500*2**i+Math.floor(Math.random()*250)));}} throw last; }

async function processBatch(job) {
  await db.from('bm_batch_jobs').update({state:'running',started_at:new Date().toISOString()}).eq('id',job.id).eq('state','queued');
  const delay = Math.ceil(60000 / cap());
  for(let n=1;n<=job.quantity;n++) {
    const { data: fresh } = await db.from('bm_batch_jobs').select('state').eq('id',job.id).single(); if(!fresh || fresh.state!=='running') break;
    const itemKey = `${job.id}:${n}`;
    const { data:item } = await db.from('bm_batch_items').upsert({job_id:job.id,item_no:n,idempotency_key:itemKey,state:'running'},{onConflict:'idempotency_key',ignoreDuplicates:true}).select().single();
    try { const result=await withRetry(()=>createBusiness({name:job.naming_template.replace('{n}',String(n))})); await db.from('bm_batch_items').update({state:'completed',provider_reference:result?.id||null}).eq('id',item.id); }
    catch(e){ await db.from('bm_batch_items').update({state:'failed',error_class:e.code||'provider_error',reconcile_required:true}).eq('id',item?.id); }
    await db.from('bm_batch_jobs').update({processed_count:n,updated_at:new Date().toISOString()}).eq('id',job.id); await sleep(delay);
  }
}

export async function runOnce() {
  const { data:jobs }=await db.from('bm_batch_jobs').select('*').eq('state','queued').order('created_at').limit(1); if(jobs?.[0]) await processBatch(jobs[0]);
  const { data:invites }=await db.from('admin_invitations').select('*').eq('state','queued').limit(10); for(const x of invites||[]){try{await withRetry(()=>inviteAdmin(x));await db.from('admin_invitations').update({state:'completed'}).eq('id',x.id);}catch(e){await db.from('admin_invitations').update({state:'failed',error_class:e.code||'provider_error'}).eq('id',x.id);}}
  const { data:shares }=await db.from('partner_share_items').select('*,partner_share_jobs(*)').eq('state','queued').limit(10); for(const x of shares||[]){try{await withRetry(()=>shareAdAccountToPartner(x));await db.from('partner_share_items').update({state:'completed'}).eq('id',x.id);}catch(e){await db.from('partner_share_items').update({state:'failed',error_class:e.code||'provider_error',reconcile_required:true}).eq('id',x.id);}}
}

if (process.argv[1]?.endsWith('bm-job-worker.js')) runOnce().catch(e=>{console.error('worker_error',e.code||e.message);process.exitCode=1;});
