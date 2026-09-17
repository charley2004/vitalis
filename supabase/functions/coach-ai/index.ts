// Supabase Edge Function — proxies Coach questions to the Claude API, with
// persisted, per-user conversation history for follow-up context. Also gives
// Vitalis AI tool use to actually manage routines and fitness goals/programs
// (not just discuss them) — the model only ever decides intent;
// services/coach.ts is the sole place that writes routine config or fitness
// program/goal, mirroring how Planner's assistant works.
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

const ROUTINE_ICONS = [
  'bolt', 'flame', 'snowflake', 'moon', 'sunrise', 'droplet', 'dumbbell',
  'scale', 'runner', 'lotus', 'pen', 'coffee', 'bowl', 'signal', 'brain', 'bell', 'shield',
];

// Must match services/exercises.ts's BodyPart union exactly.
const BODY_PARTS = [
  'CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'FOREARMS',
  'CORE', 'HIPS', 'GLUTES', 'QUADS', 'HAMSTRINGS', 'CALVES',
  'CARDIO', 'FULL BODY', 'MOBILITY',
];

const SYSTEM_PROMPT = `You are Vitalis AI, the in-app coach for Vitalis, a personal health and performance tracking app. Each user message includes a fresh compact summary of the user's recent metrics: hydration, movement, sleep, routine completion (including how late or early each routine was actually done versus its planned time), streaks, daily score trend, the user's full routine catalog (each with a real id, slot, time, and status), and their fitness goal/program if one is active (each exercise with a real id, body part, sets/reps target, current working weight, and recently logged sets). Answer using only that data plus the conversation so far — be direct and specific, cite their actual numbers, and skip generic wellness disclaimers or "consult a doctor" boilerplate unless something in the data looks genuinely concerning.

You can also manage the user's routines and fitness program directly, not just discuss them.

Routines: Use set_routines when the user wants their routines completely rebuilt or reorganized around a new schedule — it replaces the entire catalog with exactly what you provide, so include every routine that should exist afterward, not just the new ones. Use add_routine for a single new habit without touching the rest. Use update_routine or remove_routine for a single existing routine, always identified by its exact id from the routine catalog in context — never a label or a guessed id. Times are 24-hour HH:MM. When placing routines across a schedule (e.g. class timetables, work hours, sleep window), reason about the whole picture — don't schedule something during a stated busy/unavailable block.

Today only: use reset_today_routines when the user is running late, just woke up, or otherwise needs TODAY's remaining routines shifted or skipped — never update_routine/set_routines for this, since those change the permanent schedule and would also affect tomorrow. Context includes the current time — only touch routines whose scheduled time hasn't passed yet, space the retimed ones out sensibly across whatever's left of the day (don't just cram everything at the current time), and prefer 'skip' over a nonsensical retime for anything that plainly no longer fits (e.g. a "morning" routine when it's already evening). Leave alone anything already done.

Fitness: when the user states a goal (a target physique/build, a performance target, etc.) with or without a timeframe, call set_fitness_program to generate a full 7-day split (one entry per weekday, including explicit rest days) built from their stated goal, current weight if given, and their equipment/experience level context. Pick real, sensible exercise names per body part — you don't need an exact id, the app matches your exercise name against its own catalog. Assign a starting working weight per exercise using your best judgement from the user's stated experience/current weight (bodyweight-only or true beginners can start an exercise at 0kg or a light dumbbell weight) — the app will confirm and adjust actual weight with the user week to week from logged performance, so a reasonable starting estimate is fine, don't refuse for lack of exact numbers. Set incrementKg per exercise to a sensible jump size (small, e.g. 2.5, for isolation/upper-body accessory lifts; larger, e.g. 5, for big compound lower-body lifts). Use reassign_split_day to replace one day's assignment (e.g. "move leg day to Thursday"), and adjust_program_exercise to tweak one existing exercise (identified by its exact id from context) — e.g. changing its sets/reps/weight/increment directly when the user asks for that, separate from the app's own automatic weekly progression prompts.

For both routines and fitness: prefer making a clearly-stated, reasonable placement/decision over refusing outright, since the user is asking you to actually do this — only ask a clarifying question first if the request is genuinely ambiguous about WHAT should exist (not where to fit it or what starting numbers to guess).

Every reply must include a short natural-language sentence — even when you also call one or more tools, confirm in plain words what you did. If you made several changes (e.g. a full rebuild), summarize the new set rather than listing every field. If asked who or what you are, say you're Vitalis AI. Keep replies to 2-5 sentences unless summarizing many changes genuinely needs more.`;

