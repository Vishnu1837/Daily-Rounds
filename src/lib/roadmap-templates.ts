/**
 * Roadmap templates.
 *
 * Two sources feed the same shape:
 *
 *  - CURATED — hand-built exam-prep plans, grouped the way a cohort lead would teach them.
 *  - CURRICULUM — derived from the 19-subject MBBS tree in src/lib/curriculum. One template
 *    per subject section: each curriculum topic becomes a week, and its detail nodes become
 *    the week's roadmap topics. That gives day-sized study items straight out of the
 *    syllabus, for every subject in the course rather than the handful we wrote by hand.
 *
 * Onboarding applies the matching template automatically so a new student has a real
 * roadmap on day one, and the admin console can apply or replace one at any time. Every
 * topic remains fully editable afterwards.
 */
import { CURRICULUM_SUBJECTS, buildRef } from './curriculum';
import type { SubjectSlug } from './subjects';

/**
 * A week of a template.
 *
 * `ref` is where the week sits in the curriculum, and every topic in it inherits that ref
 * when the template is applied. It is what lets a quiz or a reading list written against the
 * curriculum find the student studying it — see src/lib/curriculum/refs.ts.
 */
export type TemplateWeek = { title: string; ref: string | null; topics: string[] };

export type RoadmapTemplate = {
  subject: SubjectSlug;
  title: string;
  track: string;
  weeks: TemplateWeek[];
};

