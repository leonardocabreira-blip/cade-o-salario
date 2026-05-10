export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { userId, userEmail } = req.body
  try {
    const response = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        preapproval_plan_id: null,
        reason: 'Mapa de Gastos Premium',
        external_reference: userId,
        payer_email: userEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 9.90,
          currency_id: 'BRL'
        },
        back_url: 'https://mapa-de-gastos.vercel.app',
        status: 'pending'
      })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || 'Erro MP')
    res.status(200).json({ init_point: data.init_point })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
