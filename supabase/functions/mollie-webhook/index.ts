import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = 'https://examflowapp.waser.solutions/'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    const paymentId = params.get('id')

    // Validate payment ID format (Mollie IDs are tr_ followed by alphanumeric)
    if (!paymentId || !/^tr_[a-zA-Z0-9]+$/.test(paymentId)) {
      return new Response('Invalid payment ID', { status: 400 })
    }

    // Verify payment with Mollie API (this IS the authentication:
    // only real Mollie payments will return valid data with our API key)
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}` },
    })

    if (!mollieRes.ok) {
      return new Response('Payment not found', { status: 400 })
    }

    const payment = await mollieRes.json()

    // Only proceed if payment is actually paid
    if (payment.status !== 'paid') {
      return new Response('OK', { status: 200 })
    }

    const email = payment.metadata?.email
    if (!email || !email.includes('@')) {
      return new Response('No valid email in metadata', { status: 400 })
    }

    // Verify amount matches expected price
    if (payment.amount?.value !== '19.00' || payment.amount?.currency !== 'CHF') {
      return new Response('Invalid payment amount', { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if this payment was already processed (idempotency)
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .eq('mollie_payment_id', paymentId)
      .maybeSingle()

    if (existingPayment) {
      return new Response('OK', { status: 200 })
    }

    // Find user by email efficiently
    const { data: userList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      filter: email
    })
    // Exact match guard (filter is fuzzy text search)
    const existingUser = userList?.users?.find(u => u.email === email)

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      })

      if (createError || !newUser.user) {
        console.error('Error creating user:', createError)
        return new Response('Error creating user', { status: 500 })
      }
      userId = newUser.user.id
    }

    // Record payment
    await supabase.from('payments').upsert({
      user_id: userId,
      email,
      mollie_payment_id: paymentId,
      amount: 19.00,
      currency: 'CHF',
      status: 'paid',
    }, { onConflict: 'mollie_payment_id' })

    return new Response('OK', { status: 200 })

  } catch (e) {
    console.error('Webhook error:', e)
    return new Response('Internal error', { status: 500 })
  }
})
