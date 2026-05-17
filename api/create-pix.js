export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { userId, userEmail, userName } = req.body

  const isTest = process.env.MP_ACCESS_TOKEN?.includes('TEST')
  const payerEmail = isTest ? 'test_user_3406336633@testuser.com' : userEmail

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `pix-${userId}-${Date.now()}`
      },
      body: JSON.stringify({
        transaction_amount: 11.90,
        description: 'Mapa de Gastos Premium — Acesso 30 dias',
        payment_method_id: 'pix',
        external_reference: userId,
        payer: {
          email: payerEmail,
          first_name: userName || 'Usuário',
          last_name: 'Teste',
          identification: {
            type: 'CPF',
            number: '19119119100'
          }
        }
      })
    })
    const data = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(data))
    res.status(200).json({
      qr_code: data.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64,
      payment_id: data.id
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