/** Curated templates: a track plus week-by-week topics, as an admin would build them. */
const CURATED_TEMPLATES = {
  general_pathology: {
    subject: 'pathology',
    title: 'Pathology — General Pathology',
    track: 'General Pathology',
    weeks: [
      {
        title: 'Cell Injury & Inflammation Basics',
        ref: 'pathology/general-pathology',
        topics: [
          'Cell Injury — reversible and irreversible',
          'Cellular Adaptation — hypertrophy, hyperplasia, atrophy',
          'Necrosis — patterns and mechanisms',
          'Apoptosis and its regulation',
          'Introduction to Inflammation',
        ],
      },
      {
        title: 'Inflammation, Healing & Haemodynamics',
        ref: 'pathology/general-pathology',
        topics: [
          'Acute Inflammation — vascular and cellular events',
          'Chemical Mediators of Inflammation',
          'Chronic Inflammation and granulomas',
          'Tissue Repair and Wound Healing',
          'Haemodynamic Disorders — oedema and hyperaemia',
        ],
      },
      {
        title: 'Thrombosis, Shock & Immunopathology',
        ref: 'pathology/general-pathology',
        topics: [
          'Thrombosis — Virchow triad',
          'Embolism and Infarction',
          'Shock — stages and pathogenesis',
          'Hypersensitivity Reactions I–IV',
          'Autoimmune Disease — SLE and rheumatoid arthritis',
        ],
      },
      {
        title: 'Neoplasia & Genetics',
        ref: 'pathology/general-pathology/neoplasia',
        topics: [
          'Neoplasia — nomenclature and characteristics',
          'Carcinogenesis — oncogenes and tumour suppressors',
          'Tumour Spread and Staging',
          'Genetic Disorders — Mendelian and chromosomal',
          'Amyloidosis',
        ],
      },
    ],
  },
  systemic_pathology: {
    subject: 'pathology',
    title: 'Pathology — Systemic Pathology',
    track: 'Systemic Pathology',
    weeks: [
      {
        title: 'Cardiovascular & Respiratory',
        ref: 'pathology/systemic-pathology',
        topics: [
          'Atherosclerosis and Ischaemic Heart Disease',
          'Rheumatic Heart Disease',
          'Chronic Obstructive Pulmonary Disease',
          'Pneumonia — lobar and bronchopneumonia',
          'Lung Carcinoma',
        ],
      },
      {
        title: 'Haematology',
        ref: 'pathology/hematology',
        topics: [
          'Iron Deficiency Anaemia',
          'Megaloblastic Anaemia',
          'Haemolytic Anaemias and thalassaemia',
          'Leukaemias — acute and chronic',
          'Lymphomas — Hodgkin and non-Hodgkin',
        ],
      },
      {
        title: 'GIT, Liver & Renal',
        ref: 'pathology/systemic-pathology',
        topics: [
          'Peptic Ulcer Disease',
          'Cirrhosis and portal hypertension',
          'Viral Hepatitis',
          'Glomerulonephritis',
          'Renal Tumours',
        ],
      },
      {
        title: 'Endocrine & Nervous System',
        ref: 'pathology/systemic-pathology',
        topics: [
          'Diabetes Mellitus — pathogenesis and complications',
          'Thyroid Disorders',
          'CNS Infections — meningitis',
          'Cerebrovascular Disease',
          'Bone Tumours',
        ],
      },
    ],
  },
  pharmacology_core: {
    subject: 'pharmacology',
    title: 'Pharmacology — General & ANS',
    track: 'General Pharmacology and Autonomic Nervous System',
    weeks: [
      {
        title: 'General Pharmacology',
        ref: 'pharmacology/general-pharmacology',
        topics: [
          'Pharmacokinetics — absorption and distribution',
          'Drug Metabolism and Excretion',
          'Pharmacodynamics — receptors and dose–response',
          'Adverse Drug Reactions',
          'Routes of Administration and bioavailability',
        ],
      },
      {
        title: 'Cholinergic & Adrenergic Systems',
        ref: 'pharmacology/autonomic-nervous-system',
        topics: [
          'Cholinergic Transmission',
          'Anticholinesterases and organophosphate poisoning',
          'Adrenergic Receptors and agonists',
          'Beta Blockers',
          'Antihypertensive Drugs',
        ],
      },
      {
        title: 'CNS Pharmacology',
        ref: 'pharmacology/cns',
        topics: [
          'Sedative Hypnotics',
          'Antiepileptic Drugs',
          'Antipsychotics',
          'Antidepressants',
          'Opioid Analgesics',
        ],
      },
      {
        title: 'Chemotherapy',
        ref: 'pharmacology/antimicrobial-chemotherapy',
        topics: [
          'Beta-lactam Antibiotics',
          'Antitubercular Drugs',
          'Antimalarial Drugs',
          'Antifungal and Antiviral Agents',
          'Cancer Chemotherapy — principles',
        ],
      },
    ],
  },
  anatomy_upper_limb: {
    subject: 'anatomy',
    title: 'Anatomy — Upper Limb & Thorax',
    track: 'Upper Limb and Thorax',
    weeks: [
      {
        title: 'Pectoral Region & Axilla',
        ref: 'anatomy/upper-limb/pectoral-region-and-axilla',
        topics: [
          'Pectoral Region and breast',
          'Axilla — boundaries and contents',
          'Brachial Plexus',
          'Shoulder Joint',
          'Scapular Anastomosis',
        ],
      },
      {
        title: 'Arm, Forearm & Hand',
        ref: 'anatomy/upper-limb',
        topics: [
          'Arm — flexor and extensor compartments',
          'Cubital Fossa',
          'Forearm — anterior compartment',
          'Hand — muscles and spaces',
          'Nerve Injuries of the Upper Limb',
        ],
      },
      {
        title: 'Thoracic Wall & Mediastinum',
        ref: 'anatomy/thorax',
        topics: [
          'Thoracic Cage and intercostal spaces',
          'Diaphragm',
          'Mediastinum — divisions and contents',
          'Heart — chambers and blood supply',
          'Lungs and pleura',
        ],
      },
      {
        title: 'Embryology & Histology',
        ref: 'anatomy/histology-genetics-and-applied-anatomy',
        topics: [
          'Development of the Heart',
          'Development of the Limbs',
          'Histology of Epithelium',
          'Histology of Muscle and Nerve',
          'Radiological Anatomy of the Thorax',
        ],
      },
    ],
  },
  physiology_core: {
    subject: 'physiology',
    title: 'Physiology — CVS & Respiratory',
    track: 'Cardiovascular and Respiratory Physiology',
    weeks: [
      {
        title: 'Cardiac Physiology',
        ref: 'physiology/cardiovascular-system',
        topics: [
          'Cardiac Cycle',
          'Cardiac Output and its regulation',
          'ECG — basis and interpretation',
          'Blood Pressure Regulation',
          'Regional Circulations',
        ],
      },
      {
        title: 'Respiratory Physiology',
        ref: 'physiology/respiratory-system',
        topics: [
          'Mechanics of Breathing',
          'Lung Volumes and Capacities',
          'Gas Exchange and transport',
          'Regulation of Respiration',
          'Hypoxia and cyanosis',
        ],
      },
      {
        title: 'Blood & Body Fluids',
        ref: 'physiology/blood-and-immunity',
        topics: [
          'Composition of Blood',
          'Haemostasis and coagulation',
          'Blood Groups and transfusion',
          'Immunity — cellular and humoral',
          'Body Fluid Compartments',
        ],
      },
      {
        title: 'Renal & GIT Physiology',
        ref: 'physiology/renal-physiology',
        topics: [
          'Glomerular Filtration',
          'Tubular Reabsorption and secretion',
          'Acid–Base Balance',
          'Gastric Secretion',
          'Digestion and Absorption',
        ],
      },
    ],
  },
  medicine_clinical: {
    subject: 'general-medicine',
    title: 'Medicine — Clinical Foundations',
    track: 'Cardiology and Respiratory Medicine',
    weeks: [
      {
        title: 'Cardiology',
        ref: 'general-medicine/cardiovascular-medicine',
        topics: [
          'Approach to Chest Pain',
          'Acute Coronary Syndrome',
          'Heart Failure — diagnosis and management',
          'Arrhythmias — an approach',
          'Valvular Heart Disease',
        ],
      },
      {
        title: 'Respiratory Medicine',
        ref: 'general-medicine/respiratory-medicine',
        topics: [
          'Approach to Dyspnoea',
          'Asthma — stepwise management',
          'COPD exacerbation',
          'Pulmonary Tuberculosis',
          'Pleural Effusion',
        ],
      },
      {
        title: 'Endocrinology & Nephrology',
        ref: 'general-medicine/endocrinology-and-metabolism',
        topics: [
          'Type 2 Diabetes — management',
          'Diabetic Ketoacidosis',
          'Thyroid Function Interpretation',
          'Acute Kidney Injury',
          'Chronic Kidney Disease',
        ],
      },
      {
        title: 'Neurology & Infectious Disease',
        ref: 'general-medicine/neurology',
        topics: [
          'Approach to Stroke',
          'Seizure Disorders',
          'Meningitis — investigation and treatment',
          'Dengue and Malaria',
          'Sepsis — recognition and bundles',
        ],
      },
    ],
  },
  obgyn_core: {
    subject: 'obgyn',
    title: 'Obstetrics & Gynaecology — Core',
    track: 'Obstetrics',
    weeks: [
      {
        title: 'Normal Pregnancy',
        ref: 'obgyn/normal-pregnancy-and-antenatal-care',
        topics: [
          'Physiological Changes in Pregnancy',
          'Antenatal Care',
          'Normal Labour — stages and management',
          'Puerperium',
          'Lactation',
        ],
      },
      {
        title: 'High-Risk Obstetrics',
        ref: 'obgyn/high-risk-pregnancy',
        topics: [
          'Hypertensive Disorders of Pregnancy',
          'Antepartum Haemorrhage',
          'Postpartum Haemorrhage',
          'Gestational Diabetes',
          'Preterm Labour',
        ],
      },
      {
        title: 'Gynaecology I',
        ref: 'obgyn/general-gynaecology',
        topics: [
          'Abnormal Uterine Bleeding',
          'Polycystic Ovary Syndrome',
          'Fibroid Uterus',
          'Endometriosis',
          'Infertility — evaluation',
        ],
      },
      {
        title: 'Gynaecology II',
        ref: 'obgyn/gynaecologic-oncology',
        topics: [
          'Contraception',
          'Cervical Cancer Screening',
          'Ovarian Tumours',
          'Prolapse',
          'Menopause',
        ],
      },
    ],
  },
  microbiology_core: {
    subject: 'microbiology',
    title: 'Microbiology — Systematic Bacteriology',
    track: 'Bacteriology and Immunology',
    weeks: [
      {
        title: 'General Microbiology',
        ref: 'microbiology/general-microbiology-and-infection-control',
        topics: [
          'Bacterial Morphology and staining',
          'Sterilisation and Disinfection',
          'Culture Media and methods',
          'Bacterial Genetics',
          'Host–Parasite Relationship',
        ],
      },
      {
        title: 'Gram Positive Cocci & Bacilli',
        ref: 'microbiology/bacteriology',
        topics: [
          'Staphylococcus',
          'Streptococcus and pneumococcus',
          'Corynebacterium diphtheriae',
          'Clostridium — tetanus and gas gangrene',
          'Bacillus anthracis',
        ],
      },
      {
        title: 'Gram Negative Organisms',
        ref: 'microbiology/bacteriology',
        topics: [
          'Enterobacteriaceae — an overview',
          'Salmonella and enteric fever',
          'Vibrio cholerae',
          'Pseudomonas',
          'Neisseria',
        ],
      },
      {
        title: 'Mycobacteria, Virology & Immunology',
        ref: 'microbiology',
        topics: [
          'Mycobacterium tuberculosis',
          'Hepatitis Viruses',
          'HIV — structure and diagnosis',
          'Antigen–Antibody Reactions',
          'Vaccines and immunoprophylaxis',
        ],
      },
    ],
  },
} satisfies Record<string, RoadmapTemplate>;

