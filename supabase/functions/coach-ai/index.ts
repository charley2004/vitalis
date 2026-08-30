// Supabase Edge Function — proxies Coach questions to the Claude API, with
// persisted, per-user conversation history for follow-up context.
// Deploy with: supabase functions deploy coach-ai
// Requires one secret set on the Supabase project (never shipped in the app):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the platform.
// Requires supabase/schema_coach_messages.sql to have been run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the in-app coach for Vitalis, a personal health and performance tracking app. Each user message includes a fresh compact summary of the user's recent metrics: hydration, movement, sleep, routine completion (including how late or early each routine was actually done versus its planned time), streaks, and daily score trend. Answer using only that data plus the conversation so far — be direct and specific, cite their actual numbers, and skip generic wellness disclaimers or "consult a doctor" boilerplate unless something in the data looks genuinely concerning. Keep replies to 2-4 sentences unless the question calls for a short list.`;

// How many prior turns to feed back as conversation memory. Kept small on
// purpose — each extra turn is extra input tokens on every future request.
const HISTORY_TURNS = 5;

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

    const { context, question } = await req.json();
    if (typeof context !== 'string' || typeof question !== 'string' || !question.trim()) {
      return json({ error: 'Missing context or question' }, 400);
    }
    const trimmedQuestion = question.trim();

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return json({ error: 'Coach is not configured on the server yet.' }, 500);

    // Pull recent history for this user so follow-ups ("what about
    // yesterday?") resolve correctly — stored as plain text, not re-including
    // the data dump each past turn was sent with (that would go stale).
    const { data: historyRows, error: historyError } = await supabaseClient
      .from('coach_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS * 2);
    if (historyError) return json({ error: historyError.message }, 500);

    const history = (historyRows ?? []).reverse().map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    const messages = [
      ...history,
      { role: 'user', content: `Here is my current data:\n${context}\n\nQuestion: ${trimmedQuestion}` },
    ];

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
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `Coach request failed (${resp.status}): ${errText}` }, 502);
    }

    const data = await resp.json();
    const reply = data?.content?.[0]?.text ?? 'No response.';

    // Persist the clean exchange (no data-dump prefix) so scrollback stays
    // readable and future turns don't compound stale context.
    const { error: insertError } = await supabaseClient.from('coach_messages').insert([
      { user_id: user.id, role: 'user', content: trimmedQuestion },
      { user_id: user.id, role: 'assistant', content: reply },
    ]);
    if (insertError) return json({ error: insertError.message }, 500);

    return json({ reply });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
