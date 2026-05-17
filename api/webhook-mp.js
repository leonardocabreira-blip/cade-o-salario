export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body

  const supaFetch = async (path, method, body) => {
    return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: body ? JSON.stringify(body) : undefined
    })
  }

  try {
    if (type === 'subscription_preapproval') {
      const mpRes = await fetch(
        `https://api.mercadopago.com/preapproval/${data.id}`,
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      )
      const subscription = await mpRes.json()
      const userId = subscription.external_reference
      const status = subscription.status

      if (status === 'authorized') {
        const expira = new Date()
        expira.setDate(expira.getDate() + 31)
        await supaFetch(
          `profiles?id=eq.${userId}`,
          'PATCH',
          { plano: 'premium', plano_expira_em: expira.toISOString() }
        )
        await supaFetch('assinaturas', 'POST', {
          user_id: userId,
          mp_subscription_id: data.id,
          status: 'ativo',
          valor: subscription.auto_recurring?.transaction_amount,
          atualizado_em: new Date().toISOString()
        })
      }

      if (status === 'cancelled' || status === 'paused') {
        await supaFetch(
          `profiles?id=eq.${userId}`,
          'PATCH',
          { plano: 'gratuito', plano_expira_em: null }
        )
      }
    }

    if (type === 'payment') {
      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${data.id}`,
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      )
      const payment = await mpRes.json()

      if (payment.status === 'approved' && payment.payment_method_id === 'pix') {
        const userId = payment.external_reference
        const expira = new Date()
        expira.setDate(expira.getDate() + 30)
        await supaFetch(
          `profiles?id=eq.${userId}`,
          'PATCH',
          { plano: 'premium', plano_expira_em: expira.toISOString() }
        )
        await supaFetch('assinaturas', 'POST', {
          user_id: userId,
          mp_payment_id: String(data.id),
          status: 'ativo',
          valor: payment.transaction_amount,
          atualizado_em: new Date().toISOString()
        })
      }
    }
  } catch (e) {
    console.error('Webhook error:', e.message)
  }

  res.status(200).json({ received: true })
}
