// ─── Types ────────────────────────────────────────────────────────────────────

export type BodyPart =
  | 'CHEST' | 'BACK' | 'SHOULDERS' | 'BICEPS' | 'TRICEPS' | 'FOREARMS'
  | 'CORE' | 'HIPS' | 'GLUTES' | 'QUADS' | 'HAMSTRINGS' | 'CALVES'
  | 'CARDIO' | 'FULL BODY' | 'MOBILITY';

export type Equipment =
  | 'bodyweight' | 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'band' | 'kettlebell' | 'bar';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'balance';

export interface Exercise {
  id: string;
  name: string;
  bodyPart: BodyPart;
  muscle: string;
  equipment: Equipment[];
  difficulty: Difficulty;
  type: ExerciseType;
  tags?: string[];
}

export interface Phase {
  kind: 'warmup' | 'work' | 'rest-set' | 'rest-exercise' | 'cooldown';
  durationSeconds: number;
  exerciseId?: string;
  setNumber?: number;
  totalSets?: number;
  repsLabel?: string;
  label: string;
  sublabel?: string;
  nextLabel?: string;
  autoComplete?: boolean;
}

export interface BodyPartMeta {
  key: BodyPart;
  label: string;
  muscles: string;
  priority?: boolean;
}

// ─── Body part catalogue ──────────────────────────────────────────────────────

export const BODY_PART_META: BodyPartMeta[] = [
  { key: 'CHEST',      label: 'Chest',      muscles: 'Pecs, Serratus'              },
  { key: 'BACK',       label: 'Back',        muscles: 'Lats, Traps, Rhomboids'      },
  { key: 'SHOULDERS',  label: 'Shoulders',   muscles: 'Deltoids, Rotator Cuff'      },
  { key: 'BICEPS',     label: 'Biceps',      muscles: 'Biceps Brachii, Brachialis'  },
  { key: 'TRICEPS',    label: 'Triceps',     muscles: 'Long, Lateral, Medial Head'  },
  { key: 'FOREARMS',   label: 'Forearms',    muscles: 'Flexors, Extensors, Grip'    },
  { key: 'CORE',       label: 'Core',        muscles: 'Abs, Obliques, TVA'          },
  { key: 'HIPS',       label: 'Hips',        muscles: 'Abductors, Adductors, Flexors', priority: true },
  { key: 'GLUTES',     label: 'Glutes',      muscles: 'Gluteus Max, Med, Min'       },
  { key: 'QUADS',      label: 'Quads',       muscles: 'Quadriceps, VMO'             },
  { key: 'HAMSTRINGS', label: 'Hamstrings',  muscles: 'Biceps Femoris, Semis'       },
  { key: 'CALVES',     label: 'Calves',      muscles: 'Gastrocnemius, Soleus'       },
  { key: 'CARDIO',     label: 'Cardio',      muscles: 'Cardiovascular System'       },
  { key: 'FULL BODY',  label: 'Full Body',   muscles: 'Multi-joint Compound'        },
  { key: 'MOBILITY',   label: 'Mobility',    muscles: 'Flexibility, ROM'            },
];

// ─── Exercise database ────────────────────────────────────────────────────────

function ex(
  id: string, name: string, bodyPart: BodyPart, muscle: string,
  equipment: Equipment[], difficulty: Difficulty, type: ExerciseType,
  tags?: string[],
): Exercise { return { id, name, bodyPart, muscle, equipment, difficulty, type, tags }; }

