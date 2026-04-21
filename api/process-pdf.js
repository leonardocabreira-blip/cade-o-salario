export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pdfBase64, categories } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: 'PDF não enviado' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key não configurada' });

  const catList = (categories || []).join(', ');

  const prompt = `Você é um assistente de controle financeiro. Analise este extrato bancário/fatura de cartão de crédito em PDF e extraia todas as transações.

Para cada transação, retorne um JSON com este formato exato:
{
  "due_date": "YYYY-MM-DD ou null se não encontrar data de vencimento",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "descrição original da transação",
      "amount": -150.00,
      "category": "categoria sugerida"
    }
  ]
}

Regras importantes:
- Valores negativos = despesas, positivos = receitas/estornos
- Ignore linhas de pagamento de fatura, saldo anterior, limite disponível
- Para a categoria, use uma destas opções: ${catList}
- Se encontrar data de vencimento da fatura, coloque em due_date
- Retorne APENAS o JSON, sem texto adicional`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: 'Erro na API: ' + err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Resposta inválida da IA' });

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
