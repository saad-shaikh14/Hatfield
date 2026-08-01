import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'https://hatfieldhome.co.uk',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { token } = await req.json().catch(() => ({ token: null }))

  if (!token) {
    return new Response(JSON.stringify({ valid: false, reason: 'missing_token' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: app, error } = await supabase
    .from('hatfield_applications')
    .select('first_name, role_applied, status')
    .eq('token', token)
    .single()

  if (error || !app) {
    return new Response(JSON.stringify({ valid: false, reason: 'not_found' }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    valid: true,
    firstName: app.first_name,
    roleApplied: app.role_applied,
    status: app.status,
  }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
