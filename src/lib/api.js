export async function askOpenRouter({ apiKey, messages, model = import.meta.env.VITE_MODEL_NAME || 'google/gemini-2.5-flash-lite', baseUrl = import.meta.env.VITE_OPEN_ROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions' }) {
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://cluelyclone.local',
      'X-Title': 'CluelyClone'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
} 