export const EXERCISES: Exercise[] = [
  // ── CHEST ─────────────────────────────────────────────────────────────────
  ex('ch01','Barbell Bench Press',        'CHEST','Pectoralis Major (Mid)',   ['barbell'],               'intermediate','strength'),
  ex('ch02','Incline Barbell Press',      'CHEST','Pectoralis Major (Upper)', ['barbell'],               'intermediate','strength'),
  ex('ch03','Decline Barbell Press',      'CHEST','Pectoralis Major (Lower)', ['barbell'],               'intermediate','strength'),
  ex('ch04','Dumbbell Bench Press',       'CHEST','Pectoralis Major (Mid)',   ['dumbbell'],              'beginner',    'strength'),
  ex('ch05','Incline Dumbbell Press',     'CHEST','Pectoralis Major (Upper)', ['dumbbell'],              'beginner',    'strength'),
  ex('ch06','Dumbbell Flye',              'CHEST','Pectoralis Major (Mid)',   ['dumbbell'],              'intermediate','strength'),
  ex('ch07','Incline Dumbbell Flye',      'CHEST','Pectoralis Major (Upper)', ['dumbbell'],              'intermediate','strength'),
  ex('ch08','Cable Crossover',            'CHEST','Pectoralis Major (Inner)', ['cable'],                 'intermediate','strength'),
  ex('ch09','Low-to-High Cable Fly',      'CHEST','Pectoralis Major (Upper)', ['cable'],                 'intermediate','strength'),
  ex('ch10','High-to-Low Cable Fly',      'CHEST','Pectoralis Major (Lower)', ['cable'],                 'intermediate','strength'),
  ex('ch11','Push-Up',                    'CHEST','Pectoralis Major (Mid)',   ['bodyweight'],            'beginner',    'strength'),
  ex('ch12','Wide-Grip Push-Up',          'CHEST','Pectoralis Major (Mid)',   ['bodyweight'],            'beginner',    'strength'),
  ex('ch13','Decline Push-Up',            'CHEST','Pectoralis Major (Upper)', ['bodyweight'],            'intermediate','strength'),
  ex('ch14','Incline Push-Up',            'CHEST','Pectoralis Major (Lower)', ['bodyweight'],            'beginner',    'strength'),
  ex('ch15','Chest Dip',                  'CHEST','Pectoralis Major (Lower)', ['bar'],                   'intermediate','strength'),
  ex('ch16','Machine Chest Press',        'CHEST','Pectoralis Major (Mid)',   ['machine'],               'beginner',    'strength'),
  ex('ch17','Pec Deck / Machine Fly',     'CHEST','Pectoralis Major (Inner)', ['machine'],               'beginner',    'strength'),
  ex('ch18','Diamond Push-Up',            'CHEST','Pectoralis Major (Inner)', ['bodyweight'],            'intermediate','strength'),
  ex('ch19','Push-Up with Rotation',      'CHEST','Pectoralis Major (Mid)',   ['bodyweight'],            'intermediate','strength'),
  ex('ch20','Svend Press',                'CHEST','Pectoralis Major (Inner)', ['dumbbell'],              'beginner',    'strength'),
  ex('ch21','Landmine Press',             'CHEST','Pectoralis Major (Upper)', ['barbell'],               'intermediate','strength'),
  ex('ch22','Single-Arm Cable Press',     'CHEST','Pectoralis Major (Mid)',   ['cable'],                 'intermediate','strength'),
  // ── BACK ──────────────────────────────────────────────────────────────────
  ex('bk01','Deadlift',                   'BACK', 'Erector Spinae',           ['barbell'],               'advanced',    'strength'),
  ex('bk02','Bent-Over Barbell Row',      'BACK', 'Latissimus Dorsi',         ['barbell'],               'intermediate','strength'),
  ex('bk03','Pendlay Row',                'BACK', 'Latissimus Dorsi',         ['barbell'],               'advanced',    'strength'),
  ex('bk04','T-Bar Row',                  'BACK', 'Latissimus Dorsi',         ['machine'],               'intermediate','strength'),
  ex('bk05','Seated Cable Row',           'BACK', 'Rhomboids',                ['cable'],                 'beginner',    'strength'),
  ex('bk06','Single-Arm Dumbbell Row',    'BACK', 'Latissimus Dorsi',         ['dumbbell'],              'beginner',    'strength'),
  ex('bk07','Pull-Up',                    'BACK', 'Latissimus Dorsi',         ['bar'],                   'intermediate','strength'),
  ex('bk08','Chin-Up',                    'BACK', 'Latissimus Dorsi',         ['bar'],                   'intermediate','strength'),
  ex('bk09','Wide-Grip Pull-Up',          'BACK', 'Latissimus Dorsi',         ['bar'],                   'advanced',    'strength'),
  ex('bk10','Lat Pulldown',               'BACK', 'Latissimus Dorsi',         ['cable','machine'],       'beginner',    'strength'),
  ex('bk11','Wide-Grip Lat Pulldown',     'BACK', 'Latissimus Dorsi',         ['cable','machine'],       'beginner',    'strength'),
  ex('bk12','Straight-Arm Pulldown',      'BACK', 'Latissimus Dorsi',         ['cable'],                 'intermediate','strength'),
  ex('bk13','Face Pull',                  'BACK', 'Trapezius (Mid)',           ['cable'],                 'beginner',    'strength'),
  ex('bk14','Barbell Shrug',              'BACK', 'Trapezius (Upper)',         ['barbell'],               'beginner',    'strength'),
  ex('bk15','Dumbbell Shrug',             'BACK', 'Trapezius (Upper)',         ['dumbbell'],              'beginner',    'strength'),
  ex('bk16','Band Pull-Apart',            'BACK', 'Trapezius (Mid)',           ['band'],                  'beginner',    'strength'),
  ex('bk17','Good Morning',               'BACK', 'Erector Spinae',           ['barbell'],               'intermediate','strength'),
  ex('bk18','Hyperextension',             'BACK', 'Erector Spinae',           ['bodyweight','machine'],  'beginner',    'strength'),
  ex('bk19','Inverted Row',               'BACK', 'Rhomboids',                ['bar'],                   'beginner',    'strength'),
  ex('bk20','Renegade Row',               'BACK', 'Latissimus Dorsi',         ['dumbbell'],              'intermediate','strength'),
  ex('bk21','Seal Row',                   'BACK', 'Rhomboids',                ['dumbbell'],              'intermediate','strength'),
  ex('bk22','Cable High Row',             'BACK', 'Trapezius (Mid)',           ['cable'],                 'beginner',    'strength'),
  ex('bk23','Chest-Supported Row',        'BACK', 'Rhomboids',                ['dumbbell','machine'],    'beginner',    'strength'),
  // ── SHOULDERS ─────────────────────────────────────────────────────────────
  ex('sh01','Barbell Overhead Press',     'SHOULDERS','Deltoid (Anterior)',   ['barbell'],               'intermediate','strength'),
  ex('sh02','Seated Dumbbell Press',      'SHOULDERS','Deltoid (Anterior)',   ['dumbbell'],              'beginner',    'strength'),
  ex('sh03','Arnold Press',               'SHOULDERS','Deltoid (All Heads)',  ['dumbbell'],              'intermediate','strength'),
  ex('sh04','Dumbbell Lateral Raise',     'SHOULDERS','Deltoid (Lateral)',    ['dumbbell'],              'beginner',    'strength'),
  ex('sh05','Cable Lateral Raise',        'SHOULDERS','Deltoid (Lateral)',    ['cable'],                 'beginner',    'strength'),
  ex('sh06','Dumbbell Front Raise',       'SHOULDERS','Deltoid (Anterior)',   ['dumbbell'],              'beginner',    'strength'),
  ex('sh07','Rear Delt Fly',              'SHOULDERS','Deltoid (Posterior)',  ['dumbbell'],              'beginner',    'strength'),
  ex('sh08','Cable Face Pull',            'SHOULDERS','Deltoid (Posterior)',  ['cable'],                 'beginner',    'strength'),
  ex('sh09','Upright Row',                'SHOULDERS','Deltoid (Lateral)',    ['barbell'],               'intermediate','strength'),
  ex('sh10','Push Press',                 'SHOULDERS','Deltoid (Anterior)',   ['barbell'],               'advanced',    'strength'),
  ex('sh11','Landmine Press',             'SHOULDERS','Deltoid (Anterior)',   ['barbell'],               'intermediate','strength'),
  ex('sh12','Band External Rotation',     'SHOULDERS','Rotator Cuff',         ['band'],                  'beginner',    'strength'),
  ex('sh13','Cable Internal Rotation',    'SHOULDERS','Rotator Cuff',         ['cable'],                 'beginner',    'strength'),
  ex('sh14','Machine Shoulder Press',     'SHOULDERS','Deltoid (All Heads)',  ['machine'],               'beginner',    'strength'),
  ex('sh15','Pike Push-Up',               'SHOULDERS','Deltoid (Anterior)',   ['bodyweight'],            'intermediate','strength'),
  ex('sh16','Bradford Press',             'SHOULDERS','Deltoid (All Heads)',  ['barbell'],               'advanced',    'strength'),
  ex('sh17','Kneeling Landmine Press',    'SHOULDERS','Deltoid (Anterior)',   ['barbell'],               'intermediate','strength'),
  // ── BICEPS ────────────────────────────────────────────────────────────────
  ex('bi01','Barbell Curl',               'BICEPS','Biceps Brachii',          ['barbell'],               'beginner',    'strength'),
  ex('bi02','EZ-Bar Curl',                'BICEPS','Biceps Brachii',          ['barbell'],               'beginner',    'strength'),
  ex('bi03','Dumbbell Curl',              'BICEPS','Biceps Brachii',          ['dumbbell'],              'beginner',    'strength'),
  ex('bi04','Hammer Curl',                'BICEPS','Brachialis',              ['dumbbell'],              'beginner',    'strength'),
  ex('bi05','Concentration Curl',         'BICEPS','Biceps Brachii (Peak)',   ['dumbbell'],              'beginner',    'strength'),
  ex('bi06','Incline Dumbbell Curl',      'BICEPS','Biceps Brachii (Long)',   ['dumbbell'],              'intermediate','strength'),
  ex('bi07','Spider Curl',                'BICEPS','Biceps Brachii (Short)',  ['dumbbell','barbell'],    'intermediate','strength'),
  ex('bi08','Cable Curl',                 'BICEPS','Biceps Brachii',          ['cable'],                 'beginner',    'strength'),
  ex('bi09','Preacher Curl',              'BICEPS','Biceps Brachii (Short)',  ['barbell','machine'],     'intermediate','strength'),
  ex('bi10','Reverse Curl',               'BICEPS','Brachioradialis',         ['barbell'],               'intermediate','strength'),
  ex('bi11','Drag Curl',                  'BICEPS','Biceps Brachii (Long)',   ['barbell'],               'intermediate','strength'),
  ex('bi12','Machine Curl',               'BICEPS','Biceps Brachii',          ['machine'],               'beginner',    'strength'),
  // ── TRICEPS ───────────────────────────────────────────────────────────────
  ex('tr01','Close-Grip Bench Press',     'TRICEPS','Triceps (All Heads)',    ['barbell'],               'intermediate','strength'),
  ex('tr02','Skull Crusher',              'TRICEPS','Triceps (Long Head)',    ['barbell'],               'intermediate','strength'),
  ex('tr03','Overhead Triceps Ext',       'TRICEPS','Triceps (Long Head)',    ['dumbbell','cable'],      'beginner',    'strength'),
  ex('tr04','Triceps Pushdown',           'TRICEPS','Triceps (Lateral Head)', ['cable'],                 'beginner',    'strength'),
  ex('tr05','Rope Pushdown',              'TRICEPS','Triceps (All Heads)',    ['cable'],                 'beginner',    'strength'),
  ex('tr06','Overhead Cable Extension',   'TRICEPS','Triceps (Long Head)',    ['cable'],                 'beginner',    'strength'),
  ex('tr07','Triceps Kickback',           'TRICEPS','Triceps (Lateral Head)', ['dumbbell'],              'beginner',    'strength'),
  ex('tr08','Triceps Dip',                'TRICEPS','Triceps (All Heads)',    ['bodyweight','bar'],      'intermediate','strength'),
  ex('tr09','Diamond Push-Up',            'TRICEPS','Triceps (Medial Head)',  ['bodyweight'],            'intermediate','strength'),
  ex('tr10','Tate Press',                 'TRICEPS','Triceps (Short Head)',   ['dumbbell'],              'advanced',    'strength'),
  // ── FOREARMS ──────────────────────────────────────────────────────────────
  ex('fo01','Wrist Curl',                 'FOREARMS','Flexor Carpi',          ['barbell','dumbbell'],    'beginner',    'strength'),
  ex('fo02','Reverse Wrist Curl',         'FOREARMS','Extensor Carpi',        ['barbell','dumbbell'],    'beginner',    'strength'),
  ex('fo03',"Farmer's Walk",              'FOREARMS','Grip Strength',         ['dumbbell','kettlebell'], 'beginner',    'strength'),
  ex('fo04','Dead Hang',                  'FOREARMS','Grip Strength',         ['bar'],                   'beginner',    'strength'),
  ex('fo05','Plate Pinch',                'FOREARMS','Grip Strength',         ['barbell'],               'beginner',    'strength'),
  ex('fo06','Wrist Roller',               'FOREARMS','Forearm (All)',         ['machine'],               'beginner',    'strength'),
  ex('fo07','Towel Pull-Up',              'FOREARMS','Grip Strength',         ['bar'],                   'advanced',    'strength'),
  // ── CORE ──────────────────────────────────────────────────────────────────
  ex('co01','Plank',                      'CORE','Transverse Abdominis',      ['bodyweight'],            'beginner',    'strength'),
  ex('co02','Side Plank',                 'CORE','Obliques',                  ['bodyweight'],            'beginner',    'strength'),
  ex('co03','Hollow Body Hold',           'CORE','Transverse Abdominis',      ['bodyweight'],            'intermediate','strength'),
  ex('co04','Ab Wheel Rollout',           'CORE','Rectus Abdominis',          ['bodyweight'],            'intermediate','strength'),
  ex('co05','Crunch',                     'CORE','Rectus Abdominis (Upper)',   ['bodyweight'],            'beginner',    'strength'),
  ex('co06','Reverse Crunch',             'CORE','Rectus Abdominis (Lower)',   ['bodyweight'],            'beginner',    'strength'),
  ex('co07','Lying Leg Raise',            'CORE','Rectus Abdominis (Lower)',   ['bodyweight'],            'intermediate','strength'),
  ex('co08','Hanging Knee Raise',         'CORE','Rectus Abdominis (Lower)',   ['bar'],                   'intermediate','strength'),
  ex('co09','Hanging Leg Raise',          'CORE','Rectus Abdominis (Lower)',   ['bar'],                   'advanced',    'strength'),
  ex('co10','Bicycle Crunch',             'CORE','Obliques',                  ['bodyweight'],            'beginner',    'strength'),
  ex('co11','Russian Twist',              'CORE','Obliques',                  ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('co12','Wood Chop',                  'CORE','Obliques',                  ['cable'],                 'intermediate','strength'),
  ex('co13','Dead Bug',                   'CORE','Transverse Abdominis',      ['bodyweight'],            'beginner',    'balance'),
  ex('co14','Bird Dog',                   'CORE','Erector Spinae',            ['bodyweight'],            'beginner',    'balance'),
  ex('co15','Mountain Climber',           'CORE','Rectus Abdominis',          ['bodyweight'],            'intermediate','cardio'),
  ex('co16','Pallof Press',               'CORE','Transverse Abdominis',      ['cable','band'],          'intermediate','strength'),
  ex('co17','Cable Crunch',               'CORE','Rectus Abdominis',          ['cable'],                 'beginner',    'strength'),
  ex('co18','V-Up',                       'CORE','Rectus Abdominis',          ['bodyweight'],            'intermediate','strength'),
  ex('co19','Dragon Flag',                'CORE','Rectus Abdominis',          ['bodyweight'],            'advanced',    'strength'),
  ex('co20','L-Sit',                      'CORE','Core (All)',                ['bar'],                   'advanced',    'strength'),
  ex('co21','Stir the Pot',               'CORE','Transverse Abdominis',      ['bodyweight'],            'advanced',    'strength'),
  ex('co22','Suitcase Carry',             'CORE','Obliques',                  ['dumbbell','kettlebell'], 'beginner',    'strength'),
  // ── HIPS — Trendelenburg gait focus ───────────────────────────────────────
  ex('hp01','Clamshell',                  'HIPS','Gluteus Medius',            ['bodyweight','band'],     'beginner',    'strength', ['trendelenburg','hip-stability']),
  ex('hp02','Side-Lying Hip Abduction',   'HIPS','Gluteus Medius',            ['bodyweight','band'],     'beginner',    'strength', ['trendelenburg','hip-stability']),
  ex('hp03','Standing Hip Abduction',     'HIPS','Gluteus Medius',            ['cable','band'],          'beginner',    'strength', ['trendelenburg']),
  ex('hp04','Monster Walk',               'HIPS','Hip Abductors',             ['band'],                  'beginner',    'strength', ['trendelenburg','hip-stability']),
  ex('hp05','Lateral Band Walk',          'HIPS','Hip Abductors',             ['band'],                  'beginner',    'strength', ['trendelenburg']),
  ex('hp06','Hip Hike (Pelvic Drop)',     'HIPS','Gluteus Medius',            ['bodyweight'],            'beginner',    'balance',  ['trendelenburg','hip-stability']),
  ex('hp07','Single-Leg Balance',         'HIPS','Gluteus Medius',            ['bodyweight'],            'beginner',    'balance',  ['trendelenburg','hip-stability']),
  ex('hp08','Single-Leg Deadlift',        'HIPS','Gluteus Medius',            ['dumbbell','bodyweight'], 'intermediate','balance',  ['trendelenburg']),
  ex('hp09','Hip Abductor Machine',       'HIPS','Hip Abductors',             ['machine'],               'beginner',    'strength', ['trendelenburg']),
  ex('hp10','Lateral Step-Up',            'HIPS','Gluteus Medius',            ['bodyweight','dumbbell'], 'intermediate','balance',  ['trendelenburg']),
  ex('hp11','Curtsy Lunge',               'HIPS','Gluteus Medius',            ['bodyweight','dumbbell'], 'intermediate','strength', ['trendelenburg']),
  ex('hp12','Sumo Squat',                 'HIPS','Hip Adductors',             ['barbell','dumbbell'],    'beginner',    'strength'),
  ex('hp13','Hip Flexor Stretch',         'HIPS','Hip Flexors',               ['bodyweight'],            'beginner',    'mobility'),
  ex('hp14','Pigeon Pose',                'HIPS','Hip External Rotators',     ['bodyweight'],            'beginner',    'mobility'),
  ex('hp15','IT Band Stretch',            'HIPS','IT Band',                   ['bodyweight'],            'beginner',    'mobility', ['trendelenburg']),
  ex('hp16','Copenhagen Plank',           'HIPS','Hip Adductors',             ['bodyweight'],            'intermediate','strength', ['trendelenburg','hip-stability']),
  ex('hp17','Side-Lying Hip Adduction',   'HIPS','Hip Adductors',             ['bodyweight','band'],     'beginner',    'strength', ['trendelenburg']),
  ex('hp18','Standing Hip Flexion',       'HIPS','Hip Flexors',               ['band','cable'],          'beginner',    'strength', ['trendelenburg']),
  ex('hp19','Prone Hip Extension',        'HIPS','Gluteus Medius',            ['bodyweight','band'],     'beginner',    'strength', ['trendelenburg','hip-stability']),
  ex('hp20','Seated Band Hip Abduction',  'HIPS','Hip Abductors',             ['band'],                  'beginner',    'strength', ['trendelenburg']),
  // ── GLUTES ────────────────────────────────────────────────────────────────
  ex('gl01','Barbell Hip Thrust',         'GLUTES','Gluteus Maximus',         ['barbell'],               'intermediate','strength'),
  ex('gl02','Dumbbell Hip Thrust',        'GLUTES','Gluteus Maximus',         ['dumbbell'],              'beginner',    'strength'),
  ex('gl03','Glute Bridge',               'GLUTES','Gluteus Maximus',         ['bodyweight','band'],     'beginner',    'strength'),
  ex('gl04','Single-Leg Glute Bridge',    'GLUTES','Gluteus Maximus',         ['bodyweight'],            'intermediate','strength', ['trendelenburg']),
  ex('gl05','Cable Kickback',             'GLUTES','Gluteus Maximus',         ['cable'],                 'beginner',    'strength'),
  ex('gl06','Machine Kickback',           'GLUTES','Gluteus Maximus',         ['machine'],               'beginner',    'strength'),
  ex('gl07','Step-Up',                    'GLUTES','Gluteus Maximus',         ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('gl08','Reverse Lunge',              'GLUTES','Gluteus Maximus',         ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('gl09','Bulgarian Split Squat',      'GLUTES','Gluteus Maximus',         ['dumbbell','barbell'],    'intermediate','strength'),
  ex('gl10','Donkey Kick',                'GLUTES','Gluteus Maximus',         ['bodyweight','band'],     'beginner',    'strength'),
  ex('gl11','Fire Hydrant',               'GLUTES','Gluteus Medius',          ['bodyweight','band'],     'beginner',    'strength', ['trendelenburg']),
  ex('gl12','Romanian Deadlift',          'GLUTES','Gluteus Maximus',         ['barbell','dumbbell'],    'intermediate','strength'),
  ex('gl13','Sumo Deadlift',              'GLUTES','Gluteus Maximus',         ['barbell'],               'advanced',    'strength'),
  ex('gl14','Frog Pump',                  'GLUTES','Gluteus Maximus',         ['bodyweight'],            'beginner',    'strength'),
  ex('gl15','Banded Glute Bridge',        'GLUTES','Gluteus Maximus',         ['bodyweight','band'],     'beginner',    'strength'),
  ex('gl16','Hip Thrust with Band',       'GLUTES','Gluteus Maximus',         ['band'],                  'beginner',    'strength'),
  ex('gl17','Single-Leg RDL',             'GLUTES','Gluteus Maximus',         ['dumbbell'],              'intermediate','strength', ['trendelenburg']),
  // ── QUADS ─────────────────────────────────────────────────────────────────
  ex('qu01','Barbell Back Squat',         'QUADS','Quadriceps (All)',          ['barbell'],               'intermediate','strength'),
  ex('qu02','Front Squat',                'QUADS','Rectus Femoris',           ['barbell'],               'advanced',    'strength'),
  ex('qu03','Goblet Squat',               'QUADS','Quadriceps (All)',          ['kettlebell','dumbbell'], 'beginner',    'strength'),
  ex('qu04','Leg Press',                  'QUADS','Quadriceps (All)',          ['machine'],               'beginner',    'strength'),
  ex('qu05','Leg Extension',              'QUADS','Quadriceps (All)',          ['machine'],               'beginner',    'strength'),
  ex('qu06','Walking Lunge',              'QUADS','Rectus Femoris',           ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('qu07','Jump Squat',                 'QUADS','Quadriceps (All)',          ['bodyweight'],            'intermediate','cardio'),
  ex('qu08','Hack Squat',                 'QUADS','Vastus Lateralis',          ['machine'],               'intermediate','strength'),
  ex('qu09','Split Squat',                'QUADS','Quadriceps (All)',          ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('qu10','Wall Sit',                   'QUADS','Quadriceps (All)',          ['bodyweight'],            'beginner',    'strength'),
  ex('qu11','Sissy Squat',                'QUADS','Rectus Femoris',           ['bodyweight'],            'advanced',    'strength'),
  ex('qu12','Box Squat',                  'QUADS','Quadriceps (All)',          ['barbell'],               'intermediate','strength'),
  ex('qu13','Heels-Elevated Squat',       'QUADS','Vastus Medialis',           ['bodyweight','dumbbell'], 'beginner',    'strength'),
  ex('qu14','Lateral Lunge',              'QUADS','Vastus Medialis',           ['bodyweight','dumbbell'], 'beginner',    'strength', ['trendelenburg']),
  // ── HAMSTRINGS ────────────────────────────────────────────────────────────
  ex('hm01','Romanian Deadlift',          'HAMSTRINGS','Biceps Femoris',      ['barbell','dumbbell'],    'intermediate','strength'),
  ex('hm02','Lying Leg Curl',             'HAMSTRINGS','Hamstrings (All)',     ['machine'],               'beginner',    'strength'),
  ex('hm03','Seated Leg Curl',            'HAMSTRINGS','Hamstrings (All)',     ['machine'],               'beginner',    'strength'),
  ex('hm04','Nordic Hamstring Curl',      'HAMSTRINGS','Biceps Femoris',      ['bodyweight','machine'],  'advanced',    'strength'),
  ex('hm05','Swiss Ball Leg Curl',        'HAMSTRINGS','Hamstrings (All)',     ['bodyweight'],            'intermediate','strength'),
  ex('hm06','Stiff-Leg Deadlift',         'HAMSTRINGS','Biceps Femoris',      ['barbell','dumbbell'],    'intermediate','strength'),
  ex('hm07','Glute-Ham Raise',            'HAMSTRINGS','Biceps Femoris',      ['machine'],               'advanced',    'strength'),
  ex('hm08','Single-Leg RDL',             'HAMSTRINGS','Biceps Femoris',      ['dumbbell','bodyweight'], 'intermediate','balance'),
  ex('hm09','Good Morning',               'HAMSTRINGS','Semitendinosus',       ['barbell'],               'intermediate','strength'),
  ex('hm10','Kettlebell Swing',           'HAMSTRINGS','Hamstrings (All)',     ['kettlebell'],            'intermediate','strength'),
  ex('hm11','Sumo RDL',                   'HAMSTRINGS','Biceps Femoris',      ['dumbbell','barbell'],    'intermediate','strength'),
  // ── CALVES ────────────────────────────────────────────────────────────────
  ex('ca01','Standing Calf Raise',        'CALVES','Gastrocnemius',           ['bodyweight','machine'],  'beginner',    'strength'),
  ex('ca02','Seated Calf Raise',          'CALVES','Soleus',                  ['machine'],               'beginner',    'strength'),
  ex('ca03','Single-Leg Calf Raise',      'CALVES','Gastrocnemius',           ['bodyweight'],            'beginner',    'strength'),
  ex('ca04','Donkey Calf Raise',          'CALVES','Gastrocnemius',           ['machine','bodyweight'],  'intermediate','strength'),
  ex('ca05','Tibialis Raise',             'CALVES','Tibialis Anterior',       ['bodyweight'],            'beginner',    'strength'),
  ex('ca06','Calf Press (Leg Press)',     'CALVES','Gastrocnemius',           ['machine'],               'beginner',    'strength'),
  ex('ca07','Jump Rope Bounces',          'CALVES','Gastrocnemius',           ['bodyweight'],            'beginner',    'cardio'),
  // ── CARDIO ────────────────────────────────────────────────────────────────
  ex('cd01','Running',                    'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  ex('cd02','Walking',                    'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  ex('cd03','Cycling',                    'CARDIO','Cardiovascular',          ['machine'],               'beginner',    'cardio'),
  ex('cd04','Jump Rope',                  'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  ex('cd05','Rowing Machine',             'CARDIO','Cardiovascular',          ['machine'],               'beginner',    'cardio'),
  ex('cd06','Burpee',                     'CARDIO','Full Body / Cardio',      ['bodyweight'],            'intermediate','cardio'),
  ex('cd07','High Knees',                 'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  ex('cd08','Box Jump',                   'CARDIO','Quads / Cardio',          ['bodyweight'],            'intermediate','cardio'),
  ex('cd09','Stair Climb',                'CARDIO','Cardiovascular',          ['bodyweight','machine'],  'beginner',    'cardio'),
  ex('cd10','Swimming',                   'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  ex('cd11','Elliptical',                 'CARDIO','Cardiovascular',          ['machine'],               'beginner',    'cardio'),
  ex('cd12','Battle Ropes',               'CARDIO','Cardiovascular',          ['machine'],               'intermediate','cardio'),
  ex('cd13','Sprint Intervals',           'CARDIO','Cardiovascular',          ['bodyweight'],            'advanced',    'cardio'),
  ex('cd14','Jumping Jacks',              'CARDIO','Cardiovascular',          ['bodyweight'],            'beginner',    'cardio'),
  // ── FULL BODY ─────────────────────────────────────────────────────────────
  ex('fb01','Power Clean',                'FULL BODY','Full Body Power',      ['barbell'],               'advanced',    'strength'),
  ex('fb02','Thruster',                   'FULL BODY','Quads / Shoulders',    ['barbell','dumbbell'],    'advanced',    'strength'),
  ex('fb03','Kettlebell Swing',           'FULL BODY','Posterior Chain',      ['kettlebell'],            'intermediate','strength'),
  ex('fb04','Turkish Get-Up',             'FULL BODY','Full Body Stability',  ['kettlebell'],            'advanced',    'balance'),
  ex('fb05','Bear Crawl',                 'FULL BODY','Full Body',            ['bodyweight'],            'beginner',    'strength'),
  ex('fb06','Man Maker',                  'FULL BODY','Full Body',            ['dumbbell'],              'advanced',    'strength'),
  ex('fb07','Clean & Press',              'FULL BODY','Full Body Power',      ['barbell'],               'advanced',    'strength'),
  ex('fb08','Barbell Complex',            'FULL BODY','Full Body',            ['barbell'],               'advanced',    'strength'),
  ex('fb09','Sandbag Carry',              'FULL BODY','Full Body',            ['machine'],               'intermediate','strength'),
  ex('fb10','Sled Push',                  'FULL BODY','Full Body',            ['machine'],               'intermediate','strength'),
  ex('fb11','Jumping Lunge',              'FULL BODY','Quads / Glutes',       ['bodyweight'],            'intermediate','cardio'),
  ex('fb12','Dumbbell Complex',           'FULL BODY','Full Body',            ['dumbbell'],              'intermediate','strength'),
  // ── MOBILITY ──────────────────────────────────────────────────────────────
  ex('mb01','Cat-Cow',                    'MOBILITY','Thoracic Spine',        ['bodyweight'],            'beginner',    'mobility'),
  ex('mb02',"Child's Pose",               'MOBILITY','Lower Back / Hips',     ['bodyweight'],            'beginner',    'mobility'),
  ex('mb03','Thoracic Rotation',          'MOBILITY','Thoracic Spine',        ['bodyweight'],            'beginner',    'mobility'),
  ex('mb04','Hip 90/90 Stretch',          'MOBILITY','Hip Rotators',          ['bodyweight'],            'beginner',    'mobility'),
  ex('mb05',"World's Greatest Stretch",   'MOBILITY','Hip Flexors / Thoracic',['bodyweight'],            'intermediate','mobility'),
  ex('mb06','Ankle Circles',              'MOBILITY','Ankle',                 ['bodyweight'],            'beginner',    'mobility'),
  ex('mb07','Doorway Chest Stretch',      'MOBILITY','Pectoralis Major',      ['bodyweight'],            'beginner',    'mobility'),
  ex('mb08','Lat Stretch',                'MOBILITY','Latissimus Dorsi',      ['bodyweight'],            'beginner',    'mobility'),
  ex('mb09','Standing Quad Stretch',      'MOBILITY','Quadriceps',            ['bodyweight'],            'beginner',    'mobility'),
  ex('mb10','Hamstring Stretch',          'MOBILITY','Hamstrings',            ['bodyweight'],            'beginner',    'mobility'),
  ex('mb11','Calf Stretch',               'MOBILITY','Gastrocnemius',         ['bodyweight'],            'beginner',    'mobility'),
  ex('mb12','Hip Flexor Lunge Stretch',   'MOBILITY','Hip Flexors',           ['bodyweight'],            'beginner',    'mobility'),
  ex('mb13','Shoulder Cross-Body',        'MOBILITY','Deltoid (Posterior)',   ['bodyweight'],            'beginner',    'mobility'),
  ex('mb14','Neck Rolls',                 'MOBILITY','Cervical Spine',        ['bodyweight'],            'beginner',    'mobility'),
  ex('mb15','Foam Roll IT Band',          'MOBILITY','IT Band',               ['bodyweight'],            'beginner',    'mobility', ['trendelenburg']),
  ex('mb16','Thoracic Extension',         'MOBILITY','Thoracic Spine',        ['bodyweight'],            'beginner',    'mobility'),
  ex('mb17','Kneeling Hip Flexor Stretch','MOBILITY','Hip Flexors',           ['bodyweight'],            'beginner',    'mobility', ['trendelenburg']),
  ex('mb18','Piriformis Stretch',         'MOBILITY','Hip External Rotators', ['bodyweight'],            'beginner',    'mobility'),
  ex('mb19','Figure Four Stretch',        'MOBILITY','Gluteus Medius',        ['bodyweight'],            'beginner',    'mobility', ['trendelenburg']),
];

// ─── Exercise instructions ────────────────────────────────────────────────────

export const EXERCISE_INSTRUCTIONS: Record<string, string[]> = {
  // HIPS — Trendelenburg priority
  'hp01': [
    'Lie on your side, hips stacked directly on top of each other',
    'Bend knees to 45° — feet stay together throughout',
    'Keeping feet together, rotate top knee upward like a clamshell opening',
    'Pause at top — squeeze the outer hip hard for 1 second',
    'Lower slowly with control — don\'t let the pelvis roll back',
  ],
  'hp02': [
    'Lie on your side, body in a straight line from head to heel',
    'Bottom leg slightly bent for stability',
    'Top leg straight, toes pointing slightly down toward floor',
    'Raise top leg to about 45° — feel the outer hip engage',
    'Hold briefly at top, then lower slowly — repeat without touching',
  ],
  'hp03': [
    'Stand tall facing a wall or holding support if needed',
    'Attach band at ankle or use cable set to ankle height',
    'Standing leg slightly bent — stay tall through the spine',
    'Lift the working leg out to the side, keeping toes forward',
    'Don\'t let your torso tilt — the hip does the work',
    'Return slowly under control',
  ],
  'hp04': [
    'Place band around thighs just above knees',
    'Feet shoulder-width apart, slight bend in knees, small forward lean',
    'Push knees OUT against the band — maintain this tension throughout',
    'Step sideways: lead foot out, trail foot follows — never let knees cave',
    'Keep steps small and controlled — feel the outer hip burn',
    'Go 10 steps each direction = 1 set',
  ],
  'hp05': [
    'Place resistance band around ankles or just above knees',
    'Stand with soft knees, slight forward lean from hips',
    'Step sideways with one foot, maintaining band tension',
    'Bring the other foot to meet it — don\'t let it fully close (keep tension)',
    'Stay low throughout — feel outer hips and glutes working',
    'Alternate 10 steps each direction',
  ],
  'hp06': [
    'Stand on one leg on a slightly raised surface (step or curb)',
    'Standing hip level, other foot hanging freely off the edge',
    'Allow hanging hip to DROP — this is the starting position',
    'Now hike the hanging hip UP using your standing glute medius',
    'Hold at the top for 2 seconds — pelvis should be level or slightly elevated',
    'Lower slowly and repeat — this trains the exact muscle weak in Trendelenburg gait',
  ],
  'hp07': [
    'Stand near a wall for safety if needed',
    'Lift one foot off the ground, knee slightly bent',
    'Hold position — keep your hips LEVEL (don\'t let one drop)',
    'Focus on the standing hip, squeeze outer glute to stabilize',
    'Eyes forward, slight bend in standing knee',
    'Hold 20–30 seconds each side, progress to eyes closed',
  ],
  'hp08': [
    'Stand on one leg, slight bend in the knee',
    'Hold a dumbbell in opposite hand to standing leg (optional)',
    'Hinge forward at the hip, extending free leg behind you',
    'Keep hips SQUARE to the floor — don\'t let the swinging hip open out',
    'Lower until body is roughly parallel to floor',
    'Drive through standing heel to return upright — squeeze glute at top',
  ],
  'hp09': [
    'Sit in the hip abductor machine, pads on outer thighs',
    'Set a weight that allows full range without compensating',
    'Press thighs OUT against the pads — slow and controlled',
    'Don\'t arch back or lean into the motion — stay upright',
    'Pause at max abduction for 1 second',
    'Return slowly — resist the pads on the way back in',
  ],
  'hp10': [
    'Stand beside a step or low box',
    'Step laterally onto the step with the closest foot',
    'Drive through that foot to lift your full body weight onto the step',
    'Stand tall at the top — don\'t let opposite hip drop',
    'Step down slowly and with control',
    'Complete all reps on one side, then switch',
  ],
  'hp11': [
    'Stand with feet shoulder-width apart, hands on hips',
    'Step one foot diagonally BEHIND and across to the opposite side',
    'Lower into a lunge — both knees bend to ~90°',
    'Front knee stays directly over ankle — don\'t let it cave in',
    'Feel the outer hip and glute of the FRONT leg working hard',
    'Drive through front foot to stand, return to start',
  ],
  'hp16': [
    'Lie on your side, top foot resting on a bench or chair',
    'Bottom leg straight on the floor',
    'Brace core — keep hips stacked',
    'Lift hips off the ground so body forms a straight line',
    'Hold position — feel inner thigh of top leg and outer hip of bottom leg working',
    'This is one of the best exercises for hip adductor & gait stability',
  ],
  'hp17': [
    'Lie on your side, body straight, top leg on top of bottom',
    'Keep toes pointing forward throughout',
    'LOWER your top leg toward the floor — you\'re working the inner thigh',
    'Resist the movement — don\'t let it drop freely',
    'Lower as far as comfortable, then raise back to start',
    'Can add a band above knees for resistance',
  ],
  'hp18': [
    'Stand holding support or anchor a band behind you at ankle height',
    'Stand on one leg, slight bend in knee',
    'Drive working knee upward in front — hip flexion',
    'Don\'t lean back — keep torso tall and upright',
    'Pause at top, then lower slowly',
    'Strengthens hip flexors which are key for gait mechanics',
  ],
  'hp19': [
    'Lie face down on the floor, legs straight',
    'Keep core engaged — don\'t arch lower back',
    'Lift one leg straight off the floor — squeeze glute and outer hip',
    'Hold 1–2 seconds at the top',
    'Lower slowly — don\'t let it drop',
    'Can add ankle band for extra resistance',
  ],
  'hp20': [
    'Sit on a chair or bench with band looped above knees',
    'Feet flat on floor, hip-width apart',
    'Push knees OUTWARD against the band',
    'Hold max abduction for 2 seconds — feel outer hips contract',
    'Return slowly — maintain tension throughout',
    'Good seated option for early rehab or warm-up',
  ],
  // GLUTES
  'gl01': [
    'Sit on floor with upper back against a bench, barbell across hips (pad for comfort)',
    'Feet flat, knees bent at about 90° when at top position',
    'Drive through both heels to thrust hips upward',
    'At the top: body forms a straight line from shoulders to knees',
    'Squeeze glutes hard at the top — don\'t hyperextend lower back',
    'Lower slowly to just above floor, repeat',
  ],
  'gl03': [
    'Lie on your back, knees bent, feet flat on floor hip-width apart',
    'Arms flat by sides or hands on hips',
    'Drive through HEELS — lift hips off the floor',
    'At the top: straight line from shoulders to knees',
    'Squeeze glutes at the top — don\'t arch your back',
    'Lower slowly with control',
  ],
  'gl04': [
    'Lie on back, one leg bent with foot flat, other leg straight and raised',
    'Drive through the bent leg\'s heel to lift hips',
    'Keep hips LEVEL — don\'t let raised side drop',
    'Squeeze glute of working leg at the top',
    'Lower slowly, maintaining control',
    'This unilateral version exposes hip stability differences between sides',
  ],
  'gl09': [
    'Stand facing away from a bench, one foot elevated on it',
    'Front foot about 2–3 feet forward of the bench',
    'Lower back knee toward the floor — keep torso upright',
    'Front knee stays over ankle — don\'t let it drift forward excessively',
    'Drive through the front heel to stand — feel the front glute at the top',
    'One of the best single-leg glute developers',
  ],
  // BACK
  'bk01': [
    'Stand with feet hip-width, bar over mid-foot',
    'Hinge and grip bar just outside legs — double overhand or mixed grip',
    'Big breath, brace core, pull slack from bar before lifting',
    'Push the floor away — don\'t think about pulling up',
    'Keep bar dragging against shins the whole way up',
    'Stand tall at top, hips and knees locked — lower with control',
  ],
  'bk07': [
    'Hang from bar, hands shoulder-width apart, palms facing away',
    'Dead hang to start — let lats stretch',
    'Depress scapulae first (pull shoulders away from ears)',
    'Pull elbows toward your hips — chin clears the bar',
    'Don\'t kip or swing — slow and controlled',
    'Lower slowly back to dead hang for full range',
  ],
  'bk02': [
    'Stand with barbell, hinge at hips to ~45° from floor',
    'Flat back, brace core — bar hanging under chest',
    'Pull bar toward lower chest, driving elbows back past torso',
    'Squeeze shoulder blades together at top',
    'Don\'t jerk or use momentum — stay braced',
    'Lower slowly back to start',
  ],
  // CHEST
  'ch01': [
    'Lie on bench, bar over eyes, feet flat on floor',
    'Grip slightly wider than shoulder-width, wrists neutral',
    'Unrack bar, lower to lower chest — slight diagonal path',
    'Touch chest lightly — no bouncing',
    'Press back up and slightly back toward rack',
    'Keep shoulder blades pinched together throughout',
  ],
  'ch11': [
    'Hands shoulder-width, body in a straight line from head to heels',
    'Core tight — don\'t let hips sag or pike up',
    'Lower chest to about 2cm from floor — elbows at ~45° from body',
    'Press back up through palms — fully extend but don\'t lock elbows',
    'Breathe in on the way down, out on the way up',
  ],
  // SHOULDERS
  'sh01': [
    'Stand with barbell at collarbone height, hands just wider than shoulders',
    'Core braced, glutes squeezed, slight forward lean of torso',
    'Press bar overhead in a slightly backward arc to clear nose/chin',
    'At the top: bar over traps, arms fully extended, head through',
    'Lower under control back to clavicle',
    'Don\'t lean back excessively — core must stay engaged',
  ],
  // QUADS
  'qu01': [
    'Bar resting on upper traps, feet shoulder-width, toes slightly out',
    'Unrack, take 2 steps back, feet set',
    'Big breath and brace — push knees OUT as you descend',
    'Squat until thighs parallel to floor or below',
    'Drive through heels to stand — keep chest up throughout',
    'Don\'t let knees cave — track them over 2nd and 3rd toe',
  ],
  // CORE
  'co01': [
    'Forearms flat on floor, elbows under shoulders',
    'Body forms a straight line from head to heels',
    'Core braced — imagine pulling navel toward spine',
    'Don\'t let hips sag or pike — squeeze glutes',
    'Breathe normally — don\'t hold your breath',
    'Hold for time — increase duration progressively',
  ],
  'co13': [
    'Lie on back, arms extended to ceiling, legs raised, knees bent 90°',
    'Lower back PRESSED into the floor — keep it there the whole time',
    'Slowly lower one arm overhead AND the opposite leg toward the floor',
    'Don\'t let the lower back lift — if it does, reduce range of motion',
    'Return to start, then alternate sides',
    'Challenges core stability without loading the spine',
  ],
  'co14': [
    'Start on hands and knees, wrists under shoulders, knees under hips',
    'Brace core — keep spine neutral (not arched or rounded)',
    'Extend one arm straight forward AND opposite leg straight back',
    'Hold 2 seconds — hips stay LEVEL (don\'t rotate)',
    'Bring back to start, repeat other side',
    'Trains anti-rotation stability, key for gait coordination',
  ],
  'co02': [
    'Lie on side, forearm flat, elbow under shoulder',
    'Stack feet or stagger for stability',
    'Lift hips so body is a straight diagonal line',
    'Don\'t let hips sag or rotate forward/backward',
    'Hold for time or do controlled dips',
    'Trains lateral core stability, important for gait',
  ],
  // BACK — additional
  'bk05': [
    'Sit at cable machine, feet on platform, slight bend in knees',
    'Grip handles with neutral grip (palms facing each other)',
    'Sit tall — don\'t round or over-extend lower back',
    'Pull handles to lower stomach, driving elbows past torso',
    'Squeeze shoulder blades together at end — hold 1 second',
    'Return slowly — let shoulder blades protract forward before next rep',
  ],
  'bk06': [
    'Place one knee and same-side hand on bench, opposite foot on floor',
    'Back flat and parallel to floor — neutral spine',
    'Hold dumbbell in hanging arm, palm facing body',
    'Pull dumbbell to hip, driving elbow back and up',
    'Don\'t rotate torso — stay square to the bench',
    'Lower slowly back to full arm extension',
  ],
  'bk08': [
    'Hang from bar with palms facing YOU (supinated grip), shoulder-width',
    'Dead hang — let lats fully stretch at bottom',
    'Pull chest toward bar — lead with elbows driving down',
    'Chin clears bar at top — squeeze biceps and lats',
    'Lower slowly back to dead hang for full range',
    'Easier than pull-up — great for building lat strength',
  ],
  'bk10': [
    'Sit at lat pulldown machine, thighs secured under pad',
    'Grip bar slightly wider than shoulders, palms facing away',
    'Lean back very slightly — about 10–15°',
    'Pull bar to upper chest, driving elbows down toward hips',
    'Squeeze lats at bottom — don\'t shrug shoulders',
    'Return slowly — control the weight back up',
  ],
  'bk13': [
    'Set cable to head height or above, rope or W-bar attachment',
    'Stand 2–3 feet back, feet shoulder-width, slight bend in knees',
    'Pull rope to face, separating handles at the end',
    'At full contraction: thumbs point behind you, elbows at shoulder height',
    'Squeeze rear delts and rotator cuff — hold 1 second',
    'Return slowly — don\'t let cable yank you forward',
  ],
  'bk19': [
    'Set bar at hip height in a rack or Smith machine',
    'Lie underneath, hands shoulder-width, body in a straight line',
    'Heels on floor, arms extended up to the bar',
    'Pull chest to bar, driving elbows back and past torso',
    'Keep body rigid — don\'t let hips sag',
    'Lower slowly with full control — excellent back + core exercise',
  ],
  // SHOULDERS — additional
  'sh02': [
    'Sit upright on bench, dumbbells at shoulder height, palms forward',
    'Core braced — don\'t arch lower back to help press',
    'Press dumbbells overhead, arcing slightly together at the top',
    'Don\'t fully lock elbows — keep slight bend at top',
    'Lower slowly back to shoulder height — full range',
    'Keep head neutral — don\'t jut chin forward',
  ],
  'sh04': [
    'Stand with dumbbells at sides, slight bend at elbows',
    'Brace core — slight forward lean of torso (10–15°)',
    'Raise arms out to sides to shoulder height — lead with elbows',
    'Pinky slightly higher than thumb at top (like pouring a pitcher)',
    'Don\'t swing or use momentum — control the weight',
    'Lower slowly — the eccentric builds the muscle',
  ],
  'sh07': [
    'Sit on bench, hinged forward at hips (chest near knees)',
    'Dumbbells hang below, slight bend in elbows',
    'Raise both arms out to the sides — rear deltoid movement',
    'Lift only to shoulder height — don\'t go higher',
    'Squeeze rear delts at top — hold briefly',
    'Lower slowly without letting dumbbells swing',
  ],
  'sh08': [
    'Set cable at head height or above with rope attachment',
    'Stand back, grip rope with both hands, neutral grip',
    'Pull rope to your face while externally rotating forearms',
    'At end: hands beside ears, elbows flared, thumbs pointing back',
    'Targets rear delt AND rotator cuff together',
    'Return slowly — one of the best shoulder health exercises',
  ],
  // BICEPS
  'bi01': [
    'Stand with barbell, underhand grip shoulder-width apart',
    'Arms fully extended at bottom — elbows at sides',
    'Curl bar up by flexing elbow — keep upper arm stationary',
    'At top: squeeze bicep hard, bar near shoulders',
    'Lower slowly — take 2–3 seconds on the way down',
    'Don\'t swing body or let elbows drift forward',
  ],
  'bi03': [
    'Stand or sit with dumbbells at sides, palms forward',
    'Curl one or both dumbbells — keep upper arm pinned to side',
    'Rotate palm slightly outward as you curl (supination)',
    'Squeeze bicep hard at top',
    'Lower slowly and fully — full range of motion matters',
    'Alternate arms or do both simultaneously',
  ],
  'bi04': [
    'Hold dumbbells at sides, palms facing each other (neutral grip)',
    'Curl both dumbbells keeping the neutral grip throughout — don\'t rotate',
    'This targets the brachialis underneath the bicep',
    'Also loads the forearm strongly',
    'Keep upper arms still — only forearms move',
    'Lower slowly back to full extension',
  ],
  // TRICEPS
  'tr04': [
    'Stand at cable machine, bar or straight attachment at chest height',
    'Grip with overhand grip, elbows at sides — keep them there',
    'Upper arms pinned — only forearms move',
    'Push bar down until arms fully extended',
    'Squeeze triceps hard at bottom — hold 1 second',
    'Return slowly to starting position — don\'t let elbows flare',
  ],
  'tr08': [
    'Grip parallel bars, arms extended, body upright or slightly forward',
    'Lower yourself by bending elbows to ~90° — no lower if shoulder pain',
    'Stay as upright as possible to target triceps (lean forward for chest)',
    'Press back up to full arm extension — squeeze triceps at top',
    'Don\'t swing body — controlled movement throughout',
    'Add weight via dip belt when bodyweight becomes easy',
  ],
  // QUADS — additional
  'qu03': [
    'Hold kettlebell or dumbbell at chest height, both hands (goblet hold)',
    'Feet slightly wider than hip-width, toes turned out 15–20°',
    'Push knees out in line with toes as you descend',
    'Squat deep — elbows track between knees at the bottom',
    'Drive through heels to stand — keep chest tall throughout',
    'The goblet position counterbalances, making deeper squats easier',
  ],
  'qu04': [
    'Sit in leg press machine, feet hip-width on platform',
    'Feet flat — not just heels or toes',
    'Lower weight slowly until knees at 90° (or deeper if comfortable)',
    'Never lock knees out fully at the top — keep slight bend',
    'Push evenly through both feet — don\'t let knees cave inward',
    'Adjust foot position: higher = more glutes/hams, lower = more quads',
  ],
  'qu06': [
    'Hold dumbbells at sides (or no weight to start)',
    'Step forward far enough that both knees can reach 90°',
    'Front knee stays over ankle — don\'t let it drift past toes',
    'Back knee hovers just above the floor at the bottom',
    'Push through front foot to take the next step forward',
    'Alternate legs with each step — keep torso upright throughout',
  ],
  'qu10': [
    'Stand with back flat against a wall, feet 60cm away from it',
    'Slide down until thighs are parallel to floor (90° at knee)',
    'Feet hip-width apart, toes forward or slightly out',
    'Keep back fully in contact with the wall',
    'Press through heels — don\'t push through toes',
    'Hold for time — builds quad endurance and knee stability',
  ],
  // HAMSTRINGS — additional
  'hm01': [
    'Stand holding bar at hip level, feet hip-width',
    'Hinge at hips — push them backward as bar slides down legs',
    'Keep slight bend in knees throughout — don\'t squat',
    'Lower until you feel a hamstring stretch (usually mid-shin for most)',
    'Drive hips forward to stand — squeeze glutes at top',
    'Bar stays close to body throughout',
  ],
  'hm02': [
    'Lie face down on leg curl machine, heels under pad',
    'Pad should sit at ankle or just above heel',
    'Curl heels toward glutes in a smooth arc',
    'Squeeze hamstrings hard at peak contraction',
    'Lower slowly — take 2–3 seconds on the way down',
    'Don\'t let hips lift off the pad as you curl',
  ],
  'hm04': [
    'Kneel on a mat, feet anchored under a bar or by a partner',
    'Body upright at the knee — straight line from knee to shoulder',
    'Slowly lower your torso toward the floor, staying rigid',
    'Control the descent as long as possible',
    'Use hands to push off the floor and return to top',
    'One of the best exercises for hamstring injury prevention',
  ],
  'hm10': [
    'Stand with feet hip-width, kettlebell hanging in front',
    'Hinge at hips — push them back, soft bend in knees',
    'Load hamstrings at the bottom — not a squat movement',
    'Explosively drive hips forward — let the bell float to shoulder height',
    'Hinge forward again as bell descends — absorb it, don\'t fight it',
    'All power from the hip hinge, not the arms',
  ],
  // GLUTES — additional
  'gl05': [
    'Stand at cable machine, ankle attachment at lowest setting',
    'Face the machine, holding support for balance',
    'Keep standing leg slightly bent — don\'t lock',
    'Kick working leg back and up — squeeze glute at top',
    'Don\'t lean forward to compensate — torso stays tall',
    'Lower slowly back to start — control throughout',
  ],
  'gl08': [
    'Stand upright with dumbbells at sides or hands free',
    'Step one foot backward, landing on the ball of the foot',
    'Lower back knee toward floor — front knee stays over ankle',
    'Front thigh approaches parallel to floor at the bottom',
    'Drive through front heel to stand back up',
    'Reverse lunge places more load on the front glute than forward lunge',
  ],
  'gl10': [
    'Start on hands and knees, wrists under shoulders, knees under hips',
    'Keep core braced — spine neutral throughout',
    'Keeping knee bent at 90°, kick one heel up toward ceiling',
    'Squeeze glute hard at the top — don\'t overextend lower back',
    'Lower leg back without touching the floor — keep tension',
    'Can add ankle band or weight for more resistance',
  ],
  'gl11': [
    'Start on hands and knees, core braced',
    'Lift one knee out to the side — like a dog at a fire hydrant',
    'Raise until thigh is parallel to floor — hip rotates, not spine',
    'Squeeze outer glute (gluteus medius) at top',
    'Lower slowly back without fully resting',
    'Add band above knees for more resistance — great Trendelenburg exercise',
  ],
  // CALVES
  'ca01': [
    'Stand on edge of step or floor, feet hip-width',
    'Rise up onto balls of feet — full plantar flexion',
    'Hold the top for 1 second — squeeze calves hard',
    'Lower slowly and fully — stretch calf at the bottom',
    'Don\'t bounce at the bottom — full range, full control',
    'Single-leg version gives much more stimulus',
  ],
  'ca03': [
    'Stand on one foot at edge of step, other foot slightly behind',
    'Hold support if needed for balance',
    'Lower heel as far as possible below step level — full stretch',
    'Rise up onto ball of foot — full contraction',
    'Don\'t rush — slow controlled reps beat bouncing',
    'Single-leg version typically builds more muscle than bilateral',
  ],
  // CORE — additional
  'co03': [
    'Lie on back, arms extended to ceiling, legs raised with knees bent',
    'Press lower back firmly into floor — this is the key',
    'Lower arms overhead while extending legs away — lower back must stay down',
    'If lower back lifts, decrease the range of motion',
    'Hold the hollow position — breathe steadily',
    'One of the most effective core stability exercises',
  ],
  'co04': [
    'Kneel with ab wheel in both hands on the floor',
    'Start with core braced, lower back flat (not arched)',
    'Roll forward slowly — body extends toward floor',
    'Go only as far as you can without lower back arching',
    'Pull back using abs — don\'t push with arms',
    'Start with partial range; extend range as strength builds',
  ],
  'co05': [
    'Lie on back, knees bent, feet flat, fingers at temples',
    'Lower back can stay neutral — a slight arch is fine',
    'Curl upper back off the floor — only first 30° of movement',
    'Squeeze abs at top — hold for 1 second',
    'Lower slowly without fully resting shoulders',
    'Don\'t pull on your neck — the movement comes from the abs',
  ],
  'co06': [
    'Lie on back, hands under lower back or palms flat beside hips',
    'Bring knees to chest, then extend legs to 45° away from floor',
    'Lower legs as far as possible without lower back lifting',
    'Reverse crunch: use abs to curl tailbone off floor at the bottom',
    'Control the movement — don\'t swing legs',
    'Targets the lower portion of the rectus abdominis',
  ],
  'co08': [
    'Hang from pull-up bar, dead hang',
    'Brace core and pull knees toward chest',
    'Avoid swinging — initiate with abs, not momentum',
    'Hold at top for 1 second — squeeze abs',
    'Lower slowly back to dead hang — don\'t just drop',
    'Progress to straight-leg raise when this becomes easy',
  ],
  'co10': [
    'Lie on back, hands at temples, knees bent at 90°',
    'Extend one leg while bringing that side\'s elbow toward opposite knee',
    'Rotate through the core — not just moving elbow and knee',
    'Alternate sides in a smooth pedaling motion',
    'Don\'t rush — slow rotations are more effective',
    'Keep lower back in contact with the floor throughout',
  ],
  // HAMSTRINGS
};

// ─── Session plan builder ──────────────────────────────────────────────────────

function getRepsLabel(e: Exercise): string {
  if (e.type === 'cardio') return 'Keep moving';
  if (e.type === 'mobility') return 'Hold 20–30 sec';
  if (e.type === 'balance') return 'Hold steady each side';
  if (e.difficulty === 'beginner') return '12–15 reps';
  if (e.difficulty === 'intermediate') return '10–12 reps';
  return '6–8 reps';
}

function getWorkDuration(e: Exercise): number {
  if (e.type === 'cardio') return 45;
  if (e.type === 'mobility' || e.type === 'balance') return 30;
  if (e.difficulty === 'beginner') return 35;
  if (e.difficulty === 'advanced') return 50;
  return 42;
}

function getRestBetweenSets(e: Exercise): number {
  if (e.type === 'mobility' || e.type === 'cardio') return 30;
  if (e.difficulty === 'beginner') return 60;
  if (e.difficulty === 'advanced') return 90;
  return 75;
}

function getSetsCount(e: Exercise): number {
  if (e.type === 'mobility') return 2;
  if (e.difficulty === 'advanced') return 4;
  return 3;
}

// ─── Time-budget-aware allocation ────────────────────────────────────────────
// Sets/work/rest used to come straight from the lookup tables above and were
// never checked against the time budget, so a session could quietly run well
// past what you said you had. Instead: reserve warmup/cooldown/transitions
// first, split what's left evenly across exercises, then compress each
// exercise into its slot — rest between sets shrinks first (down to a floor),
// then set count, then work duration itself as a last resort. "Intensity" is
// just how much of that compression actually happened.

export type IntensityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

interface ExerciseConfig {
  exercise: Exercise;
  sets: number;
  workDur: number;
  restSetDur: number;
  /** 0 = ran at comfortable/default pace, 1 = fully floored */
  compression: number;
}

function configureExercise(e: Exercise, slotSeconds: number): ExerciseConfig {
  const minRest = e.type === 'mobility' || e.type === 'cardio' ? 15 : 20;
  const minWork = 20;
  const minSets = e.type === 'mobility' ? 1 : 2;

  let sets = getSetsCount(e);
  let work = getWorkDuration(e);
  let rest = getRestBetweenSets(e);
  const totalFor = (s: number, w: number, r: number) => s * w + Math.max(0, s - 1) * r;
  const comfortable = totalFor(sets, work, rest);

  while (totalFor(sets, work, rest) > slotSeconds && rest > minRest) rest = Math.max(minRest, rest - 5);
  while (totalFor(sets, work, rest) > slotSeconds && sets > minSets) sets -= 1;
  while (totalFor(sets, work, rest) > slotSeconds && work > minWork) work = Math.max(minWork, work - 5);

  const actual = totalFor(sets, work, rest);
  const compression = comfortable > 0 ? Math.max(0, 1 - actual / comfortable) : 0;
  return { exercise: e, sets, workDur: work, restSetDur: rest, compression };
}

interface SessionPlanInputs {
  configs: ExerciseConfig[];
  warmupDur: number;
  cooldownDur: number;
  transitionDur: number;
}

function planSessionInputs(exercises: Exercise[], totalMinutes: number): SessionPlanInputs {
  const budget = totalMinutes * 60;
  const warmupDur = Math.min(300, Math.max(60, Math.floor(budget * 0.06)));
  const cooldownDur = 120;
  const n = exercises.length;
  const transitionCount = Math.max(0, n - 1);

  // Transitions compress too, down to a floor, before eating into slot time.
  let transitionDur = 90;
  const minTransition = 30;
  let remaining = budget - warmupDur - cooldownDur - transitionDur * transitionCount;
  while (remaining < n * 40 && transitionDur > minTransition) {
    transitionDur -= 5;
    remaining = budget - warmupDur - cooldownDur - transitionDur * transitionCount;
  }

  const slot = Math.max(40, remaining / n);
  const configs = exercises.map((e) => configureExercise(e, slot));
  return { configs, warmupDur, cooldownDur, transitionDur };
}

/** How compressed a session is against this time budget — LOW means it ran
 *  at (or under) comfortable defaults, HIGH means sets/rest/work were all
 *  squeezed toward their floors to fit. */
export function estimateSessionIntensity(
  exerciseIds: string[],
  totalMinutes: number,
  extras?: ReadonlyMap<string, Exercise>,
): IntensityLevel {
  const exercises = exerciseIds
    .map((id) => EXERCISES.find((e) => e.id === id) ?? extras?.get(id))
    .filter((e): e is Exercise => e !== undefined);
  if (exercises.length === 0) return 'LOW';

  const { configs } = planSessionInputs(exercises, totalMinutes);
  const avgCompression = configs.reduce((s, c) => s + c.compression, 0) / configs.length;
  if (avgCompression < 0.10) return 'LOW';
  if (avgCompression < 0.35) return 'MEDIUM';
  return 'HIGH';
}

export function buildSessionPlan(
  exerciseIds: string[],
  totalMinutes: number,
  extras?: ReadonlyMap<string, Exercise>,
): Phase[] {
  const plan: Phase[] = [];
  const exercises = exerciseIds
    .map((id) => EXERCISES.find((e) => e.id === id) ?? extras?.get(id))
    .filter((e): e is Exercise => e !== undefined);

  if (exercises.length === 0) return plan;

  const { configs, warmupDur, cooldownDur, transitionDur } = planSessionInputs(exercises, totalMinutes);

  plan.push({
    kind: 'warmup',
    durationSeconds: warmupDur,
    label: 'WARM UP',
    sublabel: 'Joint circles, light movement',
    nextLabel: `FIRST: ${exercises[0].name.toUpperCase()}`,
  });

  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    const { sets, workDur, restSetDur } = configs[i];
    const restExDur = transitionDur;
    const reps = getRepsLabel(e);
    const nextEx = exercises[i + 1];

    for (let s = 0; s < sets; s++) {
      const isLastSet = s === sets - 1;
      plan.push({
        kind: 'work',
        durationSeconds: workDur,
        exerciseId: e.id,
        setNumber: s + 1,
        totalSets: sets,
        repsLabel: reps,
        label: e.name.toUpperCase(),
        sublabel: `Set ${s + 1} of ${sets}`,
        nextLabel: isLastSet
          ? (nextEx ? `REST · THEN ${nextEx.name.toUpperCase()}` : 'COOL DOWN NEXT')
          : `REST ${restSetDur}s · THEN SET ${s + 2}`,
        autoComplete: isLastSet,
      });

      if (!isLastSet) {
        plan.push({
          kind: 'rest-set',
          durationSeconds: restSetDur,
          exerciseId: e.id,
          label: 'REST',
          sublabel: `${e.name} — Set ${s + 2} of ${sets} coming up`,
          nextLabel: `${e.name.toUpperCase()} · Set ${s + 2}`,
        });
      }
    }

    if (i < exercises.length - 1) {
      plan.push({
        kind: 'rest-exercise',
        durationSeconds: restExDur,
        label: 'TRANSITION',
        sublabel: 'Rest · set up for next exercise',
        nextLabel: `NEXT: ${nextEx!.name.toUpperCase()}`,
      });
    }
  }

  plan.push({
    kind: 'cooldown',
    durationSeconds: cooldownDur,
    label: 'COOL DOWN',
    sublabel: 'Stretch, breathe, recover',
    nextLabel: 'SESSION COMPLETE',
  });

  return plan;
}

export function planEstimatedMinutes(exerciseIds: string[], extras?: ReadonlyMap<string, Exercise>): number {
  const plan = buildSessionPlan(exerciseIds, 999, extras);
  return Math.ceil(plan.reduce((s, p) => s + p.durationSeconds, 0) / 60);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getExercisesByBodyPart(bp: BodyPart): Exercise[] {
  return EXERCISES.filter((e) => e.bodyPart === bp);
}

export function getMuscleGroups(bp: BodyPart): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  EXERCISES.filter((e) => e.bodyPart === bp).forEach((e) => {
    if (!seen.has(e.muscle)) { seen.add(e.muscle); result.push(e.muscle); }
  });
  return result;
}

const UPPER_PARTS = new Set<BodyPart>(['CHEST','BACK','SHOULDERS','BICEPS','TRICEPS','FOREARMS']);
const LOWER_PARTS = new Set<BodyPart>(['QUADS','HAMSTRINGS','CALVES','HIPS','GLUTES']);

export function deriveWorkoutCategory(
  exerciseIds: string[],
  extras?: ReadonlyMap<string, Exercise>,
): 'upper' | 'lower' | 'cardio' | 'full' {
  let u = 0, l = 0, c = 0;
  exerciseIds.forEach((id) => {
    const e = EXERCISES.find((x) => x.id === id) ?? extras?.get(id);
    if (!e) return;
    if (e.bodyPart === 'CARDIO') c++;
    else if (UPPER_PARTS.has(e.bodyPart)) u++;
    else if (LOWER_PARTS.has(e.bodyPart)) l++;
  });
  const total = u + l + c;
  if (total === 0) return 'upper';
  if (c / total > 0.6) return 'cardio';
  if (u > 0 && l > 0) return 'full';
  if (l > u) return 'lower';
  return 'upper';
}
