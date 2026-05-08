import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body

  if (type === 'subscription_preapproval') {
    const subscriptionId = data.id

    const mpRes = await fetch(
      `https://api.mercadopago.com/preapproval/${subscriptionId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    )
    const subscription = await mpRes.json()

    const userId = subscription.external_reference
    const status = subscription.status

    if (status === 'authorized') {
      const expira = new Date()
      expira.setDate(expira.getDate() + 31)

      await supabase
        .from('profiles')
        .update({ 
          plano: 'premium',
          plano_expira_em: expira.toISOString()
        })
        .eq('id', userId)

      await supabase.from('assinaturas').upsert({
        user_id: userId,
        mp_subscription_id: subscriptionId,
        status: 'ativo',
        valor: subscription.auto_recurring.transaction_amount,
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'mp_subscription_id' })
    }

    if (status === 'cancelled' || status === 'paused') {
      await supabase
        .from('profiles')
        .update({ plano: 'gratuito', plano_expira_em: null })
        .eq('id', userId)

      await supabase.from('assinaturas').upsert({
        user_id: userId,
        mp_subscription_id: subscriptionId,
        status: 'cancelado',
        atualizado_em: new Date().toISOString()
      }, { onConflict: 'mp_subscription_id' })
    }
  }

  if (type === 'payment') {
    const paymentId = data.id

    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    )
    const payment = await mpRes.json()

    if (payment.status === 'approved' && payment.payment_method_id === 'pix') {
      const userId = payment.external_reference
      const expira = new Date()
      expira.setDate(expira.getDate() + 30)

      await supabase
        .from('profiles')
        .update({ 
          plano: 'premium',
          plano_expira_em: expira.toISOString()
        })
        .eq('id', userId)

      await supabase.from('assinaturas').insert({
        user_id: userId,
        mp_payment_id: String(paymentId),
        status: 'ativo',
        valor: payment.transaction_amount,
        atualizado_em: new Date().toISOString()
      })
    }
  }

  res.status(200).json({ received: true })
}
