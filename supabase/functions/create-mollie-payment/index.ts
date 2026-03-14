import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const APP_URL = 'https://examflowapp.waser.solutions/'
const WEBHOOK_URL = 'https://lhuwbhrhipjzjjfatgxj.supabase.co/functions/v1/mollie-webhook'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    if (!email || !email.includes('@')) {
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
