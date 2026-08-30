import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BodyPart, Equipment, Exercise } from './exercises';

// ─── Types ────────────────────────────────────────────────────────────────────
//
// wger's API moved exercise name/description off the base exercise object and
// into a per-language `translations` array (the old `/exercise/` endpoint no
// longer returns a `name` field at all). `/exerciseinfo/` gives us the base
// exercise plus its translations and images in a single nested response.

interface WgerTranslation {
  language: number;
  name: string;
  description?: string;
}

interface WgerRawImage {
  image: string;
  is_main?: boolean;
}

interface WgerRawExercise {
  id: number;
  category?: { id: number; name: string };
  muscles?: { id: number; name_en?: string; name?: string; is_front?: boolean }[];
  muscles_secondary?: { id: number; name_en?: string; name?: string }[];
  equipment?: { id: number; name: string }[];
  translations?: WgerTranslation[];
  images?: WgerRawImage[];
}

const ENGLISH_LANGUAGE_ID = 2;

export interface WgerExercise {
  wgerId: string;        // 'wger_<baseId>'
  baseId: number;
  name: string;
  description: string;
  bodyPart: BodyPart;
  muscles: string[];
  equipment: string[];
  imageUrl: string | null;
}

// ─── Category → BodyPart ──────────────────────────────────────────────────────

const CATEGORY_BODYPART: Record<number, BodyPart> = {
  10: 'CORE',
  8:  'BICEPS',
  12: 'BACK',
  14: 'CALVES',
  11: 'CHEST',
  9:  'QUADS',
  13: 'SHOULDERS',
};

const MUSCLE_BODYPART: Record<string, BodyPart> = {
  'Biceps brachii':              'BICEPS',
  'Brachialis':                  'BICEPS',
  'Triceps brachii':             'TRICEPS',
  'Anterior deltoid':            'SHOULDERS',
  'Lateral deltoid':             'SHOULDERS',
  'Posterior deltoid':           'SHOULDERS',
  'Supraspinatus':               'SHOULDERS',
  'Infraspinatus':               'SHOULDERS',
  'Pectoralis major':            'CHEST',
  'Serratus anterior':           'CHEST',
  'Latissimus dorsi':            'BACK',
  'Trapezius':                   'BACK',
  'Teres major':                 'BACK',
  'Rhomboids':                   'BACK',
  'Erector spinae':              'BACK',
  'Biceps femoris':              'HAMSTRINGS',
  'Semitendinosus':              'HAMSTRINGS',
  'Semimembranosus':             'HAMSTRINGS',
  'Quadriceps femoris':          'QUADS',
  'Rectus femoris':              'QUADS',
  'Vastus lateralis':            'QUADS',
  'Vastus medialis':             'QUADS',
  'Gluteus maximus':             'GLUTES',
  'Gluteus medius':              'HIPS',
  'Gluteus minimus':             'HIPS',
  'Hip abductors':               'HIPS',
  'Gastrocnemius':               'CALVES',
  'Soleus':                      'CALVES',
  'Tibialis anterior':           'CALVES',
  'Rectus abdominis':            'CORE',
  'Obliquus externus abdominis': 'CORE',
  'Obliques':                    'CORE',
  'Transversus abdominis':       'CORE',
  'Brachioradialis':             'FOREARMS',
};

function wgerBodyPart(raw: WgerRawExercise): BodyPart {
  const primaryMuscle = raw.muscles?.[0];
  if (primaryMuscle) {
    const name = primaryMuscle.name_en ?? primaryMuscle.name ?? '';
    const mapped = MUSCLE_BODYPART[name];
    if (mapped) return mapped;
  }
  return CATEGORY_BODYPART[raw.category?.id ?? 0] ?? 'FULL BODY';
}

const WGER_EQUIP: Record<string, Equipment> = {
  'Barbell':           'barbell',
  'SZ-Bar':            'barbell',
  'Dumbbell':          'dumbbell',
  'Gym mat':           'bodyweight',
  'Swiss Ball':        'bodyweight',
  'Pull-up bar':       'bar',
  'Chin-up bar':       'bar',
  'None (bodyweight)': 'bodyweight',
  'Bench':             'bodyweight',
  'Incline bench':     'bodyweight',
  'Kettlebell':        'kettlebell',
  'Cable':             'cable',
  'Machine':           'machine',
  'Resistance Band':   'band',
};

function wgerEquipment(raw: WgerRawExercise): Equipment[] {
  const result: Equipment[] = [];
  (raw.equipment ?? []).forEach((e) => {
    const mapped = WGER_EQUIP[e.name];
    if (mapped) result.push(mapped);
  });
  return result.length ? result : ['bodyweight'];
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY    = '@vitalis/wger_exercises_v3';
const CACHE_TS_KEY = '@vitalis/wger_exercises_ts_v3';
const CACHE_TTL    = 7 * 24 * 60 * 60 * 1000; // 7 days
const WGER_BASE    = 'https://wger.de/api/v2';

let memCache: WgerExercise[] | null = null;
let loadPromise: Promise<WgerExercise[]> | null = null;

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchAllPages<T>(startUrl: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = startUrl;
  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) break;
    const data: { results?: T[]; next?: string | null } = await res.json();
    results.push(...(data.results ?? []));
    url = data.next ?? null;
  }
  return results;
}