const TOOLS = [
  {
    name: 'set_routines',
    description: "Replace the ENTIRE routine catalog with a new set. Use when the user wants their routines completely rebuilt or reorganized — this deletes every existing routine and creates exactly the ones provided, so include everything that should exist afterward.",
    input_schema: {
      type: 'object',
      properties: {
        routines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              emoji: { type: 'string', enum: ROUTINE_ICONS },
              slot: { type: 'string', enum: ['MORNING', 'NOON', 'NIGHT'] },
              time: { type: 'string', description: '24-hour HH:MM this routine is anchored to' },
              durationMinutes: { type: 'number' },
              target: { type: 'string', description: 'Short human label of the target, e.g. "500ml" or "10 min"' },
            },
            required: ['label', 'slot', 'time'],
          },
        },
      },
      required: ['routines'],
    },
  },
  {
    name: 'add_routine',
    description: 'Add a single new routine without touching any existing ones.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        emoji: { type: 'string', enum: ROUTINE_ICONS },
        slot: { type: 'string', enum: ['MORNING', 'NOON', 'NIGHT'] },
        time: { type: 'string', description: '24-hour HH:MM this routine is anchored to' },
        durationMinutes: { type: 'number' },
        target: { type: 'string' },
      },
      required: ['label', 'slot', 'time'],
    },
  },
  {
    name: 'update_routine',
    description: 'Modify one existing routine, identified by its exact id from the routine catalog in context. Only include fields that should change.',
    input_schema: {
      type: 'object',
      properties: {
        routine_id: { type: 'string' },
        label: { type: 'string' },
        emoji: { type: 'string', enum: ROUTINE_ICONS },
        slot: { type: 'string', enum: ['MORNING', 'NOON', 'NIGHT'] },
        time: { type: 'string', description: '24-hour HH:MM' },
        durationMinutes: { type: 'number' },
        target: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['routine_id'],
    },
  },
  {
    name: 'remove_routine',
    description: 'Delete one existing routine, identified by its exact id from the routine catalog in context.',
    input_schema: {
      type: 'object',
      properties: { routine_id: { type: 'string' } },
      required: ['routine_id'],
    },
  },
  {
    name: 'reset_today_routines',
    description: "Shift or skip TODAY's remaining routines only, e.g. because the user woke up or got started late. Tomorrow and every day after are completely unaffected — the routine's normal permanent time is untouched.",
    input_schema: {
      type: 'object',
      properties: {
        resets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              routine_id: { type: 'string' },
              action: { type: 'string', enum: ['retime', 'skip'], description: "'retime' moves it to a new time today; 'skip' excuses it for today only" },
              time: { type: 'string', description: '24-hour HH:MM — required when action is retime, the new time for today only' },
            },
            required: ['routine_id', 'action'],
          },
        },
      },
      required: ['resets'],
    },
  },
];

const EXERCISE_SPEC = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'A real, specific exercise name, e.g. "Barbell Bench Press"' },
    bodyPart: { type: 'string', enum: BODY_PARTS },
    targetSets: { type: 'number' },
    targetReps: { type: 'string', description: 'e.g. "8-10"' },
    startWeightKg: { type: 'number', description: 'Starting working weight in kg. Use 0 for bodyweight-only exercises.' },
    incrementKg: { type: 'number', description: 'How much to jump by when progression suggests a bump — small (e.g. 2.5) for isolation/accessory lifts, larger (e.g. 5) for big compound lower-body lifts.' },
  },
  required: ['name', 'bodyPart', 'targetSets', 'targetReps', 'startWeightKg'],
};

