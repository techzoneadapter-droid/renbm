import { requireStaff, requireAdmin, requireBmScope } from './_auth.js';
import { db, audit, idempotencyKey } from './_db.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['admin','employee']);

export default async function handler(req, res) {
  const actor = requireStaff(req,res); if (!actor) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireAdmin(actor,res)) return;
  const bmId = String(req.body?.bm_id || ''); if (!requireBmScope(req,res,bmId)) return;
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (/^https?:\/\//i.test(email) || !EMAIL.test(email)) return res.status(400).json({ error: 'valid_email_required_gmail_urls_rejected' });
  const role = String(req.body?.role || 'admin'); if (!ROLES.has(role)) return res.status(400).json({ error: 'role_not_allowed' });
  const key = idempotencyKey(req); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
  try {
    const { data: bm } = await db().from('bm_inventory').select('id,provider_state').eq('id',bmId).single();
    if (!bm || !['active','ready'].includes(bm.provider_state)) return res.status(409).json({ error: 'bm_provider_state_not_ready' });
    const { data, error } = await db().from('admin_invitations').upsert({ bm_id: bmId, email, requested_role: role, requested_by: actor.id, idempotency_key: key, state: 'queued', provider_capability: 'needs_verification' }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select().single();
    if (error) throw error; await audit(actor,'admin_invitation.enqueue','bm',bmId,'accepted',null,{ email, role }); return res.status(202).json(data);
  } catch (error) { return res.status(500).json({ error: 'internal_error', class: error.code || 'internal' }); }
}
