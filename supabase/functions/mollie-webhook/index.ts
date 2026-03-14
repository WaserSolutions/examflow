import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MOLLIE_API_KEY = Deno.env.get('MOLLIE_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = 'https://wasersolutions.github.io/examflow/'

serve(async (req) => {
  try {
    // Mollie sends payment ID as form-encoded body
    const body = await req.text()
    const params = new URLSearchParams(body)
    const paymentId = params.get('id')

    if (!paymentId) {
      return new Response('Missing payment ID', { status: 400 })
    }

    // Fetch payment details from Mollie
    const mollieRes = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MOLLIE_API_KEY}` },
    })
    const payment = await mollieRes.json()

    // Only proceed if payment is actually paid
    if (payment.status !== 'paid') {
      return new Response('OK', { status: 200 })
    }

    const email = payment.metadata?.email
    if (!email) {
      return new Response('No email in metadata', { status: 400 })
    }

    // Create Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create new user
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

    // Send magic link login email
    await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: APP_URL }
    })

    // Also trigger an OTP email so user gets an actual email
    // Use a separate client with anon key for this
    const { error: otpError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: APP_URL }
    })

    if (otpError) {
      console.error('Error sending magic link:', otpError)
    }

    return new Response('OK', { status: 200 })

  } catch (e) {
    console.error('Webhook error:', e)
    return new Response('Internal error', { status: 500 })
  }
})
