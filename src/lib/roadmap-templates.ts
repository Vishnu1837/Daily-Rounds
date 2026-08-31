/**
 * Curated roadmap templates.
 *
 * These are the starting points an admin would otherwise type out by hand. Onboarding
 * applies the matching template automatically so a new student has a real roadmap on day
 * one, and the admin console can apply or replace one at any time. Every topic remains
 * fully editable afterwards.
 */
import type { SubjectSlug } from './subjects';

/** Roadmap templates: a track plus week-by-week topics, as an admin would build them. */
export const ROADMAP_TEMPLATES: Record<
  string,
  {
    subject: SubjectSlug;
    title: string;
    track: string;
    weeks: { title: string; topics: string[] }[];
  }
> = {
  general_pathology: {
    subject: 'pathology',
    title: 'Pathology — General Pathology',
    track: 'General Pathology',
    weeks: [
      {
        title: 'Cell Injury & Inflammation Basics',
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
};

export type RoadmapKey = keyof typeof ROADMAP_TEMPLATES;

/** The template best suited to a subject, if one exists. */
export function templateForSubject(slug: string) {
  return Object.entries(ROADMAP_TEMPLATES).find(([, t]) => t.subject === slug)?.[1] ?? null;
}

export function templateList() {
  return Object.entries(ROADMAP_TEMPLATES).map(([key, t]) => ({ key, ...t }));
}
