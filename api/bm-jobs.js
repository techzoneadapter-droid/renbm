import { requireStaff, requireAdmin } from './_auth.js';
import { db, audit, idempotencyKey } from './_db.js';

const STATES = new Set(['queued','running','paused','completed','failed','cancelled']);
const transitions = { queued: ['paused','cancelled'], running: ['paused','cancelled'], paused: ['queued','cancelled'] };
const clamp = n => Math.max(1, Math.min(Number(process.env.MAX_BM_CREATE_RATE_PER_MINUTE || 3), Number(n || 1)));

export default async function handler(req, res) {
  const actor = requireStaff(req, res); if (!actor) return;
  try {
    if (req.method === 'GET') {
      const { data, error } = await db().from('bm_batch_jobs').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error; return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      if (!requireAdmin(actor, res)) return;
      const key = idempotencyKey(req); if (!key) return res.status(400).json({ error: 'idempotency_key_required' });
      const quantity = Math.max(1, Math.min(100, Number(req.body?.quantity || 0)));
      const namingTemplate = String(req.body?.naming_template || 'BM-{n}').slice(0,120);
      const requestedRate = clamp(req.body?.rate_per_minute);
      const { data, error } = await db().from('bm_batch_jobs').upsert({ requested_by: actor.id, idempotency_key: key, quantity, naming_template: namingTemplate, requested_rate_per_minute: requestedRate, state: 'queued' }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select().single();
      if (error) throw error;
      await audit(actor,'bm_batch.enqueue','bm_batch_job',data?.id,'accepted',null,{ quantity, requestedRate });
      return res.status(202).json(data);
    }
    if (req.method === 'PATCH') {
      if (!requireAdmin(actor, res)) return;
      const id = String(req.body?.id || ''); const action = String(req.body?.action || '');
      const { data: job, error } = await db().from('bm_batch_jobs').select('*').eq('id', id).single(); if (error) throw error;
      if (!STATES.has(job.state) || !transitions[job.state]?.includes(action === 'resume' ? 'queued' : action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : '')) return res.status(409).json({ error: 'invalid_transition' });
      const state = action === 'resume' ? 'queued' : action === 'cancel' ? 'cancelled' : 'paused';
      const { data, error: updateError } = await db().from('bm_batch_jobs').update({ state, updated_at: new Date().toISOString() }).eq('id', id).select().single(); if (updateError) throw updateError;
      await audit(actor,`bm_batch.${action}`,'bm_batch_job',id,'accepted'); return res.status(200).json(data);
    }
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) { res.status(500).json({ error: 'internal_error', class: error.code || 'internal' }); }
}
