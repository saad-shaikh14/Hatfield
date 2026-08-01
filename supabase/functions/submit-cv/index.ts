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

  try {
    const form = await req.formData()
    const firstName  = form.get('firstName')  as string
    const lastName   = form.get('lastName')   as string
    const phone      = form.get('phone')      as string
    const email      = form.get('email')      as string
    const role       = form.get('role')       as string
    const cvFile     = form.get('cv')         as File | null

    if (!firstName || !lastName || !phone || !email || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Upload CV to storage
    let cvUrl: string | null = null
    if (cvFile && cvFile.size > 0) {
      const ext      = cvFile.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('cvs')
        .upload(fileName, cvFile, { contentType: cvFile.type })
      if (uploadErr) throw uploadErr
      cvUrl = fileName
    }

    // Insert application row
    const { data: app, error: insertErr } = await supabase
      .from('hatfield_applications')
      .insert({ first_name: firstName, last_name: lastName, phone, email, role_applied: role, cv_url: cvUrl })
      .select('id, token')
      .single()
    if (insertErr) throw insertErr

    const formLink = `https://hatfieldhome.co.uk/apply#token=${app.token}`

    // Send Form 1 email to candidate via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'HatfieldHome <noreply@hatfieldhome.co.uk>',
        to: email,
        subject: 'Next Step — Complete Your Application | HatfieldHome',
        html: buildCandidateEmail(firstName, role, formLink),
      }),
    })
    if (!emailRes.ok) {
      const err = await emailRes.text()
      console.error('Resend error:', err)
    }

    // Notify HR
    const hrEmailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'HatfieldHome Portal <noreply@hatfieldhome.co.uk>',
        to: 'Info@hatfieldhome.co.uk',
        subject: `New CV Received — ${firstName} ${lastName} (${role})`,
        html: buildHrEmail(firstName, lastName, email, phone, role),
      }),
    })
    if (!hrEmailRes.ok) {
      console.error('Resend HR notification failed (submit-cv):', await hrEmailRes.text())
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

function logoHtml(): string {
  return `<span style="font-family:'Gilda Display',Georgia,serif;font-size:1.3rem;color:#1a1612">Hatfield<span style="color:#c8785a">Home</span></span>`
}

function buildCandidateEmail(name: string, role: string, link: string): string {
  return `
  <div style="font-family:Jost,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#faf8f5;padding:20px 28px;border-bottom:3px solid #c8785a">
      ${logoHtml()}
    </div>
    <div style="padding:32px 28px">
      <h2 style="color:#1a1612;margin:0 0 16px">Thank you, ${name}</h2>
      <p style="color:#4a4440;line-height:1.7">We have received your CV for the <strong>${role}</strong> role and would like to invite you to complete your full application.</p>
      <p style="color:#4a4440;line-height:1.7">Please click the button below to complete your application form. The link is valid for <strong>7 days</strong>.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="${link}" style="background:#c8785a;color:#fff;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">Complete My Application</a>
      </div>
      <p style="color:#9a928c;font-size:13px">If the button doesn't work, copy this link into your browser:<br><a href="${link}" style="color:#c8785a">${link}</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
      <p style="color:#9a928c;font-size:12px;margin:0">HatfieldHome &middot; Hatfield, Hertfordshire<br>+44 7435 412396 &middot; Info@hatfieldhome.co.uk</p>
    </div>
  </div>`
}

function buildHrEmail(first: string, last: string, email: string, phone: string, role: string): string {
  return `
  <div style="font-family:Jost,Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden">
    <div style="background:#faf8f5;padding:20px 28px;border-bottom:3px solid #c8785a">
      ${logoHtml()}
    </div>
    <div style="padding:32px 28px">
      <h2 style="color:#1a1612;margin:0 0 16px">New CV Received</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;color:#9a928c;width:120px">Name</td><td style="color:#1a1612;font-weight:600">${first} ${last}</td></tr>
        <tr><td style="padding:8px 0;color:#9a928c">Role</td><td style="color:#1a1612;font-weight:600">${role}</td></tr>
        <tr><td style="padding:8px 0;color:#9a928c">Email</td><td style="color:#1a1612">${email}</td></tr>
        <tr><td style="padding:8px 0;color:#9a928c">Phone</td><td style="color:#1a1612">${phone}</td></tr>
      </table>
      <p style="color:#4a4440;line-height:1.7;margin-top:20px">Form 1 link has been automatically sent to the candidate. You will be notified again once they complete it.</p>
      <div style="text-align:center;margin:28px 0">
        <a href="https://hatfieldhome.co.uk/portal" style="background:#1a1612;color:#faf8f5;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">View in Admin Panel</a>
      </div>
    </div>
  </div>`
}
