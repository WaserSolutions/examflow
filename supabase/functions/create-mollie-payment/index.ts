import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const APP_URL = 'https://examflowapp.waser.solutions/'
const WEBHOOK_URL = 'https://lhuwbhrhipjzjjfatgxj.supabase.co/functions/v1/mollie-webhook'
const ALLOWED_ORIGIN = 'https://examflowapp.waser.solutions'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Simple in-memory rate limiting (per IP, max 5 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 })
    return false
  }
  entry.count++
  return entry.count > 5
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Check origin
  const origin = req.headers.get('origin')
  if (origin && origin !== ALLOWED_ORIGIN) {
    return new Response('Forbidden', { status: 403 })
  }

  // Rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuche es in einer Minute erneut.' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { email } = await req.json()

    // Email validation
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MOLLIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { currency: 'CHF', value: '19.00' },
        description: 'ExamFlow – Einmalige Lizenz',
        redirectUrl: `${APP_URL}?payment=success`,
        webhookUrl: WEBHOOK_URL,
        metadata: { email },
      }),
    })

    const payment = await res.json()

    if (payment.status === 401 || payment.status === 422 || !payment._links?.checkout) {
      return new Response(JSON.stringify({ error: payment.detail || 'Zahlung konnte nicht erstellt werden.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ checkoutUrl: payment._links.checkout.href }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Interner Fehler.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
