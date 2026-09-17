// Supabase Edge Function — Vitalis Planner's assistant, backed by Claude.
// Replaces the old on-device regex parser: understands free-form scheduling
// questions and can act on the calendar via tool use. The model never
// touches storage directly — it returns a structured tool call (an "intent"
// keyed by the real event id + occurrence date from the context below), and
// the client executes it through the same safe functions the rest of
// Planner uses (moveOccurrence, setOccurrenceStatus, bestSlotFor), so a
// recurring event's whole series still can't get dragged by a single-
// occurrence request — this function only ever decides intent, never dates.
// Deploy with: supabase functions deploy planner-assistant
// Reuses the same ANTHROPIC_API_KEY secret already set for coach-ai.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are the in-app scheduling assistant for Vitalis Planner. Each message includes the user's upcoming schedule as a list of occurrences — each line is "id:<event_id> | <title> | <weekday> <date> | <time or 'flexible'> | repeat:<none|daily|weekly|monthly> | status:<pending|completed|skipped> | priority:<high|medium|low>" — followed by the user's question or request, possibly with prior turns of this same conversation for follow-up context.

Answer scheduling questions (what's on a given day, when something next happens, how much free time there is) directly and specifically using only the data given — never invent an event that isn't listed.

When the user asks to move, reschedule, shift, or postpone a specific occurrence to an explicit new date and time, call move_event. When they want it moved/scheduled on a day without specifying a time, call find_slot_and_schedule instead — never guess a time yourself. When the user says they did, finished, or completed something, or wants to skip/cancel a specific occurrence, call set_status. Always use the exact event_id and the occurrence's own date exactly as listed in the context, never a date you computed yourself, for every tool call.

Some requests affect more than one occurrence at once — for example, something fell through and the user wants the rest of their day or week reorganized around it. In that case, call every tool needed to carry out the whole request in this same response — one call per occurrence that needs to change — instead of handling only the first one. Reason about the affected stretch of time as a whole: what's now free, what still needs to happen today given each item's own priority and timing, and what the most sensible new arrangement is, using only occurrences already listed in the schedule context. Never invent a new event, and never move or resolve something the user didn't ask about just to fill a gap.

Every reply must include a short natural-language sentence — even when you also call one or more tools, briefly confirm in plain words what you did. When a request results in several changes, summarize all of them, not just the first. If a request is ambiguous (multiple events could match, or which specific occurrence isn't clear), ask a short clarifying question instead of guessing or calling a tool. Keep replies to 1-4 sentences.`;

const TOOLS = [
  {
    name: 'move_event',
    description: "Move a specific occurrence to a new date, and optionally a new time. Use this when the user gives (or already has, and just wants kept) an explicit time for the new slot.",
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        from_date: { type: 'string', description: "YYYY-MM-DD — the occurrence's own date, exactly as listed in the schedule context" },
        to_date: { type: 'string', description: 'YYYY-MM-DD — the new date' },
        to_time: { type: 'string', description: "Optional 24-hour HH:MM new start time. Omit to keep the occurrence's current time on the new date." },
      },
      required: ['event_id', 'from_date', 'to_date'],
    },
  },
  {
    name: 'find_slot_and_schedule',
    description: 'Move or schedule a specific occurrence onto a given date without a specific time in mind — the app will pick the best free slot that day.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        from_date: { type: 'string', description: "YYYY-MM-DD — the occurrence's own date, exactly as listed in the schedule context" },
        to_date: { type: 'string', description: 'YYYY-MM-DD — the day to schedule it on' },
      },
      required: ['event_id', 'from_date', 'to_date'],
    },
  },
  {
    name: 'set_status',
    description: 'Mark a specific occurrence completed or skipped.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' },
        date: { type: 'string', description: "YYYY-MM-DD — the occurrence's own date, exactly as listed in the schedule context" },
        status: { type: 'string', enum: ['completed', 'skipped'] },
      },
      required: ['event_id', 'date', 'status'],
    },
  },
];

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

    const { context, question, history } = await req.json();
    if (typeof context !== 'string' || typeof question !== 'string' || !question.trim()) {
      return json({ error: 'Missing context or question' }, 400);
    }
    const priorTurns = Array.isArray(history)
      ? history
          .filter((m: unknown): m is { role: string; content: string } =>
            !!m && typeof m === 'object' && typeof (m as any).role === 'string' && typeof (m as any).content === 'string')
          .map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          }))
      : [];

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) return json({ error: 'The assistant is not configured on the server yet.' }, 500);

    const messages = [
      ...priorTurns,
      { role: 'user', content: `Schedule context:\n${context}\n\nRequest: ${question.trim()}` },
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
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `Assistant request failed (${resp.status}): ${errText}` }, 502);
    }

    const data = await resp.json();
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];

    const reply = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .join(' ')
      .trim() || 'Done.';

    // A request can legitimately touch several occurrences in one turn (see
    // the multi-occurrence guidance in SYSTEM_PROMPT) — collect every tool
    // call the model made, not just the first, capped as a sanity limit
    // against a runaway response reorganizing far more than was asked.
    const MAX_ACTIONS = 8;
    const actions = blocks
      .filter((b) => b.type === 'tool_use')
      .slice(0, MAX_ACTIONS)
      .map((toolBlock) => {
        const input = toolBlock.input ?? {};
        if (toolBlock.name === 'move_event') {
          return { type: 'move', eventId: input.event_id, fromDate: input.from_date, toDate: input.to_date, toTime: input.to_time };
        }
        if (toolBlock.name === 'find_slot_and_schedule') {
          return { type: 'find_slot', eventId: input.event_id, fromDate: input.from_date, toDate: input.to_date };
        }
        if (toolBlock.name === 'set_status') {
          return { type: 'status', eventId: input.event_id, date: input.date, status: input.status };
        }
        return null;
      })
      .filter((a) => a !== null);

    return json({ reply, actions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
