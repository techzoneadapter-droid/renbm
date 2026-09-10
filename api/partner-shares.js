import crypto from 'node:crypto';
import { requireStaff, requireAdmin, requireBmScope } from './_auth.js';
import { db, audit, idempotencyKey } from './_db.js';

const numericId = v => /^\d{3,30}$/.test(String(v || ''));
const canonical = obj => JSON.stringify(obj, Object.keys(obj).sort());
const hash = obj => crypto.createHash('sha256').update(canonical(obj)).digest('hex');
function seededSort(ids, seed) { return [...ids].sort((a,b) => hash({seed,id:a}).localeCompare(hash({seed,id:b}))); }

async function buildPreview(body) {
  const sourceBm = String(body.source_bm_id || ''); const partnerId = String(body.partner_business_id || '');
  if (!numericId(partnerId)) throw Object.assign(new Error('invalid_partner_business_id'),{status:400});
  const explicit = Array.isArray(body.ad_account_ids) ? [...new Set(body.ad_account_ids.map(String))] : [];
  const { data: owned, error } = await db().from('ad_account_inventory').select('id').eq('bm_id',sourceBm).eq('share_eligible',true); if (error) throw error;
  const ownedIds = (owned || []).map(x => String(x.id));
  let selected;
  if (explicit.length) { if (explicit.some(id => !ownedIds.includes(id))) throw Object.assign(new Error('ad_account_scope_denied'),{status:403}); selected = explicit.sort(); }
  else { const count = Math.max(1, Math.min(ownedIds.length, Number(body.random_count || 0))); if (!count) throw Object.assign(new Error('selection_required'),{status:400}); const seed = hash({sourceBm,partnerId,snapshot:[...ownedIds].sort()}); selected = seededSort(ownedIds,seed).slice(0,count); }
  const payload = { source_bm_id: sourceBm, partner_business_id: partnerId, ad_account_ids: selected };
  return { ...payload, preview_hash: hash(payload) };
}

export default async function handler(req,res) {
  const actor = requireStaff(req,res); if (!actor) return;
  if (req.method !== 'POST') return res.status(405).json({error:'method_not_allowed'});
  if (!requireAdmin(actor,res)) return;
  const bmId = String(req.body?.source_bm_id || ''); if (!requireBmScope(req,res,bmId)) return;
  try {
    const preview = await buildPreview(req.body || {});
    if (!req.body?.confirm) return res.status(200).json({ preview, capability:'needs_verification' });
    if (String(req.body.preview_hash || '') !== preview.preview_hash) return res.status(409).json({error:'preview_changed_repreview_required',preview});
    const key = idempotencyKey(req); if (!key) return res.status(400).json({error:'idempotency_key_required'});
    const { data, error } = await db().from('partner_share_jobs').upsert({ source_bm_id: preview.source_bm_id, partner_business_id: preview.partner_business_id, requested_by: actor.id, idempotency_key:key, preview_hash:preview.preview_hash, preview_payload:preview, state:'queued', provider_capability:'needs_verification' },{onConflict:'idempotency_key',ignoreDuplicates:true}).select().single(); if(error) throw error;
    await db().from('partner_share_items').upsert(preview.ad_account_ids.map(id=>({job_id:data.id,ad_account_id:id,state:'queued'})),{onConflict:'job_id,ad_account_id',ignoreDuplicates:true});
    await audit(actor,'partner_share.enqueue','partner_share_job',data.id,'accepted',null,{sourceBm:bmId,count:preview.ad_account_ids.length}); return res.status(202).json(data);
  } catch(error) { return res.status(error.status || 500).json({error:error.status ? error.message : 'internal_error',class:error.code || 'internal'}); }
}
