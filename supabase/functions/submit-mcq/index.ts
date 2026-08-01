import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'https://hatfieldhome.co.uk',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// #############################################################################
// # TODO — BLOCKING, DO NOT GO LIVE WITH THIS FILE AS-IS.
// #
// # This question bank, answer key, section list, and pass threshold are
// # PLACEHOLDERS ONLY, copied in shape (not content) from trust_us's adult
// # domiciliary/complex-care competency test. HatfieldHome is an Ofsted-
// # regulated children's/young-people's residential care provider — its real
// # competency test needs safeguarding-of-children, EBD, and residential-care
// # content authored or reviewed by whoever owns Hatfield's Ofsted compliance
// # policy. Do not let this ship to real candidates unedited.
// #############################################################################
const ANSWER_KEY = ['a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a','a']

const SECTIONS = [
  { key: 'placeholder_1', name: 'PLACEHOLDER — Safeguarding & Child Protection',      idx: [0,1,2,3] },
  { key: 'placeholder_2', name: 'PLACEHOLDER — Behaviour Support & De-escalation',    idx: [4,5,6,7] },
  { key: 'placeholder_3', name: 'PLACEHOLDER — Health, Medication & Risk',            idx: [8,9,10,11] },
  { key: 'placeholder_4', name: 'PLACEHOLDER — Emergency Situations & Health/Safety', idx: [12,13,14] },
  { key: 'placeholder_5', name: 'PLACEHOLDER — Communication & Professional Conduct', idx: [15,16,17,18,19] },
]

const PASS_THRESHOLD = 12 // out of 20 — placeholder, confirm real threshold with Hatfield

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const { token, answers } = await req.json()

    if (!token || !Array.isArray(answers) || answers.length !== 20) {
      return new Response(JSON.stringify({ error: 'token and 20 answers required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: app, error: fetchErr } = await supabase
      .from('hatfield_applications')
      .select('id, first_name, last_name, email, role_applied, status')
      .eq('token', token)
      .single()

    if (fetchErr || !app) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (app.status !== 'interview_invited') {
      return new Response(JSON.stringify({ error: 'Test is only available after interview invite' }), {
        status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Score server-side
    let totalScore = 0
    const section_scores: Record<string, number> = {}
    for (const s of SECTIONS) {
      let n = 0
      for (const qi of s.idx) {
        if ((answers[qi] || '').toLowerCase() === ANSWER_KEY[qi]) { totalScore++; n++ }
      }
      section_scores[s.key] = n
    }
    const passed = totalScore >= PASS_THRESHOLD

    // Find the current (non-superseded) attempt, if any — a candidate may be
    // given a second chance, in which case the previous attempt is archived
    // (superseded_at set) rather than overwritten, and a new row is inserted.
    const { data: current } = await supabase
      .from('hatfield_competency_results')
      .select('id, attempt_number, domain_ratings, strengths, development_areas, outcome, interviewer_name, completed_at')
      .eq('application_id', app.id)
      .is('superseded_at', null)
      .maybeSingle()

    if (current) {
      const { error: supersedeErr } = await supabase
        .from('hatfield_competency_results')
        .update({ superseded_at: new Date().toISOString() })
        .eq('id', current.id)
      if (supersedeErr) {
        return new Response(JSON.stringify({ error: supersedeErr.message }), {
          status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    const nextAttempt = current ? current.attempt_number + 1 : 1

    // Carry forward any existing interviewer scorecard — it assesses the
    // candidate overall, not this specific MCQ attempt, so a retake shouldn't
    // wipe it.
    const resultRow = {
      application_id: app.id,
      attempt_number: nextAttempt,
      mcq_score: totalScore,
      section_scores,
      answers,
      mcq_submitted_at: new Date().toISOString(),
      domain_ratings: current?.domain_ratings ?? {},
      strengths: current?.strengths ?? null,
      development_areas: current?.development_areas ?? null,
      outcome: current?.outcome ?? null,
      interviewer_name: current?.interviewer_name ?? null,
      completed_at: current?.completed_at ?? null,
    }
    const { error: dbErr } = await supabase.from('hatfield_competency_results').insert(resultRow)

    if (dbErr) {
      return new Response(JSON.stringify({ error: dbErr.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Email HR
    const sectionRows = SECTIONS.map(s =>
      `<tr><td style="padding:6px 0;color:#4a4440;font-size:13px">${s.name}</td><td style="color:#1a1612;font-weight:700;text-align:right;font-size:13px">${section_scores[s.key]} / ${s.idx.length}</td></tr>`
    ).join('')

    const hrEmailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'HatfieldHome Portal <noreply@hatfieldhome.co.uk>',
        to: 'Info@hatfieldhome.co.uk',
        subject: `Competency Test ${passed ? 'PASS' : 'FAIL'} — ${app.first_name} ${app.last_name} (${totalScore}/20)${nextAttempt > 1 ? ` — Attempt ${nextAttempt}` : ''}`,
        html: `<div style="font-family:Jost,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
          <div style="background:${passed ? '#82c87a' : '#c8785a'};padding:20px 28px">
            <span style="font-family:'Gilda Display',Georgia,serif;font-size:1.3rem;color:#1a1612">Hatfield<span style="color:#faf8f5">Home</span></span>
          </div>
          <div style="padding:32px 28px">
            <h2 style="color:#1a1612;margin:0 0 6px">Competency Test ${passed ? 'Passed' : 'Failed'}${nextAttempt > 1 ? ` (Attempt ${nextAttempt})` : ''}</h2>
            <p style="font-size:2rem;font-weight:800;color:${passed ? '#3d8a35' : '#c8785a'};margin:0 0 20px">${totalScore} / 20</p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px">${sectionRows}</table>
            <p style="color:#4a4440;font-size:14px;line-height:1.7">${app.first_name} ${app.last_name} &mdash; ${app.role_applied}<br>Pass threshold: ${PASS_THRESHOLD} / 20</p>
            <div style="text-align:center;margin:24px 0">
              <a href="https://hatfieldhome.co.uk/portal" style="background:#1a1612;color:#faf8f5;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">View in Portal</a>
            </div>
          </div>
        </div>`,
      }),
    })
    if (!hrEmailRes.ok) {
      console.error('Resend HR notification failed (submit-mcq):', await hrEmailRes.text())
    }

    return new Response(JSON.stringify({ success: true, score: totalScore, passed, section_scores, attempt: nextAttempt }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