async function loadFromNetwork(): Promise<WgerExercise[]> {
  const rawExercises = await fetchAllPages<WgerRawExercise>(
    `${WGER_BASE}/exerciseinfo/?format=json&limit=100`,
  );

  const exercises: WgerExercise[] = [];

  rawExercises.forEach((raw) => {
    const translation = raw.translations?.find((t) => t.language === ENGLISH_LANGUAGE_ID);
    const name = translation?.name?.trim();
    if (!name) return;

    const mainImage = raw.images?.find((img) => img.is_main) ?? raw.images?.[0];

    exercises.push({
      wgerId:      `wger_${raw.id}`,
      baseId:      raw.id,
      name,
      description: translation?.description?.replace(/<[^>]+>/g, '').trim() ?? '',
      bodyPart:    wgerBodyPart(raw),
      muscles:     (raw.muscles ?? []).map((m) => m.name_en ?? m.name ?? '').filter(Boolean),
      equipment:   wgerEquipment(raw),
      imageUrl:    mainImage?.image ?? null,
    });
  });

  return exercises;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getWgerExercises(): Promise<WgerExercise[]> {
  if (memCache) return memCache;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const ts = await AsyncStorage.getItem(CACHE_TS_KEY);
      if (ts && Date.now() - Number(ts) < CACHE_TTL) {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as WgerExercise[];
          memCache = parsed;
          return parsed;
        }
      }
    } catch { /* cache miss */ }

    try {
      const exercises = await loadFromNetwork();
      memCache = exercises;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(exercises));
      await AsyncStorage.setItem(CACHE_TS_KEY, String(Date.now()));
      return exercises;
    } catch {
      return [];
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function getWgerByBodyPart(bodyPart: BodyPart): Promise<WgerExercise[]> {
  const all = await getWgerExercises();
  return all.filter((e) => e.bodyPart === bodyPart);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, '')       // strip parenthetical content
    .replace(/[-–]/g, ' ')         // hyphens → spaces
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();
}

function significantWords(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((w) => w.length >= 4);
}

export async function getExerciseImageUrl(exerciseName: string): Promise<string | null> {
  const all = await getWgerExercises();
  if (all.length === 0) return null;

  const lower   = exerciseName.toLowerCase();
  const normOur = normalizeName(exerciseName);

  // 1. Exact match (case-insensitive)
  let match = all.find((e) => e.name.toLowerCase() === lower);

  // 2. Normalized exact match (strips parentheses, normalizes hyphens)
  if (!match) match = all.find((e) => normalizeName(e.name) === normOur);

  // 3. Substring — wger name contained in our name
  if (!match) match = all.find((e) => normOur.includes(normalizeName(e.name)));

  // 4. Substring — our name contained in wger name
  if (!match) match = all.find((e) => normalizeName(e.name).includes(normOur));

  // 5. Word intersection — 2+ significant words (≥4 chars) overlap
  if (!match) {
    const ourWords = new Set(significantWords(exerciseName));
    if (ourWords.size >= 1) {
      let bestScore = 0;
      let bestMatch: typeof all[0] | undefined;
      for (const e of all) {
        if (!e.imageUrl) continue;
        const wWords = significantWords(e.name);
        const overlap = wWords.filter((w) => ourWords.has(w)).length;
        const minLen  = Math.min(ourWords.size, wWords.length);
        if (overlap >= 2 || (overlap >= 1 && minLen === 1 && overlap === minLen)) {
          const score = overlap / Math.max(ourWords.size, wWords.length);
          if (score > bestScore) { bestScore = score; bestMatch = e; }
        }
      }
      match = bestMatch;
    }
  }

  // 6. First significant word startsWith fallback
  if (!match) {
    const firstWord = significantWords(exerciseName)[0];
    if (firstWord && firstWord.length >= 5) {
      match = all.find((e) => e.imageUrl && normalizeName(e.name).startsWith(firstWord));
    }
  }

  return match?.imageUrl ?? null;
}

// ─── Convert wger exercise to local Exercise format ───────────────────────────

export function wgerToExercise(wger: WgerExercise): Exercise {
  return {
    id:         wger.wgerId,
    name:       wger.name,
    bodyPart:   wger.bodyPart,
    muscle:     wger.muscles[0] ?? 'Multiple',
    equipment:  wger.equipment as Equipment[],
    difficulty: 'intermediate',
    type:       'strength',
    tags:       [],
  };
}

// Trigger a background load so data is warm when user opens the workout modal
export function prefetchWger(): void {
  getWgerExercises().catch(() => {});
}
