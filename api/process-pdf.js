export const config = { maxDuration: 60 };
 
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
 
  const prompt = `Analise este extrato/fatura e extraia TODAS as transações financeiras.
 
Retorne SOMENTE um JSON válido neste formato, sem nenhum texto antes ou depois:
{"due_date":"YYYY-MM-DD","source":"credit","transactions":[{"date":"YYYY-MM-DD","description":"nome","amount":-50.00,"category":"Alimentação"}]}
 
Regras:
- amount negativo = despesa, positivo = receita ou estorno
- Ignore: pagamentos de fatura, saldo anterior, limite, IOF isolado
- Inclua: todas as compras, estornos, créditos recebidos
- due_date: data de vencimento da fatura (null se não houver)
- source: "credit" para cartão crédito, "debit" para débito, "other" se não souber
- category: use uma destas: ${catList}
- Datas no formato YYYY-MM-DD
- RESPONDA APENAS COM O JSON, SEM MARKDOWN, SEM EXPLICAÇÕES`;
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
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
 
    if (data.type === 'error') {
      return res.status(500).json({ error: data.error?.message || 'Erro da API' });
    }
 
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
 
    if (!text) {
      return res.status(500).json({ error: 'IA não retornou resposta. Tente novamente.' });
    }
 
    const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Formato inválido: ' + clean.slice(0, 200) });
    }
 
    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
 
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