/**
 * One template per curriculum section, keyed `<subject-slug>:<section-slug>`.
 *
 * Built once at module load — the curriculum tree is static, so there is nothing to
 * invalidate and no reason to rebuild this per request.
 */
const CURRICULUM_TEMPLATES: Record<string, RoadmapTemplate> = Object.fromEntries(
  CURRICULUM_SUBJECTS.flatMap((subject) =>
    subject.sections.map((section) => [
      `${subject.slug}:${section.slug}`,
      {
        subject: subject.slug,
        title: `${subject.name} — ${section.title}`,
        track: section.title,
        weeks: section.topics.map((topic) => ({
          title: topic.title,
          ref: buildRef(subject.slug, section.slug, topic.slug),
          // A topic with no detail nodes still deserves a week; it becomes its own item.
          topics: topic.nodes.length > 0 ? topic.nodes : [topic.title],
        })),
      } satisfies RoadmapTemplate,
    ]),
  ),
);

export const ROADMAP_TEMPLATES: Record<string, RoadmapTemplate> = {
  ...CURATED_TEMPLATES,
  ...CURRICULUM_TEMPLATES,
};

/** The curated template keys, which the seed refers to by name. */
export type RoadmapKey = keyof typeof CURATED_TEMPLATES;

export type TemplateSource = 'curated' | 'curriculum';