const SPLIT_DAY_SPEC = {
  type: 'object',
  properties: {
    weekday: { type: 'number', description: '0=Sunday .. 6=Saturday' },
    label: { type: 'string', description: 'e.g. "Push", "Legs", "Rest"' },
    bodyParts: { type: 'array', items: { type: 'string', enum: BODY_PARTS } },
    exercises: { type: 'array', items: EXERCISE_SPEC, description: 'Empty array for a rest day' },
  },
  required: ['weekday', 'label', 'bodyParts', 'exercises'],
};

const FITNESS_TOOLS = [
  {
    name: 'set_fitness_program',
    description: "Create or completely replace the user's fitness goal and 7-day program. Use for a new goal, or when the user wants their program fully rebuilt. Include all 7 weekdays, with an empty exercises array on rest days.",
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'object',
          properties: {
            description: { type: 'string', description: "The user's stated goal in their own words" },
            targetDate: { type: 'string', description: 'YYYY-MM-DD, computed from any timeframe the user gave' },
            startWeightKg: { type: 'number' },
          },
          required: ['description', 'targetDate'],
        },
        days: { type: 'array', items: SPLIT_DAY_SPEC, minItems: 7, maxItems: 7 },
      },
      required: ['goal', 'days'],
    },
  },
  {
    name: 'reassign_split_day',
    description: "Replace a single day's assignment in the active program (e.g. moving which body parts/exercises land on a weekday) without touching any other day.",
    input_schema: {
      type: 'object',
      properties: { day: SPLIT_DAY_SPEC },
      required: ['day'],
    },
  },
  {
    name: 'adjust_program_exercise',
    description: 'Change one existing exercise in the active program — its sets, reps, current weight, and/or weight increment — identified by its exact id from the fitness context. Only include fields that should change.',
    input_schema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        targetSets: { type: 'number' },
        targetReps: { type: 'string' },
        currentWeightKg: { type: 'number' },
        incrementKg: { type: 'number' },
      },
      required: ['exercise_id'],
    },
  },
];

// How many prior turns to feed back as conversation memory. Kept small on
// purpose — each extra turn is extra input tokens on every future request.
const HISTORY_TURNS = 5;
// One tool per turn — set_routines, set_fitness_program, and
// reset_today_routines all already carry a full list internally, so a
// single call is enough for a full rebuild/reset in any one domain.
const MAX_ACTIONS = 1;

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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [...TOOLS, ...FITNESS_TOOLS],
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `Coach request failed (${resp.status}): ${errText}` }, 502);
    }

    const data = await resp.json();
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];

    const reply = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text as string)
      .join(' ')
      .trim() || 'Done.';

    const actions = blocks
      .filter((b) => b.type === 'tool_use')
      .slice(0, MAX_ACTIONS)
      .map((toolBlock) => {
        const input = toolBlock.input ?? {};
        if (toolBlock.name === 'set_routines') {
          return { type: 'set_routines', routines: input.routines ?? [] };
        }
        if (toolBlock.name === 'add_routine') {
          return { type: 'add_routine', routine: input };
        }
        if (toolBlock.name === 'update_routine') {
          const { routine_id, ...patch } = input;
          return { type: 'update_routine', routineId: routine_id, patch };
        }
        if (toolBlock.name === 'remove_routine') {
          return { type: 'remove_routine', routineId: input.routine_id };
        }
        if (toolBlock.name === 'reset_today_routines') {
          return { type: 'reset_today_routines', resets: input.resets ?? [] };
        }
        if (toolBlock.name === 'set_fitness_program') {
          return { type: 'set_fitness_program', goal: input.goal ?? {}, days: input.days ?? [] };
        }
        if (toolBlock.name === 'reassign_split_day') {
          return { type: 'reassign_split_day', day: input.day };
        }
        if (toolBlock.name === 'adjust_program_exercise') {
          const { exercise_id, ...patch } = input;
          return { type: 'adjust_program_exercise', exerciseId: exercise_id, patch };
        }
        return null;
      })
      .filter((a) => a !== null);

    // Persist the clean exchange (no data-dump prefix) so scrollback stays
    // readable and future turns don't compound stale context.
    const { error: insertError } = await supabaseClient.from('coach_messages').insert([
      { user_id: user.id, role: 'user', content: trimmedQuestion },
      { user_id: user.id, role: 'assistant', content: reply },
    ]);
    if (insertError) return json({ error: insertError.message }, 500);

    return json({ reply, actions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
