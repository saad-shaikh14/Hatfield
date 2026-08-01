import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'https://hatfieldhome.co.uk',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { app_id, domain_ratings, strengths, development_areas, outcome, interviewer_name } = await req.json()

    if (!app_id || !outcome || !interviewer_name) {
      return new Response(JSON.stringify({ error: 'app_id, outcome and interviewer_name are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Scorecard assesses the candidate overall, not a specific MCQ attempt —
    // always write to the current (non-superseded) row.
    const { data: existing } = await supabase
      .from('hatfield_competency_results')
      .select('id')
      .eq('application_id', app_id)
      .is('superseded_at', null)
      .maybeSingle()

    const fields = {
      domain_ratings: domain_ratings || {},
      strengths: strengths || null,
      development_areas: development_areas || null,
      outcome,
      interviewer_name,
      completed_at: new Date().toISOString(),
    }

    let writeErr
    if (existing) {
      ;({ error: writeErr } = await supabase
        .from('hatfield_competency_results')
        .update(fields)
        .eq('id', existing.id))
    } else {
      ;({ error: writeErr } = await supabase
        .from('hatfield_competency_results')
        .insert({ application_id: app_id, attempt_number: 1, ...fields }))
    }

    if (writeErr) {
      return new Response(JSON.stringify({ error: writeErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