export type TemplateSummary = {
  key: string;
  subject: SubjectSlug;
  title: string;
  track: string;
  source: TemplateSource;
  weekCount: number;
  topicCount: number;
};

/**
 * The template best suited to a subject.
 *
 * A curated plan wins when we have one, because it is grouped for an exam rather than for
 * completeness. Otherwise the subject's first curriculum section is the natural starting
 * point — it is where the course itself begins.
 */
export function templateForSubject(slug: string): RoadmapTemplate | null {
  const curated = Object.values(CURATED_TEMPLATES).find((t) => t.subject === slug);
  if (curated) return curated;
  return Object.values(CURRICULUM_TEMPLATES).find((t) => t.subject === slug) ?? null;
}

function summarise(
  key: string,
  template: RoadmapTemplate,
  source: TemplateSource,
): TemplateSummary {
  return {
    key,
    subject: template.subject,
    title: template.title,
    track: template.track,
    source,
    weekCount: template.weeks.length,
    topicCount: template.weeks.reduce((total, week) => total + week.topics.length, 0),
  };
}

/** Curated templates first, then every curriculum section in course order. */
export function templateList(): TemplateSummary[] {
  return [
    ...Object.entries(CURATED_TEMPLATES).map(([key, t]) => summarise(key, t, 'curated')),
    ...Object.entries(CURRICULUM_TEMPLATES).map(([key, t]) => summarise(key, t, 'curriculum')),
  ];
}

/** Templates for one subject, curated first — what the admin picker offers per subject. */
export function templatesForSubject(slug: string): TemplateSummary[] {
  return templateList().filter((t) => t.subject === slug);
}
