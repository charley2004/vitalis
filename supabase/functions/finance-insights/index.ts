// Supabase Edge Function — generates factual Smart Insights for the Finance
// module by sending a compact numeric summary to Claude. Deliberately
// stateless (no persisted history, unlike coach-ai) since each insights
// request is a fresh, self-contained summary of current data — mirrors the
// original pre-history Coach design, cheaper than a running conversation.
// Deploy with: supabase functions deploy finance-insights
// Reuses the same ANTHROPIC_API_KEY secret already set for coach-ai.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the Smart Insights generator for Vitalis Finance, a personal budgeting module. You will be given a compact numeric summary of the user's spending, income, budgets, and savings goals for this month and last month. Return 3-5 short, factual, numeric observations about their own data — comparisons, trends, pacing toward goals, budget status. Do not give generic financial advice, disclaimers, or suggestions unless they are a direct factual consequence of the numbers (e.g. "at this pace you'll finish in N months"). Every insight must cite an actual number from the data. Return ONLY a JSON array of strings, nothing else — no markdown, no prose outside the array.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { context } = await req.json();
    if (typeof context !== 'string' || !context.trim()) {
      return json({ error: 'Missing context' }, 400);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return json({ error: 'Smart Insights is not configured on the server yet.' }, 500);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: context }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `Insights request failed (${resp.status}): ${errText}` }, 502);
    }

    const data = await resp.json();
    const text = data?.content?.[0]?.text ?? '[]';
    let insights: string[];
    try {
      const parsed = JSON.parse(text);
      insights = Array.isArray(parsed) ? parsed : [String(parsed)];
    } catch {
      insights = [text];
    }

    return json({ insights });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
