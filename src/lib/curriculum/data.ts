/**
 * The MBBS curriculum tree - GENERATED FILE, do not edit by hand.
 *
 * Source: the 19-subject roadmap authored for Daily Rounds, aligned to the revised NMC
 * Competency Based Medical Education curriculum dated 12 September 2024.
 *
 * Shape: Phase -> Subject -> Section -> Topic -> detail nodes. Detail nodes are syllabus
 * and navigation labels, not explanatory content: they tell a student what a topic
 * contains so they can decide what to study, and they become the description carried onto
 * a roadmap topic.
 *
 * See src/lib/curriculum/index.ts for the types and the lookup helpers.
 */
import type { CurriculumPhase } from './types';

export const CURRICULUM: CurriculumPhase[] = [
  {
    id: 'phase-1',
    label: 'Phase I',
    title: 'First Professional MBBS',
    subjects: [
      {
        number: 1,
        name: 'Anatomy',
        slug: 'anatomy',
        accent: 'rose',
        sections: [
          {
            title: 'General Anatomy & Embryology',
            slug: 'general-anatomy-and-embryology',
            topics: [
              {
                title: 'Introduction & General Anatomy',
                slug: 'introduction-and-general-anatomy',
                nodes: [
                  'Anatomical position, planes & axes',
                  'Terms of relation & movement',
                  'Bones & classification',
                  'Joints & classification',
                  'Muscles & classification',
                  'Fascia',
                  'Blood vessels',
                  'Lymphatic system',
                  'Nervous system basics',
                ],
              },
              {
                title: 'General Embryology',
                slug: 'general-embryology',
                nodes: [
                  'Gametogenesis',
                  'Fertilization',
                  'Cleavage & blastocyst',
                  'Implantation',
                  'Bilaminar germ disc',
                  'Gastrulation',
                  'Trilaminar germ disc',
                  'Notochord',
                  'Neurulation',
                  'Embryonic folding',
                  'Placenta',
                  'Fetal membranes',
                  'Umbilical cord',
                  'Twinning',
                  'Teratology basics',
                ],
              },
            ],
          },
          {
            title: 'Upper Limb',
            slug: 'upper-limb',
            topics: [
              {
                title: 'Upper Limb Osteology',
                slug: 'upper-limb-osteology',
                nodes: [
                  'Clavicle',
                  'Scapula',
                  'Humerus',
                  'Radius',
                  'Ulna',
                  'Carpal bones',
                  'Metacarpals',
                  'Phalanges',
                ],
              },
              {
                title: 'Pectoral Region & Axilla',
                slug: 'pectoral-region-and-axilla',
                nodes: [
                  'Pectoral fascia',
                  'Pectoralis major',
                  'Pectoralis minor',
                  'Clavipectoral fascia',
                  'Breast',
                  'Axilla — boundaries',
                  'Axilla — contents',
                  'Axillary artery',
                  'Axillary vein',
                  'Axillary lymph nodes',
                  'Brachial plexus — roots',
                  'Brachial plexus — trunks',
                  'Brachial plexus — divisions',
                  'Brachial plexus — cords',
                  'Brachial plexus — branches',
                  'Erb palsy',
                  'Klumpke palsy',
                ],
              },
              {
                title: 'Back & Scapular Region',
                slug: 'back-and-scapular-region',
                nodes: [
                  'Scapular muscles',
                  'Trapezius',
                  'Latissimus dorsi',
                  'Levator scapulae',
                  'Rhomboids',
                  'Scapular anastomosis',
                ],
              },
              {
                title: 'Shoulder & Arm',
                slug: 'shoulder-and-arm',
                nodes: [
                  'Shoulder joint',
                  'Rotator cuff — SITS muscles',
                  'Movements of shoulder',
                  'Deltoid',
                  'Arm — anterior compartment',
                  'Arm — posterior compartment',
                  'Brachial artery',
                  'Musculocutaneous nerve',
                  'Radial nerve in arm',
                ],
              },
              {
                title: 'Forearm & Elbow',
                slug: 'forearm-and-elbow',
                nodes: [
                  'Elbow joint',
                  'Cubital fossa',
                  'Forearm flexor compartment',
                  'Forearm extensor compartment',
                  'Median nerve',
                  'Ulnar nerve',
                  'Radial nerve',
                  'Radial artery',
                  'Ulnar artery',
                ],
              },
              {
                title: 'Wrist & Hand',
                slug: 'wrist-and-hand',
                nodes: [
                  'Wrist joint',
                  'Flexor retinaculum',
                  'Carpal tunnel',
                  'Palmar aponeurosis',
                  'Thenar muscles',
                  'Hypothenar muscles',
                  'Lumbricals',
                  'Interossei',
                  'Palmar arches',
                  'Digital nerves',
                  'Anatomical snuffbox',
                  'Median nerve injury',
                  'Ulnar nerve injury',
                  'Radial nerve injury',
                ],
              },
            ],
          },
          {
            title: 'Lower Limb',
            slug: 'lower-limb',
            topics: [
              {
                title: 'Lower Limb Osteology',
                slug: 'lower-limb-osteology',
                nodes: [
                  'Hip bone',
                  'Femur',
                  'Patella',
                  'Tibia',
                  'Fibula',
                  'Tarsal bones',
                  'Metatarsals',
                  'Phalanges',
                ],
              },
              {
                title: 'Gluteal Region & Hip',
                slug: 'gluteal-region-and-hip',
                nodes: [
                  'Gluteus maximus',
                  'Gluteus medius & minimus',
                  'Piriformis',
                  'Greater & lesser sciatic foramina',
                  'Sciatic nerve',
                  'Superior gluteal nerve',
                  'Inferior gluteal nerve',
                  'Hip joint',
                  'Blood supply of femoral head',
                ],
              },
              {
                title: 'Thigh',
                slug: 'thigh',
                nodes: [
                  'Femoral triangle',
                  'Femoral sheath',
                  'Femoral canal',
                  'Adductor canal',
                  'Anterior compartment',
                  'Medial compartment',
                  'Posterior compartment',
                  'Femoral nerve',
                  'Obturator nerve',
                  'Femoral artery',
                ],
              },
              {
                title: 'Knee & Popliteal Fossa',
                slug: 'knee-and-popliteal-fossa',
                nodes: [
                  'Knee joint',
                  'ACL',
                  'PCL',
                  'Medial meniscus',
                  'Lateral meniscus',
                  'Collateral ligaments',
                  'Locking & unlocking',
                  'Popliteal fossa',
                  'Popliteal artery',
                ],
              },
              {
                title: 'Leg',
                slug: 'leg',
                nodes: [
                  'Anterior compartment',
                  'Lateral compartment',
                  'Posterior compartment',
                  'Common fibular nerve',
                  'Deep fibular nerve',
                  'Superficial fibular nerve',
                  'Tibial nerve',
                ],
              },
              {
                title: 'Ankle & Foot',
                slug: 'ankle-and-foot',
                nodes: [
                  'Ankle joint',
                  'Talocalcaneal joints',
                  'Dorsum of foot',
                  'Sole of foot',
                  'Plantar aponeurosis',
                  'Medial plantar nerve',
                  'Lateral plantar nerve',
                  'Arches of foot',
                  'Dorsalis pedis artery',
                ],
              },
            ],
          },
          {
            title: 'Thorax',
            slug: 'thorax',
            topics: [
              {
                title: 'Thoracic Wall',
                slug: 'thoracic-wall',
                nodes: [
                  'Thoracic cage',
                  'Typical rib',
                  'Atypical ribs',
                  'Sternum',
                  'Intercostal spaces',
                  'Intercostal muscles',
                  'Intercostal nerves',
                  'Internal thoracic artery',
                  'Diaphragm',
                ],
              },
              {
                title: 'Mediastinum',
                slug: 'mediastinum',
                nodes: [
                  'Superior mediastinum',
                  'Anterior mediastinum',
                  'Middle mediastinum',
                  'Posterior mediastinum',
                  'Thoracic duct',
                  'Azygos system',
                  'Vagus nerves',
                  'Phrenic nerves',
                ],
              },
              {
                title: 'Heart & Pericardium',
                slug: 'heart-and-pericardium',
                nodes: [
                  'Fibrous pericardium',
                  'Serous pericardium',
                  'Right atrium',
                  'Right ventricle',
                  'Left atrium',
                  'Left ventricle',
                  'Cardiac valves',
                  'Coronary arteries',
                  'Coronary sinus',
                  'Conducting system',
                  'Fibrous skeleton of heart',
                ],
              },
              {
                title: 'Lungs & Pleura',
                slug: 'lungs-and-pleura',
                nodes: [
                  'Pleura',
                  'Pleural recesses',
                  'Right lung',
                  'Left lung',
                  'Root of lung',
                  'Hilum',
                  'Bronchopulmonary segments',
                  'Pulmonary vessels',
                ],
              },
            ],
          },
          {
            title: 'Abdomen & Pelvis',
            slug: 'abdomen-and-pelvis',
            topics: [
              {
                title: 'Anterior Abdominal Wall',
                slug: 'anterior-abdominal-wall',
                nodes: [
                  'Layers',
                  'Rectus sheath',
                  'Umbilicus',
                  'Inguinal ligament',
                  'Inguinal canal',
                  'Deep inguinal ring',
                  'Superficial inguinal ring',
                  'Hesselbach triangle',
                  'Inguinal hernia anatomy',
                ],
              },
              {
                title: 'Peritoneum',
                slug: 'peritoneum',
                nodes: [
                  'Greater sac',
                  'Lesser sac',
                  'Greater omentum',
                  'Lesser omentum',
                  'Mesentery',
                  'Peritoneal recesses',
                ],
              },
              {
                title: 'Gastrointestinal Viscera',
                slug: 'gastrointestinal-viscera',
                nodes: [
                  'Abdominal esophagus',
                  'Stomach',
                  'Duodenum',
                  'Jejunum',
                  'Ileum',
                  'Cecum',
                  'Appendix',
                  'Colon',
                  'Rectum',
                  'Anal canal',
                ],
              },
              {
                title: 'Hepatobiliary & Pancreas',
                slug: 'hepatobiliary-and-pancreas',
                nodes: [
                  'Liver',
                  'Segments of liver basics',
                  'Portal vein',
                  'Portosystemic anastomoses',
                  'Gallbladder',
                  'Extrahepatic biliary apparatus',
                  'Pancreas',
                  'Spleen',
                ],
              },
              {
                title: 'Posterior Abdominal Wall',
                slug: 'posterior-abdominal-wall',
                nodes: [
                  'Kidneys',
                  'Ureters',
                  'Suprarenal glands',
                  'Abdominal aorta',
                  'Inferior vena cava',
                  'Lumbar plexus',
                  'Posterior abdominal wall muscles',
                ],
              },
              {
                title: 'Pelvis',
                slug: 'pelvis',
                nodes: [
                  'Bony pelvis',
                  'Pelvic diaphragm',
                  'Pelvic fascia',
                  'Urinary bladder',
                  'Male urethra',
                  'Prostate',
                  'Seminal vesicles',
                  'Uterus',
                  'Uterine tube',
                  'Ovary',
                  'Vagina',
                ],
              },
              {
                title: 'Perineum',
                slug: 'perineum',
                nodes: [
                  'Perineal body',
                  'Urogenital triangle',
                  'Anal triangle',
                  'Ischioanal fossa',
                  'Pudendal canal',
                  'Pudendal nerve',
                ],
              },
            ],
          },
          {
            title: 'Head & Neck',
            slug: 'head-and-neck',
            topics: [
              {
                title: 'Skull',
                slug: 'skull',
                nodes: [
                  'Norma verticalis',
                  'Norma frontalis',
                  'Norma lateralis',
                  'Norma occipitalis',
                  'Cranial fossae',
                  'Important foramina & transmitted structures',
                  'Mandible',
                  'Hyoid',
                ],
              },
              {
                title: 'Face & Scalp',
                slug: 'face-and-scalp',
                nodes: [
                  'Scalp layers',
                  'Facial muscles',
                  'Facial artery',
                  'Facial vein',
                  'Facial nerve',
                  'Dangerous area of face',
                  'Trigeminal sensory distribution',
                ],
              },
              {
                title: 'Neck',
                slug: 'neck',
                nodes: [
                  'Deep cervical fascia',
                  'Anterior triangle',
                  'Posterior triangle',
                  'Carotid triangle',
                  'Submandibular triangle',
                  'Muscular triangle',
                  'Carotid sheath',
                  'Cervical sympathetic chain',
                ],
              },
              {
                title: 'Thyroid & Parathyroid',
                slug: 'thyroid-and-parathyroid',
                nodes: [
                  'Thyroid gland',
                  'Arterial supply',
                  'Recurrent laryngeal nerve relation',
                  'Parathyroid glands',
                ],
              },
              {
                title: 'Oral Cavity',
                slug: 'oral-cavity',
                nodes: [
                  'Lips & cheeks',
                  'Palate',
                  'Tongue',
                  'Teeth basics',
                  'Submandibular gland',
                  'Sublingual gland',
                  'Parotid gland',
                ],
              },
              {
                title: 'Pharynx & Larynx',
                slug: 'pharynx-and-larynx',
                nodes: [
                  'Nasopharynx',
                  'Oropharynx',
                  'Laryngopharynx',
                  'Waldeyer ring',
                  'Laryngeal cartilages',
                  'Intrinsic muscles of larynx',
                  'Vocal cords',
                  'Recurrent laryngeal nerve',
                ],
              },
              {
                title: 'Nose & Paranasal Sinuses',
                slug: 'nose-and-paranasal-sinuses',
                nodes: [
                  'Nasal septum',
                  'Lateral wall of nose',
                  'Blood supply of nose',
                  'Maxillary sinus',
                  'Frontal sinus',
                  'Ethmoidal air cells',
                  'Sphenoidal sinus',
                ],
              },
              {
                title: 'Orbit & Eye',
                slug: 'orbit-and-eye',
                nodes: [
                  'Bony orbit',
                  'Extraocular muscles',
                  'Oculomotor nerve',
                  'Trochlear nerve',
                  'Abducens nerve',
                  'Ophthalmic artery',
                  'Lacrimal apparatus',
                ],
              },
              {
                title: 'Ear',
                slug: 'ear',
                nodes: [
                  'External ear',
                  'Tympanic membrane',
                  'Middle ear',
                  'Auditory tube',
                  'Inner ear',
                ],
              },
              {
                title: 'Cranial Nerves',
                slug: 'cranial-nerves',
                nodes: [
                  'CN I Olfactory',
                  'CN II Optic',
                  'CN III Oculomotor',
                  'CN IV Trochlear',
                  'CN V Trigeminal',
                  'CN VI Abducens',
                  'CN VII Facial',
                  'CN VIII Vestibulocochlear',
                  'CN IX Glossopharyngeal',
                  'CN X Vagus',
                  'CN XI Accessory',
                  'CN XII Hypoglossal',
                ],
              },
            ],
          },
          {
            title: 'Neuroanatomy',
            slug: 'neuroanatomy',
            topics: [
              {
                title: 'Spinal Cord',
                slug: 'spinal-cord',
                nodes: [
                  'External features',
                  'Gray matter',
                  'White matter',
                  'Ascending tracts',
                  'Descending tracts',
                  'Blood supply',
                ],
              },
              {
                title: 'Brainstem',
                slug: 'brainstem',
                nodes: ['Medulla', 'Pons', 'Midbrain', 'Cranial nerve nuclei overview'],
              },
              {
                title: 'Cerebellum',
                slug: 'cerebellum',
                nodes: ['Lobes', 'Deep nuclei', 'Cerebellar peduncles', 'Functional connections'],
              },
              {
                title: 'Diencephalon',
                slug: 'diencephalon',
                nodes: ['Thalamus', 'Hypothalamus', 'Epithalamus', 'Subthalamus'],
              },
              {
                title: 'Cerebrum',
                slug: 'cerebrum',
                nodes: [
                  'Lobes',
                  'Sulci & gyri',
                  'Functional cortical areas',
                  'White matter',
                  'Corpus callosum',
                  'Internal capsule',
                  'Basal ganglia',
                ],
              },
              {
                title: 'Ventricles & CSF',
                slug: 'ventricles-and-csf',
                nodes: [
                  'Lateral ventricles',
                  'Third ventricle',
                  'Cerebral aqueduct',
                  'Fourth ventricle',
                  'CSF circulation',
                ],
              },
              {
                title: 'Meninges & Venous Sinuses',
                slug: 'meninges-and-venous-sinuses',
                nodes: ['Dura mater', 'Arachnoid', 'Pia mater', 'Dural venous sinuses'],
              },
              {
                title: 'Blood Supply of Brain',
                slug: 'blood-supply-of-brain',
                nodes: [
                  'Internal carotid system',
                  'Vertebrobasilar system',
                  'Circle of Willis',
                  'Major cerebral arteries',
                  'Arterial territories',
                ],
              },
            ],
          },
          {
            title: 'Histology, Genetics & Applied Anatomy',
            slug: 'histology-genetics-and-applied-anatomy',
            topics: [
              {
                title: 'General Histology',
                slug: 'general-histology',
                nodes: [
                  'Epithelium',
                  'Connective tissue',
                  'Cartilage',
                  'Bone',
                  'Muscle',
                  'Nervous tissue',
                  'Blood vessels',
                  'Lymphoid tissue',
                ],
              },
              {
                title: 'Systemic Histology',
                slug: 'systemic-histology',
                nodes: [
                  'Cardiovascular system',
                  'Respiratory system',
                  'GIT',
                  'Liver & pancreas',
                  'Urinary system',
                  'Endocrine organs',
                  'Male reproductive system',
                  'Female reproductive system',
                  'Skin',
                  'Eye & ear',
                ],
              },
              {
                title: 'Genetics',
                slug: 'genetics',
                nodes: [
                  'Chromosomes',
                  'Karyotyping basics',
                  'Patterns of inheritance',
                  'Common chromosomal abnormalities',
                ],
              },
              {
                title: 'Surface & Radiological Anatomy',
                slug: 'surface-and-radiological-anatomy',
                nodes: [
                  'Surface markings',
                  'Basic X-ray anatomy',
                  'Basic CT anatomy',
                  'Basic MRI anatomy',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 2,
        name: 'Physiology',
        slug: 'physiology',
        accent: 'sky',
        sections: [
          {
            title: 'General Physiology',
            slug: 'general-physiology',
            topics: [
              {
                title: 'Cell Physiology',
                slug: 'cell-physiology',
                nodes: [
                  'Cell membrane',
                  'Membrane transport',
                  'Diffusion',
                  'Osmosis',
                  'Active transport',
                  'Resting membrane potential',
                  'Action potential',
                ],
              },
              {
                title: 'Homeostasis & Body Fluids',
                slug: 'homeostasis-and-body-fluids',
                nodes: [
                  'Homeostasis',
                  'Feedback systems',
                  'Total body water',
                  'ICF',
                  'ECF',
                  'Osmolarity',
                ],
              },
            ],
          },
          {
            title: 'Blood & Immunity',
            slug: 'blood-and-immunity',
            topics: [
              {
                title: 'RBC & Hemoglobin',
                slug: 'rbc-and-hemoglobin',
                nodes: [
                  'Erythropoiesis',
                  'RBC functions',
                  'Hemoglobin',
                  'RBC indices',
                  'ESR',
                  'Anemia — physiological basis',
                ],
              },
              {
                title: 'WBC & Immunity',
                slug: 'wbc-and-immunity',
                nodes: [
                  'Leukopoiesis',
                  'Neutrophils',
                  'Eosinophils',
                  'Basophils',
                  'Monocytes',
                  'Lymphocytes',
                  'Innate immunity',
                  'Adaptive immunity',
                ],
              },
              {
                title: 'Hemostasis',
                slug: 'hemostasis',
                nodes: [
                  'Platelets',
                  'Primary hemostasis',
                  'Coagulation',
                  'Fibrinolysis',
                  'Bleeding & clotting time',
                ],
              },
              {
                title: 'Blood Groups',
                slug: 'blood-groups',
                nodes: ['ABO system', 'Rh system', 'Cross matching', 'Transfusion reactions'],
              },
            ],
          },
          {
            title: 'Nerve & Muscle',
            slug: 'nerve-and-muscle',
            topics: [
              {
                title: 'Nerve',
                slug: 'nerve',
                nodes: [
                  'Excitability',
                  'Action potential',
                  'Nerve conduction',
                  'Refractory period',
                  'Degeneration & regeneration',
                ],
              },
              {
                title: 'Neuromuscular Junction',
                slug: 'neuromuscular-junction',
                nodes: [
                  'Acetylcholine',
                  'End plate potential',
                  'Neuromuscular transmission',
                  'Myasthenia gravis correlation',
                ],
              },
              {
                title: 'Muscle',
                slug: 'muscle',
                nodes: [
                  'Skeletal muscle',
                  'Excitation-contraction coupling',
                  'Sliding filament mechanism',
                  'Motor unit',
                  'Smooth muscle',
                  'Cardiac muscle',
                ],
              },
            ],
          },
          {
            title: 'Cardiovascular System',
            slug: 'cardiovascular-system',
            topics: [
              {
                title: 'Heart',
                slug: 'heart',
                nodes: [
                  'Cardiac muscle properties',
                  'Pacemaker potential',
                  'Conducting system',
                  'ECG',
                  'Cardiac cycle',
                  'Heart sounds',
                  'Cardiac output',
                ],
              },
              {
                title: 'Circulation',
                slug: 'circulation',
                nodes: [
                  'Hemodynamics',
                  'Arterial pulse',
                  'Blood pressure',
                  'Microcirculation',
                  'Venous return',
                  'Capillary exchange',
                ],
              },
              {
                title: 'Regulation',
                slug: 'regulation',
                nodes: [
                  'Baroreceptor reflex',
                  'Chemoreceptor reflex',
                  'RAAS',
                  'Local regulation',
                  'Coronary circulation',
                ],
              },
            ],
          },
          {
            title: 'Respiratory System',
            slug: 'respiratory-system',
            topics: [
              {
                title: 'Ventilation',
                slug: 'ventilation',
                nodes: [
                  'Mechanics of breathing',
                  'Compliance',
                  'Airway resistance',
                  'Lung volumes',
                  'Lung capacities',
                  'Spirometry',
                  'Dead space',
                  'Alveolar ventilation',
                ],
              },
              {
                title: 'Gas Exchange & Transport',
                slug: 'gas-exchange-and-transport',
                nodes: [
                  'Diffusion',
                  'V/Q relationship',
                  'Oxygen transport',
                  'Oxygen dissociation curve',
                  'Carbon dioxide transport',
                ],
              },
              {
                title: 'Regulation',
                slug: 'regulation',
                nodes: [
                  'Respiratory centers',
                  'Central chemoreceptors',
                  'Peripheral chemoreceptors',
                  'Hypoxia',
                  'High altitude',
                  'Exercise',
                ],
              },
            ],
          },
          {
            title: 'Renal Physiology',
            slug: 'renal-physiology',
            topics: [
              {
                title: 'Renal Hemodynamics',
                slug: 'renal-hemodynamics',
                nodes: ['Renal blood flow', 'GFR', 'Filtration fraction', 'Renal clearance'],
              },
              {
                title: 'Tubular Functions',
                slug: 'tubular-functions',
                nodes: [
                  'Proximal tubule',
                  'Loop of Henle',
                  'Distal tubule',
                  'Collecting duct',
                  'Tubular reabsorption',
                  'Tubular secretion',
                ],
              },
              {
                title: 'Concentration & Dilution',
                slug: 'concentration-and-dilution',
                nodes: ['Countercurrent mechanism', 'ADH', 'Urine concentration', 'Urine dilution'],
              },
              {
                title: 'Fluid, Electrolyte & Acid-Base',
                slug: 'fluid-electrolyte-and-acid-base',
                nodes: [
                  'Sodium balance',
                  'Potassium balance',
                  'Water balance',
                  'Renal acidification',
                  'Acid-base regulation',
                ],
              },
              {
                title: 'Micturition',
                slug: 'micturition',
                nodes: ['Urinary bladder physiology', 'Micturition reflex'],
              },
            ],
          },
          {
            title: 'Gastrointestinal System',
            slug: 'gastrointestinal-system',
            topics: [
              {
                title: 'Motility',
                slug: 'motility',
                nodes: [
                  'Mastication',
                  'Swallowing',
                  'Esophageal motility',
                  'Gastric motility',
                  'Small intestinal motility',
                  'Colonic motility',
                  'Defecation',
                ],
              },
              {
                title: 'Secretions',
                slug: 'secretions',
                nodes: [
                  'Saliva',
                  'Gastric secretion',
                  'Pancreatic secretion',
                  'Bile',
                  'Intestinal secretion',
                ],
              },
              {
                title: 'Digestion & Absorption',
                slug: 'digestion-and-absorption',
                nodes: [
                  'Carbohydrates',
                  'Proteins',
                  'Lipids',
                  'Vitamins',
                  'Minerals',
                  'Water & electrolytes',
                ],
              },
            ],
          },
          {
            title: 'Endocrine & Reproductive Physiology',
            slug: 'endocrine-and-reproductive-physiology',
            topics: [
              {
                title: 'General Endocrine',
                slug: 'general-endocrine',
                nodes: ['Hormone receptors', 'Second messengers', 'Feedback regulation'],
              },
              {
                title: 'Pituitary',
                slug: 'pituitary',
                nodes: ['Growth hormone', 'Prolactin', 'Posterior pituitary hormones'],
              },
              {
                title: 'Thyroid & Parathyroid',
                slug: 'thyroid-and-parathyroid',
                nodes: ['Thyroid hormones', 'Calcitonin', 'PTH', 'Calcium homeostasis'],
              },
              {
                title: 'Adrenal',
                slug: 'adrenal',
                nodes: ['Cortisol', 'Aldosterone', 'Adrenal androgens', 'Catecholamines'],
              },
              {
                title: 'Pancreas',
                slug: 'pancreas',
                nodes: ['Insulin', 'Glucagon', 'Blood glucose regulation'],
              },
              {
                title: 'Male Reproduction',
                slug: 'male-reproduction',
                nodes: ['Spermatogenesis', 'Testosterone', 'Male sexual function'],
              },
              {
                title: 'Female Reproduction',
                slug: 'female-reproduction',
                nodes: [
                  'Oogenesis',
                  'Menstrual cycle',
                  'Estrogen',
                  'Progesterone',
                  'Pregnancy physiology',
                  'Lactation',
                ],
              },
            ],
          },
          {
            title: 'Central Nervous System & Special Senses',
            slug: 'central-nervous-system-and-special-senses',
            topics: [
              {
                title: 'General CNS',
                slug: 'general-cns',
                nodes: ['Synapse', 'Neurotransmitters', 'Sensory receptors', 'Reflexes'],
              },
              {
                title: 'Sensory System',
                slug: 'sensory-system',
                nodes: ['Somatic sensation', 'Pain', 'Temperature', 'Touch', 'Proprioception'],
              },
              {
                title: 'Motor System',
                slug: 'motor-system',
                nodes: [
                  'Spinal reflexes',
                  'Motor cortex',
                  'Corticospinal tract',
                  'Basal ganglia',
                  'Cerebellum',
                  'Posture & equilibrium',
                ],
              },
              {
                title: 'Higher Functions',
                slug: 'higher-functions',
                nodes: ['Cerebral cortex', 'Learning', 'Memory', 'Speech', 'Sleep', 'EEG'],
              },
              {
                title: 'Autonomic Nervous System',
                slug: 'autonomic-nervous-system',
                nodes: ['Sympathetic system', 'Parasympathetic system', 'Autonomic reflexes'],
              },
              {
                title: 'Vision',
                slug: 'vision',
                nodes: [
                  'Optics',
                  'Accommodation',
                  'Phototransduction',
                  'Visual pathway',
                  'Color vision',
                  'Visual fields',
                ],
              },
              {
                title: 'Hearing & Vestibular',
                slug: 'hearing-and-vestibular',
                nodes: [
                  'Sound conduction',
                  'Cochlear function',
                  'Auditory pathway',
                  'Vestibular apparatus',
                ],
              },
              {
                title: 'Taste & Smell',
                slug: 'taste-and-smell',
                nodes: ['Taste', 'Olfaction'],
              },
            ],
          },
          {
            title: 'Integrated & Applied Physiology',
            slug: 'integrated-and-applied-physiology',
            topics: [
              {
                title: 'Exercise',
                slug: 'exercise',
                nodes: ['Cardiovascular responses', 'Respiratory responses', 'Muscle responses'],
              },
              {
                title: 'Temperature',
                slug: 'temperature',
                nodes: ['Heat production', 'Heat loss', 'Thermoregulation', 'Fever'],
              },
              {
                title: 'Environmental Physiology',
                slug: 'environmental-physiology',
                nodes: ['High altitude', 'Deep sea / diving', 'Aviation basics'],
              },
              {
                title: 'Clinical Practicals',
                slug: 'clinical-practicals',
                nodes: [
                  'Pulse',
                  'Blood pressure',
                  'Respiratory examination basics',
                  'Spirometry',
                  'ECG basics',
                  'Hematology practicals',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 3,
        name: 'Biochemistry',
        slug: 'biochemistry',
        accent: 'amber',
        sections: [
          {
            title: 'Biomolecules & Cell',
            slug: 'biomolecules-and-cell',
            topics: [
              {
                title: 'Cell & Membrane',
                slug: 'cell-and-membrane',
                nodes: [
                  'Cell organelles',
                  'Cell membrane',
                  'Membrane transport',
                  'Extracellular matrix',
                ],
              },
              {
                title: 'Carbohydrates',
                slug: 'carbohydrates',
                nodes: [
                  'Monosaccharides',
                  'Disaccharides',
                  'Polysaccharides',
                  'Glycosaminoglycans',
                ],
              },
              {
                title: 'Amino Acids & Proteins',
                slug: 'amino-acids-and-proteins',
                nodes: [
                  'Amino acid classification',
                  'Protein structure',
                  'Protein folding',
                  'Plasma proteins',
                  'Immunoglobulins',
                ],
              },
              {
                title: 'Lipids',
                slug: 'lipids',
                nodes: [
                  'Fatty acids',
                  'Triacylglycerol',
                  'Phospholipids',
                  'Cholesterol',
                  'Lipoproteins',
                ],
              },
            ],
          },
          {
            title: 'Enzymes & Bioenergetics',
            slug: 'enzymes-and-bioenergetics',
            topics: [
              {
                title: 'Enzymes',
                slug: 'enzymes',
                nodes: [
                  'Classification',
                  'Kinetics',
                  'Km & Vmax',
                  'Inhibition',
                  'Isoenzymes',
                  'Clinical enzymology',
                ],
              },
              {
                title: 'Bioenergetics',
                slug: 'bioenergetics',
                nodes: [
                  'High-energy compounds',
                  'Electron transport chain',
                  'Oxidative phosphorylation',
                  'Uncouplers & inhibitors',
                ],
              },
            ],
          },
          {
            title: 'Carbohydrate Metabolism',
            slug: 'carbohydrate-metabolism',
            topics: [
              {
                title: 'Core Pathways',
                slug: 'core-pathways',
                nodes: [
                  'Glycolysis',
                  'Pyruvate dehydrogenase',
                  'TCA cycle',
                  'Gluconeogenesis',
                  'Glycogenesis',
                  'Glycogenolysis',
                  'HMP shunt',
                ],
              },
              {
                title: 'Clinical Correlations',
                slug: 'clinical-correlations',
                nodes: [
                  'Blood glucose regulation',
                  'Diabetes mellitus',
                  'Glycogen storage disorders',
                  'G6PD deficiency',
                ],
              },
            ],
          },
          {
            title: 'Lipid Metabolism',
            slug: 'lipid-metabolism',
            topics: [
              {
                title: 'Fatty Acids',
                slug: 'fatty-acids',
                nodes: ['Beta oxidation', 'Fatty acid synthesis', 'Essential fatty acids'],
              },
              {
                title: 'Ketone Bodies',
                slug: 'ketone-bodies',
                nodes: ['Ketogenesis', 'Ketolysis', 'Ketoacidosis biochemical basis'],
              },
              {
                title: 'Cholesterol & Lipoproteins',
                slug: 'cholesterol-and-lipoproteins',
                nodes: [
                  'Cholesterol synthesis',
                  'Bile acids',
                  'Chylomicrons',
                  'VLDL',
                  'LDL',
                  'HDL',
                  'Dyslipidemia',
                ],
              },
            ],
          },
          {
            title: 'Amino Acid & Protein Metabolism',
            slug: 'amino-acid-and-protein-metabolism',
            topics: [
              {
                title: 'Nitrogen Metabolism',
                slug: 'nitrogen-metabolism',
                nodes: ['Transamination', 'Deamination', 'Ammonia transport', 'Urea cycle'],
              },
              {
                title: 'Selected Amino Acids',
                slug: 'selected-amino-acids',
                nodes: [
                  'Phenylalanine & tyrosine',
                  'Methionine',
                  'Tryptophan',
                  'Branched-chain amino acids',
                ],
              },
              {
                title: 'Inborn Errors',
                slug: 'inborn-errors',
                nodes: [
                  'Phenylketonuria',
                  'Alkaptonuria',
                  'Maple syrup urine disease',
                  'Homocystinuria',
                ],
              },
            ],
          },
          {
            title: 'Heme & Hemoglobin',
            slug: 'heme-and-hemoglobin',
            topics: [
              {
                title: 'Heme',
                slug: 'heme',
                nodes: [
                  'Heme synthesis',
                  'Porphyrias',
                  'Heme degradation',
                  'Bilirubin metabolism',
                  'Jaundice',
                ],
              },
              {
                title: 'Hemoglobin',
                slug: 'hemoglobin',
                nodes: [
                  'Hemoglobin structure',
                  'Hemoglobin variants',
                  'Hemoglobinopathies',
                  'Iron metabolism',
                ],
              },
            ],
          },
          {
            title: 'Vitamins, Minerals & Nutrition',
            slug: 'vitamins-minerals-and-nutrition',
            topics: [
              {
                title: 'Fat-Soluble Vitamins',
                slug: 'fat-soluble-vitamins',
                nodes: ['Vitamin A', 'Vitamin D', 'Vitamin E', 'Vitamin K'],
              },
              {
                title: 'Water-Soluble Vitamins',
                slug: 'water-soluble-vitamins',
                nodes: [
                  'Thiamine',
                  'Riboflavin',
                  'Niacin',
                  'Pantothenate',
                  'Pyridoxine',
                  'Biotin',
                  'Folate',
                  'Vitamin B12',
                  'Vitamin C',
                ],
              },
              {
                title: 'Minerals',
                slug: 'minerals',
                nodes: ['Calcium', 'Phosphate', 'Iron', 'Iodine', 'Trace elements'],
              },
              {
                title: 'Nutrition',
                slug: 'nutrition',
                nodes: [
                  'Energy requirements',
                  'Balanced diet',
                  'Protein-energy malnutrition',
                  'Dietary fiber',
                  'Nutritional assessment',
                ],
              },
            ],
          },
          {
            title: 'Molecular Biology & Genetics',
            slug: 'molecular-biology-and-genetics',
            topics: [
              {
                title: 'Nucleotides',
                slug: 'nucleotides',
                nodes: [
                  'Purine synthesis',
                  'Purine degradation',
                  'Salvage pathway',
                  'Gout',
                  'Pyrimidine metabolism',
                ],
              },
              {
                title: 'DNA',
                slug: 'dna',
                nodes: ['DNA structure', 'Replication', 'DNA damage', 'DNA repair'],
              },
              {
                title: 'RNA & Protein Synthesis',
                slug: 'rna-and-protein-synthesis',
                nodes: [
                  'Transcription',
                  'RNA processing',
                  'Genetic code',
                  'Translation',
                  'Post-translational modification',
                ],
              },
              {
                title: 'Gene Regulation & Mutation',
                slug: 'gene-regulation-and-mutation',
                nodes: ['Gene expression', 'Mutations', 'Epigenetics basics'],
              },
              {
                title: 'Biotechnology',
                slug: 'biotechnology',
                nodes: [
                  'PCR',
                  'Electrophoresis',
                  'Blotting basics',
                  'Recombinant DNA',
                  'DNA sequencing basics',
                ],
              },
            ],
          },
          {
            title: 'Clinical Biochemistry',
            slug: 'clinical-biochemistry',
            topics: [
              {
                title: 'Liver',
                slug: 'liver',
                nodes: ['Bilirubin', 'AST/ALT', 'ALP/GGT', 'Albumin', 'Liver function tests'],
              },
              {
                title: 'Kidney',
                slug: 'kidney',
                nodes: ['Urea', 'Creatinine', 'eGFR concept', 'Renal function tests'],
              },
              {
                title: 'Acid-Base & Electrolytes',
                slug: 'acid-base-and-electrolytes',
                nodes: [
                  'Buffers',
                  'Metabolic acidosis',
                  'Metabolic alkalosis',
                  'Respiratory acidosis',
                  'Respiratory alkalosis',
                  'Sodium',
                  'Potassium',
                ],
              },
              {
                title: 'Endocrine Biochemistry',
                slug: 'endocrine-biochemistry',
                nodes: [
                  'Thyroid function tests',
                  'Adrenal function tests',
                  'Reproductive hormones',
                ],
              },
              {
                title: 'Other Clinical Topics',
                slug: 'other-clinical-topics',
                nodes: [
                  'Tumor markers',
                  'Free radicals & antioxidants',
                  'Xenobiotic metabolism',
                  'Prenatal screening',
                  'Newborn screening',
                ],
              },
              {
                title: 'Laboratory Skills',
                slug: 'laboratory-skills',
                nodes: [
                  'Colorimetry',
                  'Chromatography demonstration',
                  'Electrophoresis demonstration',
                  'Urine analysis',
                  'Glucose estimation',
                  'Urea estimation',
                  'Creatinine estimation',
                  'Protein & albumin estimation',
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'phase-2',
    label: 'Phase II',
    title: 'Second Professional MBBS',
    subjects: [
      {
        number: 4,
        name: 'Pathology',
        slug: 'pathology',
        accent: 'violet',
        sections: [
          {
            title: 'General Pathology',
            slug: 'general-pathology',
            topics: [
              {
                title: 'Cell Injury & Adaptation',
                slug: 'cell-injury-and-adaptation',
                nodes: [
                  'Hypertrophy',
                  'Hyperplasia',
                  'Atrophy',
                  'Metaplasia',
                  'Reversible cell injury',
                  'Irreversible cell injury',
                  'Necrosis',
                  'Apoptosis',
                  'Intracellular accumulations',
                  'Pathologic calcification',
                ],
              },
              {
                title: 'Inflammation',
                slug: 'inflammation',
                nodes: [
                  'Acute inflammation',
                  'Vascular events',
                  'Cellular events',
                  'Chemical mediators',
                  'Chronic inflammation',
                  'Granulomatous inflammation',
                ],
              },
              {
                title: 'Healing & Repair',
                slug: 'healing-and-repair',
                nodes: [
                  'Regeneration',
                  'Scar formation',
                  'Wound healing',
                  'Factors affecting healing',
                ],
              },
              {
                title: 'Hemodynamic Disorders',
                slug: 'hemodynamic-disorders',
                nodes: [
                  'Edema',
                  'Hyperemia',
                  'Congestion',
                  'Hemorrhage',
                  'Thrombosis',
                  'Embolism',
                  'Infarction',
                  'Shock',
                ],
              },
              {
                title: 'Immunopathology',
                slug: 'immunopathology',
                nodes: [
                  'Hypersensitivity I',
                  'Hypersensitivity II',
                  'Hypersensitivity III',
                  'Hypersensitivity IV',
                  'Autoimmunity',
                  'Immunodeficiency basics',
                  'Transplant rejection',
                  'Amyloidosis',
                ],
              },
              {
                title: 'Neoplasia',
                slug: 'neoplasia',
                nodes: [
                  'Nomenclature',
                  'Benign vs malignant',
                  'Hallmarks basics',
                  'Carcinogenesis',
                  'Tumor suppressor genes',
                  'Oncogenes',
                  'Invasion',
                  'Metastasis',
                  'Grading',
                  'Staging',
                  'Tumor markers',
                  'Paraneoplastic syndromes',
                ],
              },
            ],
          },
          {
            title: 'Hematology',
            slug: 'hematology',
            topics: [
              {
                title: 'Anemias',
                slug: 'anemias',
                nodes: [
                  'Classification',
                  'Iron deficiency anemia',
                  'Megaloblastic anemia',
                  'Hemolytic anemia',
                  'Aplastic anemia',
                  'Hemoglobinopathies basics',
                ],
              },
              {
                title: 'WBC Disorders',
                slug: 'wbc-disorders',
                nodes: [
                  'Leukocytosis',
                  'Leukopenia',
                  'Acute leukemias',
                  'Chronic leukemias',
                  'Myeloproliferative neoplasms basics',
                ],
              },
              {
                title: 'Lymphoid Disorders',
                slug: 'lymphoid-disorders',
                nodes: ['Hodgkin lymphoma', 'Non-Hodgkin lymphoma', 'Plasma cell myeloma'],
              },
              {
                title: 'Hemostasis',
                slug: 'hemostasis',
                nodes: ['Platelet disorders', 'Coagulation disorders', 'Hemophilia', 'DIC'],
              },
              {
                title: 'Blood Bank',
                slug: 'blood-bank',
                nodes: [
                  'Blood grouping',
                  'Cross matching',
                  'Blood components',
                  'Transfusion reactions',
                ],
              },
            ],
          },
          {
            title: 'Systemic Pathology',
            slug: 'systemic-pathology',
            topics: [
              {
                title: 'Cardiovascular',
                slug: 'cardiovascular',
                nodes: [
                  'Atherosclerosis',
                  'Hypertension vascular changes',
                  'Ischemic heart disease',
                  'Myocardial infarction',
                  'Rheumatic heart disease',
                  'Infective endocarditis',
                  'Cardiomyopathies',
                ],
              },
              {
                title: 'Respiratory',
                slug: 'respiratory',
                nodes: [
                  'Pneumonia',
                  'Tuberculosis',
                  'COPD',
                  'Bronchiectasis',
                  'Interstitial lung disease basics',
                  'Lung carcinoma',
                ],
              },
              {
                title: 'GIT',
                slug: 'git',
                nodes: [
                  'Esophagitis basics',
                  'Peptic ulcer',
                  'Gastritis basics',
                  'Inflammatory bowel disease',
                  'Colorectal carcinoma',
                ],
              },
              {
                title: 'Hepatobiliary & Pancreas',
                slug: 'hepatobiliary-and-pancreas',
                nodes: [
                  'Viral hepatitis',
                  'Fatty liver',
                  'Cirrhosis',
                  'Hepatocellular carcinoma',
                  'Gallstones basics',
                  'Pancreatitis',
                ],
              },
              {
                title: 'Renal',
                slug: 'renal',
                nodes: [
                  'Nephritic syndrome',
                  'Nephrotic syndrome',
                  'Glomerulonephritis',
                  'Pyelonephritis',
                  'Acute kidney injury pathology',
                  'Chronic kidney disease pathology',
                  'Renal tumors',
                ],
              },
              {
                title: 'Male Genital',
                slug: 'male-genital',
                nodes: [
                  'Prostatitis basics',
                  'BPH',
                  'Prostate carcinoma',
                  'Testicular tumors basics',
                ],
              },
              {
                title: 'Female Genital',
                slug: 'female-genital',
                nodes: [
                  'Cervicitis basics',
                  'CIN',
                  'Cervical carcinoma',
                  'Endometrial hyperplasia',
                  'Endometrial carcinoma',
                  'Ovarian tumors',
                ],
              },
              {
                title: 'Breast',
                slug: 'breast',
                nodes: ['Fibrocystic change', 'Fibroadenoma', 'Breast carcinoma'],
              },
              {
                title: 'Endocrine',
                slug: 'endocrine',
                nodes: [
                  'Goiter',
                  'Thyroiditis',
                  'Thyroid tumors',
                  'Diabetes mellitus pathology',
                  'Adrenal pathology basics',
                ],
              },
              {
                title: 'Bone & Soft Tissue',
                slug: 'bone-and-soft-tissue',
                nodes: [
                  'Osteomyelitis',
                  'Metabolic bone disease basics',
                  'Bone tumors',
                  'Soft tissue tumors basics',
                ],
              },
              {
                title: 'CNS',
                slug: 'cns',
                nodes: [
                  'Cerebral infarction',
                  'Intracranial hemorrhage',
                  'Meningitis pathology basics',
                  'CNS tumors basics',
                ],
              },
            ],
          },
          {
            title: 'Pathology Practicals',
            slug: 'pathology-practicals',
            topics: [
              {
                title: 'Microscopy',
                slug: 'microscopy',
                nodes: [
                  'General pathology slides',
                  'Hematology smears',
                  'Systemic pathology slides',
                ],
              },
              {
                title: 'Gross Specimens',
                slug: 'gross-specimens',
                nodes: [
                  'Cardiovascular',
                  'Respiratory',
                  'GIT',
                  'Liver',
                  'Kidney',
                  'Reproductive',
                  'Breast',
                  'Endocrine',
                ],
              },
              {
                title: 'Clinical Pathology',
                slug: 'clinical-pathology',
                nodes: [
                  'Urine examination',
                  'Body fluids',
                  'CBC interpretation',
                  'Peripheral smear',
                  'Coagulation profile basics',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 5,
        name: 'Pharmacology',
        slug: 'pharmacology',
        accent: 'emerald',
        sections: [
          {
            title: 'General Pharmacology',
            slug: 'general-pharmacology',
            topics: [
              {
                title: 'Pharmacokinetics',
                slug: 'pharmacokinetics',
                nodes: [
                  'Routes',
                  'Absorption',
                  'Bioavailability',
                  'Distribution',
                  'Volume of distribution',
                  'Metabolism',
                  'First-pass effect',
                  'Excretion',
                  'Clearance',
                  'Half-life',
                  'Steady state',
                ],
              },
              {
                title: 'Pharmacodynamics',
                slug: 'pharmacodynamics',
                nodes: [
                  'Receptors',
                  'Agonists',
                  'Antagonists',
                  'Dose-response curve',
                  'Potency',
                  'Efficacy',
                  'Therapeutic index',
                ],
              },
              {
                title: 'Drug Safety & Rational Use',
                slug: 'drug-safety-and-rational-use',
                nodes: [
                  'Adverse drug reactions',
                  'Drug interactions',
                  'Pharmacovigilance',
                  'Essential medicines',
                  'Rational prescribing',
                  'Fixed-dose combinations',
                ],
              },
            ],
          },
          {
            title: 'Autonomic Nervous System',
            slug: 'autonomic-nervous-system',
            topics: [
              {
                title: 'Cholinergic Drugs',
                slug: 'cholinergic-drugs',
                nodes: [
                  'Muscarinic agonists',
                  'Anticholinesterases',
                  'Atropine & antimuscarinics',
                  'Neuromuscular blockers',
                ],
              },
              {
                title: 'Adrenergic Drugs',
                slug: 'adrenergic-drugs',
                nodes: [
                  'Adrenaline',
                  'Noradrenaline',
                  'Dopamine',
                  'Beta agonists',
                  'Alpha blockers',
                  'Beta blockers',
                ],
              },
              {
                title: 'ANS Toxicology Link',
                slug: 'ans-toxicology-link',
                nodes: ['Organophosphate poisoning — pharmacologic management'],
              },
            ],
          },
          {
            title: 'Cardiovascular & Renal',
            slug: 'cardiovascular-and-renal',
            topics: [
              {
                title: 'Hypertension',
                slug: 'hypertension',
                nodes: [
                  'ACE inhibitors',
                  'ARBs',
                  'Calcium channel blockers',
                  'Beta blockers',
                  'Alpha blockers',
                  'Central sympatholytics',
                  'Vasodilators',
                ],
              },
              {
                title: 'Angina & Ischemic Heart Disease',
                slug: 'angina-and-ischemic-heart-disease',
                nodes: [
                  'Nitrates',
                  'Beta blockers',
                  'Calcium channel blockers',
                  'Antiplatelet drugs',
                ],
              },
              {
                title: 'Heart Failure',
                slug: 'heart-failure',
                nodes: [
                  'ACEI/ARB/ARNI concept',
                  'Beta blockers',
                  'Diuretics',
                  'Digoxin',
                  'Vasodilators',
                ],
              },
              {
                title: 'Arrhythmias',
                slug: 'arrhythmias',
                nodes: ['Class I', 'Class II', 'Class III', 'Class IV', 'Adenosine basics'],
              },
              {
                title: 'Diuretics',
                slug: 'diuretics',
                nodes: [
                  'Carbonic anhydrase inhibitors',
                  'Loop diuretics',
                  'Thiazides',
                  'Potassium-sparing diuretics',
                  'Osmotic diuretics',
                ],
              },
              {
                title: 'Coagulation',
                slug: 'coagulation',
                nodes: ['Anticoagulants', 'Antiplatelets', 'Thrombolytics', 'Hemostatics'],
              },
            ],
          },
          {
            title: 'CNS',
            slug: 'cns',
            topics: [
              {
                title: 'Sedatives & Anxiolytics',
                slug: 'sedatives-and-anxiolytics',
                nodes: ['Benzodiazepines', 'Barbiturates', 'Other hypnotics basics'],
              },
              {
                title: 'Antiepileptics',
                slug: 'antiepileptics',
                nodes: [
                  'Sodium-channel drugs',
                  'GABAergic drugs',
                  'Broad-spectrum agents',
                  'Status epilepticus drugs',
                ],
              },
              {
                title: 'Psychopharmacology',
                slug: 'psychopharmacology',
                nodes: ['Antipsychotics', 'Antidepressants', 'Mood stabilizers'],
              },
              {
                title: 'Parkinsonism',
                slug: 'parkinsonism',
                nodes: [
                  'Levodopa',
                  'Dopamine agonists',
                  'MAO-B/COMT inhibitors',
                  'Anticholinergics',
                ],
              },
              {
                title: 'Pain',
                slug: 'pain',
                nodes: ['Opioids', 'Opioid antagonists'],
              },
              {
                title: 'Anaesthetic Drugs',
                slug: 'anaesthetic-drugs',
                nodes: ['General anaesthetics', 'Local anaesthetics'],
              },
            ],
          },
          {
            title: 'Autacoids & Respiratory',
            slug: 'autacoids-and-respiratory',
            topics: [
              {
                title: 'Autacoids',
                slug: 'autacoids',
                nodes: ['Histamine', 'Antihistamines', 'Serotonin basics', 'Prostaglandins basics'],
              },
              {
                title: 'NSAIDs',
                slug: 'nsaids',
                nodes: ['Aspirin', 'Paracetamol', 'Nonselective NSAIDs', 'COX-2 inhibitors'],
              },
              {
                title: 'Asthma & COPD',
                slug: 'asthma-and-copd',
                nodes: [
                  'Beta-2 agonists',
                  'Antimuscarinics',
                  'Methylxanthines',
                  'Inhaled corticosteroids',
                  'Leukotriene modifiers',
                ],
              },
            ],
          },
          {
            title: 'Antimicrobial Chemotherapy',
            slug: 'antimicrobial-chemotherapy',
            topics: [
              {
                title: 'Principles',
                slug: 'principles',
                nodes: [
                  'Selective toxicity',
                  'Bactericidal vs bacteriostatic',
                  'Antimicrobial resistance',
                  'Combination therapy',
                  'Prophylaxis',
                ],
              },
              {
                title: 'Antibacterials',
                slug: 'antibacterials',
                nodes: [
                  'Penicillins',
                  'Cephalosporins',
                  'Carbapenems',
                  'Aminoglycosides',
                  'Macrolides',
                  'Tetracyclines',
                  'Fluoroquinolones',
                  'Sulfonamides & trimethoprim',
                  'Glycopeptides',
                  'Other antibacterials basics',
                ],
              },
              {
                title: 'Antitubercular',
                slug: 'antitubercular',
                nodes: [
                  'Isoniazid',
                  'Rifampicin',
                  'Pyrazinamide',
                  'Ethambutol',
                  'Second-line overview',
                ],
              },
              {
                title: 'Antileprosy',
                slug: 'antileprosy',
                nodes: ['Dapsone', 'Rifampicin', 'Clofazimine'],
              },
              {
                title: 'Antifungal',
                slug: 'antifungal',
                nodes: ['Azoles', 'Amphotericin B', 'Echinocandins basics', 'Other antifungals'],
              },
              {
                title: 'Antiviral',
                slug: 'antiviral',
                nodes: [
                  'Anti-herpes',
                  'Antiretroviral therapy classes',
                  'Anti-influenza basics',
                  'Hepatitis antivirals basics',
                ],
              },
              {
                title: 'Antiparasitic',
                slug: 'antiparasitic',
                nodes: ['Antimalarials', 'Anti-amoebic drugs', 'Antihelminthics'],
              },
              {
                title: 'Anticancer',
                slug: 'anticancer',
                nodes: [
                  'Alkylating agents',
                  'Antimetabolites',
                  'Antitumor antibiotics',
                  'Microtubule inhibitors',
                  'Hormonal therapy',
                  'Targeted therapy basics',
                ],
              },
            ],
          },
          {
            title: 'Endocrine & GIT',
            slug: 'endocrine-and-git',
            topics: [
              {
                title: 'Diabetes',
                slug: 'diabetes',
                nodes: [
                  'Insulin',
                  'Metformin',
                  'Sulfonylureas',
                  'Other oral antidiabetics',
                  'Incretin-based drugs basics',
                ],
              },
              {
                title: 'Thyroid',
                slug: 'thyroid',
                nodes: ['Thyroid hormone', 'Antithyroid drugs'],
              },
              {
                title: 'Corticosteroids',
                slug: 'corticosteroids',
                nodes: ['Glucocorticoids', 'Mineralocorticoids', 'Adverse effects'],
              },
              {
                title: 'Reproductive',
                slug: 'reproductive',
                nodes: ['Estrogens', 'Progestins', 'Hormonal contraception', 'Uterotonics basics'],
              },
              {
                title: 'GIT',
                slug: 'git',
                nodes: [
                  'Antacids',
                  'H2 blockers',
                  'PPIs',
                  'Antiemetics',
                  'Prokinetics',
                  'Laxatives',
                  'Antidiarrheals',
                ],
              },
            ],
          },
          {
            title: 'Clinical Pharmacology & Practicals',
            slug: 'clinical-pharmacology-and-practicals',
            topics: [
              {
                title: 'Prescription Skills',
                slug: 'prescription-skills',
                nodes: [
                  'Prescription format',
                  'Dose calculation',
                  'P-drug concept',
                  'Prescription audit',
                ],
              },
              {
                title: 'Drug Delivery',
                slug: 'drug-delivery',
                nodes: ['Inhalers', 'Spacers', 'Insulin devices', 'Topical preparations'],
              },
              {
                title: 'Communication & Safety',
                slug: 'communication-and-safety',
                nodes: ['ADR reporting', 'Patient counseling', 'Medication adherence'],
              },
            ],
          },
        ],
      },
      {
        number: 6,
        name: 'Microbiology',
        slug: 'microbiology',
        accent: 'teal',
        sections: [
          {
            title: 'General Microbiology & Infection Control',
            slug: 'general-microbiology-and-infection-control',
            topics: [
              {
                title: 'Bacterial Structure & Growth',
                slug: 'bacterial-structure-and-growth',
                nodes: [
                  'Morphology',
                  'Cell wall',
                  'Spores',
                  'Motility',
                  'Growth curve',
                  'Culture requirements',
                ],
              },
              {
                title: 'Staining',
                slug: 'staining',
                nodes: ['Gram stain', 'Acid-fast stain', 'Special stains basics'],
              },
              {
                title: 'Sterilization & Disinfection',
                slug: 'sterilization-and-disinfection',
                nodes: [
                  'Moist heat',
                  'Dry heat',
                  'Filtration',
                  'Radiation',
                  'Chemical disinfectants',
                  'Autoclave',
                ],
              },
              {
                title: 'Microbial Genetics',
                slug: 'microbial-genetics',
                nodes: [
                  'Mutation',
                  'Transformation',
                  'Transduction',
                  'Conjugation',
                  'Antimicrobial resistance genetics',
                ],
              },
              {
                title: 'Healthcare-Associated Infection',
                slug: 'healthcare-associated-infection',
                nodes: [
                  'Standard precautions',
                  'Hand hygiene',
                  'Biomedical waste',
                  'Needle-stick injury',
                  'Hospital infection surveillance basics',
                ],
              },
            ],
          },
          {
            title: 'Immunology',
            slug: 'immunology',
            topics: [
              {
                title: 'Innate Immunity',
                slug: 'innate-immunity',
                nodes: ['Barriers', 'Phagocytosis', 'Complement', 'NK cells'],
              },
              {
                title: 'Adaptive Immunity',
                slug: 'adaptive-immunity',
                nodes: ['B cells', 'T cells', 'Antibodies', 'Cell-mediated immunity'],
              },
              {
                title: 'Antigen-Antibody Reactions',
                slug: 'antigen-antibody-reactions',
                nodes: [
                  'Precipitation',
                  'Agglutination',
                  'ELISA principles',
                  'Immunofluorescence basics',
                ],
              },
              {
                title: 'Hypersensitivity',
                slug: 'hypersensitivity',
                nodes: ['Type I', 'Type II', 'Type III', 'Type IV'],
              },
              {
                title: 'Immunoprophylaxis',
                slug: 'immunoprophylaxis',
                nodes: ['Vaccines', 'Passive immunization', 'Immunization principles'],
              },
            ],
          },
          {
            title: 'Bacteriology',
            slug: 'bacteriology',
            topics: [
              {
                title: 'Gram-Positive Cocci',
                slug: 'gram-positive-cocci',
                nodes: [
                  'Staphylococcus aureus',
                  'Streptococcus pyogenes',
                  'Streptococcus pneumoniae',
                  'Enterococcus',
                ],
              },
              {
                title: 'Gram-Negative Cocci',
                slug: 'gram-negative-cocci',
                nodes: ['Neisseria gonorrhoeae', 'Neisseria meningitidis'],
              },
              {
                title: 'Enteric Gram-Negative Bacilli',
                slug: 'enteric-gram-negative-bacilli',
                nodes: ['Escherichia coli', 'Klebsiella', 'Salmonella', 'Shigella', 'Proteus'],
              },
              {
                title: 'Other Gram-Negative Bacilli',
                slug: 'other-gram-negative-bacilli',
                nodes: ['Vibrio cholerae', 'Pseudomonas', 'Haemophilus', 'Bordetella basics'],
              },
              {
                title: 'Gram-Positive Bacilli',
                slug: 'gram-positive-bacilli',
                nodes: ['Corynebacterium diphtheriae', 'Bacillus', 'Listeria basics'],
              },
              {
                title: 'Anaerobes',
                slug: 'anaerobes',
                nodes: [
                  'Clostridium tetani',
                  'Clostridium botulinum',
                  'Clostridium perfringens',
                  'C. difficile basics',
                ],
              },
              {
                title: 'Mycobacteria',
                slug: 'mycobacteria',
                nodes: ['Mycobacterium tuberculosis', 'Mycobacterium leprae'],
              },
              {
                title: 'Spirochetes & Others',
                slug: 'spirochetes-and-others',
                nodes: [
                  'Treponema pallidum',
                  'Leptospira',
                  'Rickettsial infections basics',
                  'Chlamydia basics',
                  'Mycoplasma basics',
                ],
              },
            ],
          },
          {
            title: 'Virology',
            slug: 'virology',
            topics: [
              {
                title: 'General Virology',
                slug: 'general-virology',
                nodes: ['Viral structure', 'Replication', 'Cultivation', 'Diagnosis'],
              },
              {
                title: 'DNA Viruses',
                slug: 'dna-viruses',
                nodes: ['Herpes viruses', 'Hepatitis B', 'HPV', 'Poxvirus basics'],
              },
              {
                title: 'RNA Viruses',
                slug: 'rna-viruses',
                nodes: [
                  'Influenza',
                  'Measles',
                  'Mumps',
                  'Rabies',
                  'Polio',
                  'Dengue',
                  'Chikungunya',
                  'Hepatitis A/C/E',
                  'HIV',
                  'Coronaviruses basics',
                ],
              },
            ],
          },
          {
            title: 'Mycology',
            slug: 'mycology',
            topics: [
              {
                title: 'Superficial & Cutaneous',
                slug: 'superficial-and-cutaneous',
                nodes: ['Dermatophytes', 'Malassezia basics'],
              },
              {
                title: 'Opportunistic & Systemic',
                slug: 'opportunistic-and-systemic',
                nodes: [
                  'Candida',
                  'Cryptococcus',
                  'Aspergillus',
                  'Mucorales',
                  'Dimorphic fungi basics',
                ],
              },
            ],
          },
          {
            title: 'Parasitology',
            slug: 'parasitology',
            topics: [
              {
                title: 'Protozoa',
                slug: 'protozoa',
                nodes: [
                  'Entamoeba histolytica',
                  'Giardia',
                  'Trichomonas',
                  'Plasmodium',
                  'Leishmania',
                  'Toxoplasma basics',
                ],
              },
              {
                title: 'Helminths',
                slug: 'helminths',
                nodes: [
                  'Ascaris',
                  'Hookworm',
                  'Enterobius',
                  'Strongyloides',
                  'Taenia',
                  'Echinococcus',
                  'Filarial worms',
                ],
              },
            ],
          },
          {
            title: 'System-Based Diagnostic Microbiology',
            slug: 'system-based-diagnostic-microbiology',
            topics: [
              {
                title: 'Bloodstream & CVS',
                slug: 'bloodstream-and-cvs',
                nodes: ['Blood culture', 'Sepsis microbiology basics'],
              },
              {
                title: 'Respiratory',
                slug: 'respiratory',
                nodes: ['Sputum examination', 'TB diagnosis', 'Respiratory pathogen diagnosis'],
              },
              {
                title: 'GIT',
                slug: 'git',
                nodes: ['Stool microscopy', 'Stool culture basics', 'Enteric pathogen diagnosis'],
              },
              {
                title: 'Urinary',
                slug: 'urinary',
                nodes: ['Urine microscopy', 'Urine culture', 'Significant bacteriuria'],
              },
              {
                title: 'CNS',
                slug: 'cns',
                nodes: ['CSF examination', 'Meningitis pathogen diagnosis'],
              },
              {
                title: 'Genital Tract',
                slug: 'genital-tract',
                nodes: [
                  'STI specimen collection',
                  'Syphilis tests',
                  'HIV testing algorithm basics',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 7,
        name: 'Forensic Medicine',
        slug: 'forensic-medicine',
        accent: 'slate',
        sections: [
          {
            title: 'Forensic Medicine & Law',
            slug: 'forensic-medicine-and-law',
            topics: [
              {
                title: 'Legal Procedures',
                slug: 'legal-procedures',
                nodes: [
                  'Inquest',
                  'Summons',
                  'Evidence',
                  'Dying declaration',
                  'Dying deposition basics',
                ],
              },
              {
                title: 'Identification',
                slug: 'identification',
                nodes: [
                  'Age',
                  'Sex',
                  'Stature',
                  'Race-related identification concepts',
                  'Scars & tattoos',
                  'Fingerprints',
                  'DNA profiling basics',
                ],
              },
              {
                title: 'Medical Jurisprudence',
                slug: 'medical-jurisprudence',
                nodes: [
                  'Consent',
                  'Confidentiality',
                  'Medical negligence',
                  'Professional misconduct',
                  'Medical records',
                  'Consumer protection basics',
                ],
              },
            ],
          },
          {
            title: 'Thanatology',
            slug: 'thanatology',
            topics: [
              {
                title: 'Death',
                slug: 'death',
                nodes: [
                  'Somatic death',
                  'Molecular death',
                  'Brain death',
                  'Cause/mechanism/manner of death',
                ],
              },
              {
                title: 'Postmortem Changes',
                slug: 'postmortem-changes',
                nodes: [
                  'Algor mortis',
                  'Livor mortis',
                  'Rigor mortis',
                  'Decomposition',
                  'Adipocere',
                  'Mummification',
                ],
              },
              {
                title: 'Autopsy',
                slug: 'autopsy',
                nodes: [
                  'Medicolegal autopsy',
                  'Objectives',
                  'Basic procedure',
                  'Preservation of viscera',
                ],
              },
            ],
          },
          {
            title: 'Injuries',
            slug: 'injuries',
            topics: [
              {
                title: 'Mechanical Injuries',
                slug: 'mechanical-injuries',
                nodes: [
                  'Abrasion',
                  'Contusion',
                  'Laceration',
                  'Incised wound',
                  'Stab wound',
                  'Chop wound',
                ],
              },
              {
                title: 'Regional & Special Injuries',
                slug: 'regional-and-special-injuries',
                nodes: ['Head injury basics', 'Defense wounds', 'Fabricated injuries'],
              },
              {
                title: 'Firearm Injuries',
                slug: 'firearm-injuries',
                nodes: ['Entry wound', 'Exit wound', 'Range of fire basics'],
              },
              {
                title: 'Thermal & Electrical',
                slug: 'thermal-and-electrical',
                nodes: ['Burns', 'Scalds', 'Electrocution', 'Lightning basics'],
              },
            ],
          },
          {
            title: 'Asphyxial Deaths',
            slug: 'asphyxial-deaths',
            topics: [
              {
                title: 'Asphyxia',
                slug: 'asphyxia',
                nodes: [
                  'Hanging',
                  'Ligature strangulation',
                  'Manual strangulation',
                  'Suffocation',
                  'Drowning',
                ],
              },
            ],
          },
          {
            title: 'Sexual & Reproductive Forensics',
            slug: 'sexual-and-reproductive-forensics',
            topics: [
              {
                title: 'Sexual Offences',
                slug: 'sexual-offences',
                nodes: [
                  'Examination principles',
                  'Evidence collection',
                  'Consent & legal considerations',
                ],
              },
              {
                title: 'Pregnancy & Delivery',
                slug: 'pregnancy-and-delivery',
                nodes: [
                  'Pregnancy diagnosis forensic aspects',
                  'Delivery forensic aspects',
                  'Abortion medicolegal aspects basics',
                ],
              },
            ],
          },
          {
            title: 'Toxicology',
            slug: 'toxicology',
            topics: [
              {
                title: 'General Toxicology',
                slug: 'general-toxicology',
                nodes: [
                  'Routes',
                  'Toxidromes basics',
                  'Decontamination',
                  'Antidotes',
                  'Sample preservation',
                ],
              },
              {
                title: 'Corrosives & Irritants',
                slug: 'corrosives-and-irritants',
                nodes: ['Acids', 'Alkalis', 'Irritant poisons'],
              },
              {
                title: 'Pesticides',
                slug: 'pesticides',
                nodes: ['Organophosphates', 'Carbamates basics', 'Aluminium phosphide'],
              },
              {
                title: 'CNS Poisons',
                slug: 'cns-poisons',
                nodes: ['Alcohol', 'Opioids', 'Sedative-hypnotics basics', 'Deliriants basics'],
              },
              {
                title: 'Plant Poisons',
                slug: 'plant-poisons',
                nodes: ['Datura', 'Oleander basics'],
              },
              {
                title: 'Animal Poisons',
                slug: 'animal-poisons',
                nodes: ['Snake bite', 'Scorpion sting'],
              },
              {
                title: 'Common Gases',
                slug: 'common-gases',
                nodes: ['Carbon monoxide', 'Other asphyxiant gases basics'],
              },
            ],
          },
          {
            title: 'Documentation & Practicals',
            slug: 'documentation-and-practicals',
            topics: [
              {
                title: 'Certificates',
                slug: 'certificates',
                nodes: ['Death certificate', 'Injury certificate', 'Age certificate basics'],
              },
              {
                title: 'Reports',
                slug: 'reports',
                nodes: [
                  'Medicolegal report',
                  'Poisoning documentation',
                  'Sexual offence documentation principles',
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'phase-3a',
    label: 'Phase III · Part I',
    title: 'Third Professional MBBS Part I',
    subjects: [
      {
        number: 8,
        name: 'Community Medicine',
        slug: 'community-medicine',
        accent: 'lime',
        sections: [
          {
            title: 'Health, Disease & Epidemiology',
            slug: 'health-disease-and-epidemiology',
            topics: [
              {
                title: 'Health & Disease',
                slug: 'health-and-disease',
                nodes: [
                  'Concept of health',
                  'Dimensions',
                  'Determinants',
                  'Natural history of disease',
                  'Levels of prevention',
                ],
              },
              {
                title: 'Epidemiologic Measures',
                slug: 'epidemiologic-measures',
                nodes: [
                  'Incidence',
                  'Prevalence',
                  'Mortality rates',
                  'Case fatality',
                  'Association measures basics',
                ],
              },
              {
                title: 'Study Designs',
                slug: 'study-designs',
                nodes: [
                  'Cross-sectional',
                  'Case-control',
                  'Cohort',
                  'Randomized controlled trial basics',
                ],
              },
              {
                title: 'Screening',
                slug: 'screening',
                nodes: ['Sensitivity', 'Specificity', 'Predictive values', 'Screening criteria'],
              },
              {
                title: 'Outbreak Investigation',
                slug: 'outbreak-investigation',
                nodes: [
                  'Case definition',
                  'Epidemic curve',
                  'Attack rate',
                  'Steps of outbreak investigation',
                ],
              },
            ],
          },
          {
            title: 'Biostatistics & Demography',
            slug: 'biostatistics-and-demography',
            topics: [
              {
                title: 'Biostatistics',
                slug: 'biostatistics',
                nodes: [
                  'Data types',
                  'Tables & graphs',
                  'Mean',
                  'Median',
                  'Mode',
                  'Range',
                  'Variance',
                  'Standard deviation',
                  'Normal distribution basics',
                  'Sampling',
                  'Tests of significance basics',
                ],
              },
              {
                title: 'Demography',
                slug: 'demography',
                nodes: [
                  'Census',
                  'Population pyramid',
                  'Demographic cycle',
                  'Fertility indicators',
                  'Mortality indicators',
                  'Life expectancy',
                ],
              },
            ],
          },
          {
            title: 'Communicable Diseases',
            slug: 'communicable-diseases',
            topics: [
              {
                title: 'Respiratory',
                slug: 'respiratory',
                nodes: ['Tuberculosis', 'Diphtheria', 'Pertussis', 'Measles', 'Influenza basics'],
              },
              {
                title: 'Vector-Borne',
                slug: 'vector-borne',
                nodes: [
                  'Malaria',
                  'Dengue',
                  'Chikungunya',
                  'Filariasis',
                  'Japanese encephalitis basics',
                ],
              },
              {
                title: 'Water/Food-Borne',
                slug: 'water-food-borne',
                nodes: ['Diarrheal diseases', 'Cholera', 'Typhoid', 'Hepatitis A/E'],
              },
              {
                title: 'Zoonoses',
                slug: 'zoonoses',
                nodes: ['Rabies', 'Leptospirosis'],
              },
              {
                title: 'STI & HIV',
                slug: 'sti-and-hiv',
                nodes: ['HIV/AIDS', 'STI control principles'],
              },
            ],
          },
          {
            title: 'Non-Communicable Diseases',
            slug: 'non-communicable-diseases',
            topics: [
              {
                title: 'Major NCDs',
                slug: 'major-ncds',
                nodes: [
                  'Hypertension',
                  'Diabetes',
                  'Cardiovascular disease',
                  'Cancer',
                  'Chronic respiratory disease',
                ],
              },
              {
                title: 'Risk Factors',
                slug: 'risk-factors',
                nodes: ['Tobacco', 'Alcohol', 'Diet', 'Physical inactivity', 'Obesity'],
              },
            ],
          },
          {
            title: 'Maternal, Child & Adolescent Health',
            slug: 'maternal-child-and-adolescent-health',
            topics: [
              {
                title: 'Maternal Health',
                slug: 'maternal-health',
                nodes: [
                  'Antenatal care',
                  'Intranatal care',
                  'Postnatal care',
                  'High-risk approach',
                  'Maternal mortality',
                ],
              },
              {
                title: 'Child Health',
                slug: 'child-health',
                nodes: [
                  'Growth monitoring',
                  'Infant mortality',
                  'Under-five mortality',
                  'IMNCI basics',
                ],
              },
              {
                title: 'Adolescent Health',
                slug: 'adolescent-health',
                nodes: ['Adolescent health problems', 'Adolescent health services basics'],
              },
              {
                title: 'Immunization',
                slug: 'immunization',
                nodes: [
                  'National Immunization Schedule',
                  'Cold chain',
                  'Vaccine logistics',
                  'AEFI basics',
                ],
              },
            ],
          },
          {
            title: 'Nutrition',
            slug: 'nutrition',
            topics: [
              {
                title: 'Assessment',
                slug: 'assessment',
                nodes: ['Nutritional assessment', 'Anthropometry', 'Diet survey basics'],
              },
              {
                title: 'Deficiencies',
                slug: 'deficiencies',
                nodes: [
                  'Protein-energy malnutrition',
                  'Iron deficiency anemia',
                  'Vitamin A deficiency',
                  'Iodine deficiency disorders',
                ],
              },
              {
                title: 'Programs',
                slug: 'programs',
                nodes: ['Nutrition programs', 'Supplementation & fortification basics'],
              },
            ],
          },
          {
            title: 'Environmental & Occupational Health',
            slug: 'environmental-and-occupational-health',
            topics: [
              {
                title: 'Water & Sanitation',
                slug: 'water-and-sanitation',
                nodes: [
                  'Safe water',
                  'Purification',
                  'Water quality',
                  'Excreta disposal',
                  'Sewage basics',
                ],
              },
              {
                title: 'Air, Housing & Waste',
                slug: 'air-housing-and-waste',
                nodes: [
                  'Air pollution',
                  'Ventilation',
                  'Housing standards basics',
                  'Solid waste',
                  'Biomedical waste',
                ],
              },
              {
                title: 'Occupational Health',
                slug: 'occupational-health',
                nodes: [
                  'Occupational hazards',
                  'Pneumoconiosis',
                  'Lead poisoning basics',
                  'Ergonomics',
                  'Occupational prevention',
                ],
              },
            ],
          },
          {
            title: 'Health System, Programs & Management',
            slug: 'health-system-programs-and-management',
            topics: [
              {
                title: 'Health Care Delivery',
                slug: 'health-care-delivery',
                nodes: ['Subcentre', 'PHC', 'CHC', 'District hospital', 'Referral system'],
              },
              {
                title: 'National Programs',
                slug: 'national-programs',
                nodes: [
                  'NTEP',
                  'Vector-borne disease program',
                  'HIV/AIDS control',
                  'NCD program',
                  'National Health Mission',
                  'Blindness control',
                  'Mental health program basics',
                ],
              },
              {
                title: 'Health Planning',
                slug: 'health-planning',
                nodes: ['Health indicators', 'National Health Policy', 'Health planning basics'],
              },
              {
                title: 'Family Welfare',
                slug: 'family-welfare',
                nodes: ['Contraceptive methods', 'Eligible couple', 'Family planning services'],
              },
            ],
          },
          {
            title: 'Field & Practical Skills',
            slug: 'field-and-practical-skills',
            topics: [
              {
                title: 'Family Study',
                slug: 'family-study',
                nodes: [
                  'Family folder',
                  'Socioeconomic assessment',
                  'Environmental assessment',
                  'Risk assessment',
                ],
              },
              {
                title: 'Community Skills',
                slug: 'community-skills',
                nodes: ['Health education', 'Survey', 'Home visit', 'Community diagnosis basics'],
              },
            ],
          },
        ],
      },
      {
        number: 9,
        name: 'Ophthalmology',
        slug: 'ophthalmology',
        accent: 'cyan',
        sections: [
          {
            title: 'Optics, Examination & Refraction',
            slug: 'optics-examination-and-refraction',
            topics: [
              {
                title: 'Examination',
                slug: 'examination',
                nodes: [
                  'Visual acuity',
                  'Pupils',
                  'Torchlight examination',
                  'Slit lamp basics',
                  'Ophthalmoscopy',
                  'Intraocular pressure basics',
                ],
              },
              {
                title: 'Refraction',
                slug: 'refraction',
                nodes: [
                  'Myopia',
                  'Hypermetropia',
                  'Astigmatism',
                  'Presbyopia',
                  'Correction principles',
                ],
              },
            ],
          },
          {
            title: 'Adnexa & Conjunctiva',
            slug: 'adnexa-and-conjunctiva',
            topics: [
              {
                title: 'Eyelid',
                slug: 'eyelid',
                nodes: [
                  'Blepharitis',
                  'Stye',
                  'Chalazion',
                  'Ptosis basics',
                  'Entropion',
                  'Ectropion',
                ],
              },
              {
                title: 'Lacrimal',
                slug: 'lacrimal',
                nodes: ['Dacryocystitis', 'Lacrimal obstruction basics'],
              },
              {
                title: 'Conjunctiva',
                slug: 'conjunctiva',
                nodes: [
                  'Bacterial conjunctivitis',
                  'Viral conjunctivitis',
                  'Allergic conjunctivitis',
                  'Trachoma basics',
                  'Pterygium',
                ],
              },
            ],
          },
          {
            title: 'Cornea, Sclera & Uvea',
            slug: 'cornea-sclera-and-uvea',
            topics: [
              {
                title: 'Cornea',
                slug: 'cornea',
                nodes: ['Keratitis', 'Corneal ulcer', 'Corneal opacity', 'Keratoconus basics'],
              },
              {
                title: 'Sclera',
                slug: 'sclera',
                nodes: ['Episcleritis basics', 'Scleritis basics'],
              },
              {
                title: 'Uvea',
                slug: 'uvea',
                nodes: ['Anterior uveitis', 'Posterior uveitis basics'],
              },
            ],
          },
          {
            title: 'Lens & Glaucoma',
            slug: 'lens-and-glaucoma',
            topics: [
              {
                title: 'Lens',
                slug: 'lens',
                nodes: [
                  'Cataract — types',
                  'Clinical features',
                  'Complications basics',
                  'Principles of cataract surgery',
                ],
              },
              {
                title: 'Glaucoma',
                slug: 'glaucoma',
                nodes: [
                  'Primary open-angle glaucoma',
                  'Angle-closure glaucoma',
                  'Congenital glaucoma basics',
                  'Tonometry',
                  'Visual fields basics',
                ],
              },
            ],
          },
          {
            title: 'Retina & Optic Nerve',
            slug: 'retina-and-optic-nerve',
            topics: [
              {
                title: 'Retina',
                slug: 'retina',
                nodes: [
                  'Diabetic retinopathy',
                  'Hypertensive retinopathy',
                  'Retinal detachment',
                  'Retinal vascular occlusion basics',
                  'Macular disorders basics',
                ],
              },
              {
                title: 'Optic Nerve',
                slug: 'optic-nerve',
                nodes: ['Optic neuritis basics', 'Papilledema basics', 'Optic atrophy basics'],
              },
            ],
          },
          {
            title: 'Squint, Neuro-ophthalmology & Trauma',
            slug: 'squint-neuro-ophthalmology-and-trauma',
            topics: [
              {
                title: 'Squint',
                slug: 'squint',
                nodes: [
                  'Concomitant squint basics',
                  'Paralytic squint basics',
                  'Cover tests basics',
                ],
              },
              {
                title: 'Neuro-ophthalmology',
                slug: 'neuro-ophthalmology',
                nodes: [
                  'Pupillary abnormalities',
                  'Visual pathway lesions',
                  'Field defects basics',
                ],
              },
              {
                title: 'Trauma',
                slug: 'trauma',
                nodes: [
                  'Chemical injury',
                  'Blunt trauma',
                  'Penetrating injury basics',
                  'Ocular foreign body basics',
                ],
              },
            ],
          },
          {
            title: 'Community Ophthalmology & Skills',
            slug: 'community-ophthalmology-and-skills',
            topics: [
              {
                title: 'Blindness',
                slug: 'blindness',
                nodes: [
                  'Avoidable blindness',
                  'Cataract blindness',
                  'Refractive error',
                  'National blindness control program',
                ],
              },
              {
                title: 'Skills',
                slug: 'skills',
                nodes: ['Visual acuity', 'Torch exam', 'Direct ophthalmoscopy', 'Eye first aid'],
              },
            ],
          },
        ],
      },
      {
        number: 10,
        name: 'ENT',
        slug: 'ent',
        accent: 'teal',
        sections: [
          {
            title: 'Ear',
            slug: 'ear',
            topics: [
              {
                title: 'Clinical Anatomy & Examination',
                slug: 'clinical-anatomy-and-examination',
                nodes: ['External ear', 'Tympanic membrane', 'Middle ear', 'Inner ear', 'Otoscopy'],
              },
              {
                title: 'External Ear',
                slug: 'external-ear',
                nodes: ['Wax', 'Otitis externa', 'Foreign body'],
              },
              {
                title: 'Middle Ear',
                slug: 'middle-ear',
                nodes: [
                  'Acute otitis media',
                  'Otitis media with effusion basics',
                  'Chronic suppurative otitis media',
                  'Complications of otitis media',
                ],
              },
              {
                title: 'Inner Ear',
                slug: 'inner-ear',
                nodes: ['Sensorineural hearing loss', 'Vertigo', 'Ménière disease basics'],
              },
              {
                title: 'Hearing',
                slug: 'hearing',
                nodes: [
                  'Rinne test',
                  'Weber test',
                  'Pure-tone audiometry basics',
                  'Conductive vs sensorineural loss',
                ],
              },
            ],
          },
          {
            title: 'Nose & Paranasal Sinuses',
            slug: 'nose-and-paranasal-sinuses',
            topics: [
              {
                title: 'Nose',
                slug: 'nose',
                nodes: [
                  'Deviated nasal septum',
                  'Allergic rhinitis',
                  'Epistaxis',
                  'Nasal polyp',
                  'Foreign body',
                ],
              },
              {
                title: 'Sinuses',
                slug: 'sinuses',
                nodes: ['Acute sinusitis', 'Chronic rhinosinusitis', 'Complications basics'],
              },
            ],
          },
          {
            title: 'Pharynx & Oral Cavity',
            slug: 'pharynx-and-oral-cavity',
            topics: [
              {
                title: 'Tonsil & Adenoid',
                slug: 'tonsil-and-adenoid',
                nodes: [
                  'Acute tonsillitis',
                  'Chronic tonsillitis',
                  'Peritonsillar abscess',
                  'Adenoid hypertrophy',
                ],
              },
              {
                title: 'Pharynx',
                slug: 'pharynx',
                nodes: ['Pharyngitis', 'Dysphagia approach basics'],
              },
            ],
          },
          {
            title: 'Larynx & Airway',
            slug: 'larynx-and-airway',
            topics: [
              {
                title: 'Larynx',
                slug: 'larynx',
                nodes: [
                  'Acute laryngitis',
                  'Chronic hoarseness approach',
                  'Vocal cord palsy basics',
                ],
              },
              {
                title: 'Airway',
                slug: 'airway',
                nodes: ['Stridor', 'Foreign body aspiration', 'Tracheostomy principles basics'],
              },
            ],
          },
          {
            title: 'Head & Neck',
            slug: 'head-and-neck',
            topics: [
              {
                title: 'Neck Swelling',
                slug: 'neck-swelling',
                nodes: [
                  'Lymph nodes',
                  'Thyroid-related swelling cross-link',
                  'Congenital neck swelling basics',
                ],
              },
              {
                title: 'Malignancy',
                slug: 'malignancy',
                nodes: [
                  'Oral cancer red flags',
                  'Laryngeal cancer red flags',
                  'Nasopharyngeal malignancy basics',
                ],
              },
            ],
          },
          {
            title: 'ENT Clinical Skills',
            slug: 'ent-clinical-skills',
            topics: [
              {
                title: 'Examination',
                slug: 'examination',
                nodes: [
                  'Ear examination',
                  'Nasal examination',
                  'Oral cavity examination',
                  'Throat examination',
                  'Neck examination',
                  'Tuning fork tests',
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'phase-3b',
    label: 'Phase III · Part II',
    title: 'Final Professional MBBS',
    subjects: [
      {
        number: 11,
        name: 'General Medicine',
        slug: 'general-medicine',
        accent: 'indigo',
        sections: [
          {
            title: 'Clinical Methods & Emergency Approach',
            slug: 'clinical-methods-and-emergency-approach',
            topics: [
              {
                title: 'Clinical Methods',
                slug: 'clinical-methods',
                nodes: [
                  'History taking',
                  'General examination',
                  'Vitals',
                  'Pallor',
                  'Icterus',
                  'Cyanosis',
                  'Clubbing',
                  'Lymphadenopathy',
                  'Edema',
                ],
              },
              {
                title: 'Common Presentations',
                slug: 'common-presentations',
                nodes: [
                  'Fever',
                  'Chest pain',
                  'Breathlessness',
                  'Cough',
                  'Palpitations',
                  'Syncope',
                  'Edema',
                  'Jaundice',
                  'Altered sensorium',
                ],
              },
              {
                title: 'Emergency Basics',
                slug: 'emergency-basics',
                nodes: [
                  'ABCDE approach',
                  'Shock recognition',
                  'Sepsis recognition',
                  'Basic resuscitation principles',
                ],
              },
            ],
          },
          {
            title: 'Cardiovascular Medicine',
            slug: 'cardiovascular-medicine',
            topics: [
              {
                title: 'Ischemic Heart Disease',
                slug: 'ischemic-heart-disease',
                nodes: [
                  'Stable angina',
                  'Acute coronary syndrome',
                  'Myocardial infarction',
                  'ECG basics',
                  'Initial management principles',
                ],
              },
              {
                title: 'Heart Failure',
                slug: 'heart-failure',
                nodes: [
                  'Left heart failure',
                  'Right heart failure',
                  'Acute pulmonary edema basics',
                ],
              },
              {
                title: 'Hypertension',
                slug: 'hypertension',
                nodes: [
                  'Primary hypertension',
                  'Secondary causes basics',
                  'Hypertensive emergency basics',
                ],
              },
              {
                title: 'Valvular Disease',
                slug: 'valvular-disease',
                nodes: [
                  'Mitral stenosis',
                  'Mitral regurgitation',
                  'Aortic stenosis',
                  'Aortic regurgitation',
                  'Rheumatic heart disease',
                ],
              },
              {
                title: 'Arrhythmias',
                slug: 'arrhythmias',
                nodes: [
                  'Atrial fibrillation',
                  'SVT basics',
                  'Bradyarrhythmia basics',
                  'Ventricular arrhythmia recognition basics',
                ],
              },
            ],
          },
          {
            title: 'Respiratory Medicine',
            slug: 'respiratory-medicine',
            topics: [
              {
                title: 'Airway Disease',
                slug: 'airway-disease',
                nodes: ['Bronchial asthma', 'COPD'],
              },
              {
                title: 'Infections',
                slug: 'infections',
                nodes: ['Community-acquired pneumonia', 'Pulmonary tuberculosis'],
              },
              {
                title: 'Pleural Disease',
                slug: 'pleural-disease',
                nodes: ['Pleural effusion', 'Pneumothorax'],
              },
              {
                title: 'Other',
                slug: 'other',
                nodes: [
                  'Respiratory failure basics',
                  'Hemoptysis approach',
                  'Lung malignancy red flags basics',
                ],
              },
            ],
          },
          {
            title: 'Gastroenterology & Hepatology',
            slug: 'gastroenterology-and-hepatology',
            topics: [
              {
                title: 'Upper GI',
                slug: 'upper-gi',
                nodes: ['GERD', 'Peptic ulcer disease', 'Upper GI bleed'],
              },
              {
                title: 'Intestinal',
                slug: 'intestinal',
                nodes: [
                  'Acute diarrhea',
                  'Chronic diarrhea',
                  'Malabsorption basics',
                  'Inflammatory bowel disease basics',
                ],
              },
              {
                title: 'Liver',
                slug: 'liver',
                nodes: [
                  'Jaundice',
                  'Viral hepatitis',
                  'Cirrhosis',
                  'Portal hypertension',
                  'Hepatic encephalopathy basics',
                ],
              },
            ],
          },
          {
            title: 'Renal & Electrolytes',
            slug: 'renal-and-electrolytes',
            topics: [
              {
                title: 'Kidney Disease',
                slug: 'kidney-disease',
                nodes: [
                  'Acute kidney injury',
                  'Chronic kidney disease',
                  'Nephrotic syndrome',
                  'Nephritic syndrome basics',
                ],
              },
              {
                title: 'Urinary',
                slug: 'urinary',
                nodes: ['Urinary tract infection'],
              },
              {
                title: 'Electrolytes & Acid-Base',
                slug: 'electrolytes-and-acid-base',
                nodes: [
                  'Hyponatremia',
                  'Hypernatremia',
                  'Hypokalemia',
                  'Hyperkalemia',
                  'Acid-base disorders basics',
                ],
              },
            ],
          },
          {
            title: 'Endocrinology & Metabolism',
            slug: 'endocrinology-and-metabolism',
            topics: [
              {
                title: 'Diabetes',
                slug: 'diabetes',
                nodes: [
                  'Diagnosis',
                  'Type 1',
                  'Type 2',
                  'Hypoglycemia',
                  'DKA',
                  'Chronic complications',
                ],
              },
              {
                title: 'Thyroid',
                slug: 'thyroid',
                nodes: [
                  'Hypothyroidism',
                  'Hyperthyroidism',
                  'Thyroid function interpretation basics',
                ],
              },
              {
                title: 'Other Endocrine',
                slug: 'other-endocrine',
                nodes: [
                  'Adrenal disorders basics',
                  'Pituitary disorders basics',
                  'Calcium disorders basics',
                ],
              },
            ],
          },
          {
            title: 'Hematology & Oncology',
            slug: 'hematology-and-oncology',
            topics: [
              {
                title: 'Anemia',
                slug: 'anemia',
                nodes: [
                  'Microcytic anemia',
                  'Macrocytic anemia',
                  'Hemolytic anemia',
                  'Anemia of chronic disease basics',
                ],
              },
              {
                title: 'Blood Malignancy',
                slug: 'blood-malignancy',
                nodes: ['Leukemia recognition basics', 'Lymphoma recognition basics'],
              },
              {
                title: 'Bleeding',
                slug: 'bleeding',
                nodes: ['Thrombocytopenia', 'Coagulation disorder approach basics'],
              },
              {
                title: 'Oncology',
                slug: 'oncology',
                nodes: [
                  'Cancer warning signs',
                  'Common malignancies overview',
                  'Oncologic emergencies basics',
                ],
              },
            ],
          },
          {
            title: 'Infectious & Tropical Medicine',
            slug: 'infectious-and-tropical-medicine',
            topics: [
              {
                title: 'Fever',
                slug: 'fever',
                nodes: ['Acute febrile illness', 'Fever of unknown origin basics', 'Sepsis'],
              },
              {
                title: 'Tropical',
                slug: 'tropical',
                nodes: ['Malaria', 'Dengue', 'Typhoid', 'Leptospirosis', 'Scrub typhus basics'],
              },
              {
                title: 'HIV',
                slug: 'hiv',
                nodes: [
                  'HIV diagnosis basics',
                  'Opportunistic infections',
                  'ART principles basics',
                ],
              },
            ],
          },
          {
            title: 'Neurology',
            slug: 'neurology',
            topics: [
              {
                title: 'Cerebrovascular',
                slug: 'cerebrovascular',
                nodes: ['Ischemic stroke', 'Hemorrhagic stroke', 'TIA basics'],
              },
              {
                title: 'Seizures',
                slug: 'seizures',
                nodes: ['Generalized seizures', 'Focal seizures', 'Status epilepticus basics'],
              },
              {
                title: 'CNS Infection',
                slug: 'cns-infection',
                nodes: ['Meningitis', 'Encephalitis'],
              },
              {
                title: 'Other',
                slug: 'other',
                nodes: [
                  'Headache approach',
                  'Peripheral neuropathy basics',
                  'Movement disorder basics',
                ],
              },
            ],
          },
          {
            title: 'Rheumatology, Toxicology & Miscellaneous',
            slug: 'rheumatology-toxicology-and-miscellaneous',
            topics: [
              {
                title: 'Rheumatology',
                slug: 'rheumatology',
                nodes: ['Rheumatoid arthritis', 'SLE', 'Spondyloarthritis basics'],
              },
              {
                title: 'Poisoning',
                slug: 'poisoning',
                nodes: ['Organophosphate poisoning', 'Snake bite', 'Common poisoning approach'],
              },
              {
                title: 'Nutrition',
                slug: 'nutrition',
                nodes: ['Common vitamin deficiencies', 'Malnutrition basics'],
              },
            ],
          },
          {
            title: 'Medicine Clinical Skills',
            slug: 'medicine-clinical-skills',
            topics: [
              {
                title: 'System Examination',
                slug: 'system-examination',
                nodes: [
                  'CVS examination',
                  'Respiratory examination',
                  'Abdominal examination',
                  'Neurological examination',
                ],
              },
              {
                title: 'Interpretation',
                slug: 'interpretation',
                nodes: [
                  'ECG basics',
                  'Chest X-ray basics',
                  'ABG basics',
                  'Common lab interpretation',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 12,
        name: 'General Surgery',
        slug: 'general-surgery',
        accent: 'orange',
        sections: [
          {
            title: 'Principles of Surgery',
            slug: 'principles-of-surgery',
            topics: [
              {
                title: 'Perioperative Care',
                slug: 'perioperative-care',
                nodes: [
                  'Preoperative assessment',
                  'Surgical risk basics',
                  'Postoperative care',
                  'Postoperative complications',
                ],
              },
              {
                title: 'Wounds & Infection',
                slug: 'wounds-and-infection',
                nodes: [
                  'Wound classification',
                  'Wound healing',
                  'Surgical site infection',
                  'Abscess',
                  'Tetanus prophylaxis basics',
                ],
              },
              {
                title: 'Fluids, Blood & Nutrition',
                slug: 'fluids-blood-and-nutrition',
                nodes: [
                  'Fluid therapy',
                  'Electrolytes',
                  'Blood transfusion',
                  'Surgical nutrition basics',
                ],
              },
              {
                title: 'Shock',
                slug: 'shock',
                nodes: ['Hypovolemic shock', 'Septic shock basics', 'Initial management'],
              },
            ],
          },
          {
            title: 'Trauma',
            slug: 'trauma',
            topics: [
              {
                title: 'Initial Trauma Care',
                slug: 'initial-trauma-care',
                nodes: ['Primary survey', 'Secondary survey', 'Airway', 'Breathing', 'Circulation'],
              },
              {
                title: 'Head & Chest Trauma',
                slug: 'head-and-chest-trauma',
                nodes: ['Head injury basics', 'Pneumothorax', 'Hemothorax basics'],
              },
              {
                title: 'Abdominal Trauma',
                slug: 'abdominal-trauma',
                nodes: ['Blunt abdominal trauma basics', 'Penetrating trauma basics'],
              },
            ],
          },
          {
            title: 'Gastrointestinal Surgery',
            slug: 'gastrointestinal-surgery',
            topics: [
              {
                title: 'Esophagus & Stomach',
                slug: 'esophagus-and-stomach',
                nodes: [
                  'Dysphagia surgical approach basics',
                  'Peptic ulcer complications',
                  'Gastric malignancy basics',
                ],
              },
              {
                title: 'Small & Large Bowel',
                slug: 'small-and-large-bowel',
                nodes: [
                  'Intestinal obstruction',
                  'Perforation peritonitis basics',
                  'Appendicitis',
                  'Colorectal malignancy basics',
                ],
              },
              {
                title: 'Hernias',
                slug: 'hernias',
                nodes: [
                  'Inguinal hernia',
                  'Femoral hernia',
                  'Umbilical hernia',
                  'Incisional hernia',
                  'Obstruction & strangulation',
                ],
              },
              {
                title: 'Anorectal',
                slug: 'anorectal',
                nodes: ['Hemorrhoids', 'Anal fissure', 'Fistula-in-ano'],
              },
            ],
          },
          {
            title: 'Hepatobiliary & Pancreas',
            slug: 'hepatobiliary-and-pancreas',
            topics: [
              {
                title: 'Biliary',
                slug: 'biliary',
                nodes: ['Gallstones', 'Acute cholecystitis', 'Obstructive jaundice basics'],
              },
              {
                title: 'Pancreas',
                slug: 'pancreas',
                nodes: ['Acute pancreatitis', 'Pancreatic malignancy basics'],
              },
            ],
          },
          {
            title: 'Breast & Endocrine Surgery',
            slug: 'breast-and-endocrine-surgery',
            topics: [
              {
                title: 'Breast',
                slug: 'breast',
                nodes: [
                  'Breast lump approach',
                  'Fibroadenoma',
                  'Breast abscess',
                  'Breast carcinoma',
                ],
              },
              {
                title: 'Thyroid',
                slug: 'thyroid',
                nodes: [
                  'Goiter',
                  'Solitary thyroid nodule',
                  'Thyroid malignancy basics',
                  'Thyroidectomy complications basics',
                ],
              },
            ],
          },
          {
            title: 'Urology',
            slug: 'urology',
            topics: [
              {
                title: 'Urinary Stones',
                slug: 'urinary-stones',
                nodes: ['Renal calculus', 'Ureteric calculus'],
              },
              {
                title: 'Obstruction',
                slug: 'obstruction',
                nodes: ['BPH', 'Acute urinary retention', 'Chronic retention basics'],
              },
              {
                title: 'Other',
                slug: 'other',
                nodes: ['Hematuria approach basics', 'Urologic malignancy red flags basics'],
              },
            ],
          },
          {
            title: 'Vascular & Soft Tissue',
            slug: 'vascular-and-soft-tissue',
            topics: [
              {
                title: 'Vascular',
                slug: 'vascular',
                nodes: ['Varicose veins', 'DVT', 'Peripheral arterial disease basics'],
              },
              {
                title: 'Skin & Soft Tissue',
                slug: 'skin-and-soft-tissue',
                nodes: ['Lipoma', 'Epidermoid/sebaceous cyst', 'Abscess', 'Ulcer examination'],
              },
            ],
          },
          {
            title: 'Surgical Oncology & Skills',
            slug: 'surgical-oncology-and-skills',
            topics: [
              {
                title: 'Oncology',
                slug: 'oncology',
                nodes: ['Biopsy principles', 'Staging principles', 'Surgical margins basics'],
              },
              {
                title: 'Clinical Skills',
                slug: 'clinical-skills',
                nodes: [
                  'Lump examination',
                  'Ulcer examination',
                  'Hernia examination',
                  'Breast examination',
                  'Thyroid examination',
                  'Suturing',
                  'Aseptic technique',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 13,
        name: 'Obstetrics & Gynaecology',
        slug: 'obgyn',
        accent: 'fuchsia',
        sections: [
          {
            title: 'Normal Pregnancy & Antenatal Care',
            slug: 'normal-pregnancy-and-antenatal-care',
            topics: [
              {
                title: 'Pregnancy Physiology',
                slug: 'pregnancy-physiology',
                nodes: [
                  'Maternal physiological changes',
                  'Placental functions',
                  'Fetal growth basics',
                ],
              },
              {
                title: 'Antenatal Care',
                slug: 'antenatal-care',
                nodes: [
                  'Booking visit',
                  'Antenatal examination',
                  'Routine investigations',
                  'Gestational age',
                  'EDD',
                  'Fetal surveillance basics',
                ],
              },
            ],
          },
          {
            title: 'Normal & Abnormal Labour',
            slug: 'normal-and-abnormal-labour',
            topics: [
              {
                title: 'Normal Labour',
                slug: 'normal-labour',
                nodes: [
                  'Onset',
                  'Stages',
                  'Mechanism of labour basics',
                  'Partograph',
                  'Conduct of normal labour',
                ],
              },
              {
                title: 'Abnormal Labour',
                slug: 'abnormal-labour',
                nodes: [
                  'Prolonged labour',
                  'Obstructed labour basics',
                  'Malpresentation',
                  'Malposition basics',
                ],
              },
              {
                title: 'Operative Obstetrics',
                slug: 'operative-obstetrics',
                nodes: ['Cesarean section indications', 'Forceps basics', 'Vacuum basics'],
              },
            ],
          },
          {
            title: 'High-Risk Pregnancy',
            slug: 'high-risk-pregnancy',
            topics: [
              {
                title: 'Hypertensive Disorders',
                slug: 'hypertensive-disorders',
                nodes: [
                  'Gestational hypertension',
                  'Preeclampsia',
                  'Severe preeclampsia',
                  'Eclampsia',
                ],
              },
              {
                title: 'Hemorrhage',
                slug: 'hemorrhage',
                nodes: ['Placenta previa', 'Placental abruption', 'Postpartum hemorrhage'],
              },
              {
                title: 'Medical Disorders',
                slug: 'medical-disorders',
                nodes: [
                  'Gestational diabetes',
                  'Anemia in pregnancy',
                  'Heart disease in pregnancy basics',
                ],
              },
              {
                title: 'Other',
                slug: 'other',
                nodes: [
                  'Multiple pregnancy basics',
                  'Preterm labour basics',
                  'PROM basics',
                  'Fetal growth restriction basics',
                ],
              },
            ],
          },
          {
            title: 'Puerperium & Newborn',
            slug: 'puerperium-and-newborn',
            topics: [
              {
                title: 'Puerperium',
                slug: 'puerperium',
                nodes: ['Normal puerperium', 'Puerperal sepsis basics', 'Lactation'],
              },
              {
                title: 'Newborn',
                slug: 'newborn',
                nodes: ['Immediate newborn care', 'APGAR', 'Neonatal resuscitation basics'],
              },
            ],
          },
          {
            title: 'General Gynaecology',
            slug: 'general-gynaecology',
            topics: [
              {
                title: 'Menstrual Disorders',
                slug: 'menstrual-disorders',
                nodes: ['Amenorrhea basics', 'Abnormal uterine bleeding', 'Dysmenorrhea basics'],
              },
              {
                title: 'Infections',
                slug: 'infections',
                nodes: ['PID', 'Vaginal discharge approach basics'],
              },
              {
                title: 'Benign Disorders',
                slug: 'benign-disorders',
                nodes: ['Fibroid uterus', 'Endometriosis basics', 'Ovarian cysts'],
              },
            ],
          },
          {
            title: 'Gynaecologic Oncology',
            slug: 'gynaecologic-oncology',
            topics: [
              {
                title: 'Cervix',
                slug: 'cervix',
                nodes: [
                  'Cervical cancer risk factors',
                  'Screening',
                  'Clinical features',
                  'Management principles basics',
                ],
              },
              {
                title: 'Endometrium & Ovary',
                slug: 'endometrium-and-ovary',
                nodes: ['Endometrial cancer basics', 'Ovarian tumors basics'],
              },
            ],
          },
          {
            title: 'Reproductive Medicine & Family Planning',
            slug: 'reproductive-medicine-and-family-planning',
            topics: [
              {
                title: 'Infertility',
                slug: 'infertility',
                nodes: ['Male factor basics', 'Female factor basics', 'Basic evaluation'],
              },
              {
                title: 'Contraception',
                slug: 'contraception',
                nodes: [
                  'Barrier methods',
                  'Combined pills',
                  'Progestin-only methods',
                  'IUCD',
                  'Emergency contraception',
                  'Sterilization',
                ],
              },
            ],
          },
          {
            title: 'OBG Clinical Skills',
            slug: 'obg-clinical-skills',
            topics: [
              {
                title: 'Obstetric',
                slug: 'obstetric',
                nodes: [
                  'Antenatal examination',
                  'Fundal height',
                  'Fetal lie & presentation',
                  'Fetal heart rate',
                  'Partograph',
                ],
              },
              {
                title: 'Gynaecology',
                slug: 'gynaecology',
                nodes: [
                  'Pelvic examination principles',
                  'Speculum examination principles',
                  'Pap smear basics',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 14,
        name: 'Paediatrics',
        slug: 'paediatrics',
        accent: 'cyan',
        sections: [
          {
            title: 'Growth & Development',
            slug: 'growth-and-development',
            topics: [
              {
                title: 'Growth',
                slug: 'growth',
                nodes: [
                  'Weight',
                  'Length/height',
                  'Head circumference',
                  'Growth charts',
                  'Growth faltering',
                ],
              },
              {
                title: 'Development',
                slug: 'development',
                nodes: [
                  'Gross motor',
                  'Fine motor',
                  'Language',
                  'Social milestones',
                  'Developmental delay basics',
                ],
              },
            ],
          },
          {
            title: 'Neonatology',
            slug: 'neonatology',
            topics: [
              {
                title: 'Normal Newborn',
                slug: 'normal-newborn',
                nodes: ['Immediate care', 'APGAR', 'Thermal care', 'Breastfeeding initiation'],
              },
              {
                title: 'Common Problems',
                slug: 'common-problems',
                nodes: [
                  'Prematurity',
                  'Low birth weight',
                  'Neonatal jaundice',
                  'Neonatal sepsis',
                  'Birth asphyxia basics',
                ],
              },
            ],
          },
          {
            title: 'Nutrition',
            slug: 'nutrition',
            topics: [
              {
                title: 'Feeding',
                slug: 'feeding',
                nodes: ['Exclusive breastfeeding', 'Complementary feeding', 'IYCF principles'],
              },
              {
                title: 'Malnutrition',
                slug: 'malnutrition',
                nodes: ['SAM', 'MAM basics', 'Micronutrient deficiencies'],
              },
            ],
          },
          {
            title: 'Immunization & Infections',
            slug: 'immunization-and-infections',
            topics: [
              {
                title: 'Immunization',
                slug: 'immunization',
                nodes: [
                  'National Immunization Schedule',
                  'Catch-up principles basics',
                  'AEFI basics',
                ],
              },
              {
                title: 'Common Infections',
                slug: 'common-infections',
                nodes: ['ARI', 'Pneumonia', 'Diarrhea', 'Measles', 'Chickenpox', 'Mumps basics'],
              },
            ],
          },
          {
            title: 'Systemic Pediatrics',
            slug: 'systemic-pediatrics',
            topics: [
              {
                title: 'Respiratory',
                slug: 'respiratory',
                nodes: ['Bronchiolitis', 'Pneumonia', 'Childhood asthma'],
              },
              {
                title: 'Cardiovascular',
                slug: 'cardiovascular',
                nodes: ['VSD', 'ASD', 'PDA', 'Tetralogy of Fallot basics'],
              },
              {
                title: 'Renal',
                slug: 'renal',
                nodes: ['Nephrotic syndrome', 'UTI', 'Acute glomerulonephritis basics'],
              },
              {
                title: 'Hematology',
                slug: 'hematology',
                nodes: ['Nutritional anemia', 'Thalassemia basics', 'Bleeding disorders basics'],
              },
              {
                title: 'Neurology',
                slug: 'neurology',
                nodes: [
                  'Febrile seizure',
                  'Epilepsy basics',
                  'Cerebral palsy',
                  'Meningitis basics',
                ],
              },
            ],
          },
          {
            title: 'Pediatric Emergencies & Skills',
            slug: 'pediatric-emergencies-and-skills',
            topics: [
              {
                title: 'Emergencies',
                slug: 'emergencies',
                nodes: [
                  'Recognition of sick child',
                  'Dehydration',
                  'Shock basics',
                  'Seizure emergency basics',
                ],
              },
              {
                title: 'Skills',
                slug: 'skills',
                nodes: [
                  'Pediatric history',
                  'Growth plotting',
                  'Developmental assessment',
                  'General pediatric examination',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 15,
        name: 'Orthopaedics',
        slug: 'orthopaedics',
        accent: 'orange',
        sections: [
          {
            title: 'Fractures & Trauma Principles',
            slug: 'fractures-and-trauma-principles',
            topics: [
              {
                title: 'Fracture Basics',
                slug: 'fracture-basics',
                nodes: [
                  'Classification',
                  'Clinical features',
                  'X-ray principles',
                  'Fracture healing',
                  'Closed reduction basics',
                  'Immobilization basics',
                  'Open fracture basics',
                ],
              },
              {
                title: 'Complications',
                slug: 'complications',
                nodes: [
                  'Compartment syndrome',
                  'Fat embolism basics',
                  'Delayed union',
                  'Nonunion',
                  'Malunion',
                ],
              },
            ],
          },
          {
            title: 'Regional Trauma',
            slug: 'regional-trauma',
            topics: [
              {
                title: 'Upper Limb',
                slug: 'upper-limb',
                nodes: [
                  'Clavicle fracture',
                  'Shoulder dislocation',
                  'Supracondylar humerus fracture',
                  'Forearm fractures',
                  'Colles fracture',
                ],
              },
              {
                title: 'Lower Limb',
                slug: 'lower-limb',
                nodes: [
                  'Neck of femur fracture',
                  'Shaft femur fracture',
                  'Tibia fracture',
                  'Ankle injuries basics',
                ],
              },
              {
                title: 'Spine & Pelvis',
                slug: 'spine-and-pelvis',
                nodes: ['Spinal injury recognition', 'Pelvic fracture basics'],
              },
            ],
          },
          {
            title: 'Bone & Joint Infection',
            slug: 'bone-and-joint-infection',
            topics: [
              {
                title: 'Infection',
                slug: 'infection',
                nodes: [
                  'Acute osteomyelitis',
                  'Chronic osteomyelitis',
                  'Septic arthritis basics',
                  'Tuberculosis of spine',
                  'Tuberculosis of joint basics',
                ],
              },
            ],
          },
          {
            title: 'Degenerative & Inflammatory Joint Disease',
            slug: 'degenerative-and-inflammatory-joint-disease',
            topics: [
              {
                title: 'Arthritis',
                slug: 'arthritis',
                nodes: ['Osteoarthritis', 'Rheumatoid arthritis orthopedic aspects'],
              },
            ],
          },
          {
            title: 'Metabolic, Tumor & Pediatric Orthopaedics',
            slug: 'metabolic-tumor-and-pediatric-orthopaedics',
            topics: [
              {
                title: 'Metabolic',
                slug: 'metabolic',
                nodes: ['Rickets', 'Osteomalacia', 'Osteoporosis'],
              },
              {
                title: 'Tumors',
                slug: 'tumors',
                nodes: [
                  'Common benign bone tumors basics',
                  'Osteosarcoma basics',
                  'Ewing sarcoma basics',
                  'Giant cell tumor basics',
                ],
              },
              {
                title: 'Pediatric',
                slug: 'pediatric',
                nodes: ['CTEV', 'Developmental dysplasia of hip', 'Common deformities basics'],
              },
            ],
          },
          {
            title: 'Orthopaedic Skills',
            slug: 'orthopaedic-skills',
            topics: [
              {
                title: 'Examination',
                slug: 'examination',
                nodes: ['Gait', 'Joint examination', 'Limb examination', 'Neurovascular status'],
              },
              {
                title: 'Imaging',
                slug: 'imaging',
                nodes: ['Systematic fracture X-ray reading', 'Basic joint X-ray reading'],
              },
            ],
          },
        ],
      },
      {
        number: 16,
        name: 'Dermatology',
        slug: 'dermatology',
        accent: 'rose',
        sections: [
          {
            title: 'Approach to Skin Disease',
            slug: 'approach-to-skin-disease',
            topics: [
              {
                title: 'Skin Basics',
                slug: 'skin-basics',
                nodes: [
                  'Structure & function',
                  'History',
                  'Distribution',
                  'Primary lesions',
                  'Secondary lesions',
                ],
              },
            ],
          },
          {
            title: 'Infections & Infestations',
            slug: 'infections-and-infestations',
            topics: [
              {
                title: 'Bacterial',
                slug: 'bacterial',
                nodes: ['Impetigo', 'Folliculitis', 'Furuncle basics', 'Cellulitis'],
              },
              {
                title: 'Fungal',
                slug: 'fungal',
                nodes: ['Dermatophytosis', 'Candidiasis', 'Pityriasis versicolor basics'],
              },
              {
                title: 'Viral',
                slug: 'viral',
                nodes: ['Herpes simplex', 'Herpes zoster', 'Warts', 'Molluscum contagiosum'],
              },
              {
                title: 'Infestations',
                slug: 'infestations',
                nodes: ['Scabies', 'Pediculosis'],
              },
            ],
          },
          {
            title: 'Inflammatory Skin Disease',
            slug: 'inflammatory-skin-disease',
            topics: [
              {
                title: 'Dermatitis',
                slug: 'dermatitis',
                nodes: [
                  'Atopic dermatitis basics',
                  'Contact dermatitis',
                  'Seborrheic dermatitis basics',
                ],
              },
              {
                title: 'Papulosquamous',
                slug: 'papulosquamous',
                nodes: ['Psoriasis', 'Lichen planus basics'],
              },
              {
                title: 'Allergic',
                slug: 'allergic',
                nodes: [
                  'Urticaria',
                  'Drug eruptions',
                  'Severe cutaneous drug reaction recognition basics',
                ],
              },
            ],
          },
          {
            title: 'Pigmentary, Autoimmune & Other',
            slug: 'pigmentary-autoimmune-and-other',
            topics: [
              {
                title: 'Pigmentary',
                slug: 'pigmentary',
                nodes: ['Vitiligo', 'Common hyperpigmentation basics'],
              },
              {
                title: 'Vesiculobullous',
                slug: 'vesiculobullous',
                nodes: ['Pemphigus basics', 'Bullous pemphigoid basics'],
              },
              {
                title: 'Acne & Hair',
                slug: 'acne-and-hair',
                nodes: ['Acne vulgaris', 'Common alopecia basics'],
              },
            ],
          },
          {
            title: 'Leprosy & STIs',
            slug: 'leprosy-and-stis',
            topics: [
              {
                title: 'Leprosy',
                slug: 'leprosy',
                nodes: [
                  'Clinical classification basics',
                  'Peripheral nerve involvement',
                  'Reactions basics',
                  'MDT principles',
                ],
              },
              {
                title: 'STIs',
                slug: 'stis',
                nodes: [
                  'Syphilis',
                  'Gonorrhea basics',
                  'Genital herpes',
                  'Genital warts',
                  'Syndromic approach basics',
                ],
              },
            ],
          },
          {
            title: 'Dermatology Skills',
            slug: 'dermatology-skills',
            topics: [
              {
                title: 'Skills',
                slug: 'skills',
                nodes: [
                  'Describe a skin lesion',
                  'Skin examination',
                  'KOH mount basics',
                  'Tzanck smear basics',
                  'Sensory examination in leprosy',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 17,
        name: 'Psychiatry',
        slug: 'psychiatry',
        accent: 'violet',
        sections: [
          {
            title: 'Assessment & Foundations',
            slug: 'assessment-and-foundations',
            topics: [
              {
                title: 'Psychiatric Assessment',
                slug: 'psychiatric-assessment',
                nodes: [
                  'Psychiatric history',
                  'Mental status examination',
                  'Risk assessment',
                  'Basic classification principles',
                ],
              },
            ],
          },
          {
            title: 'Mood & Anxiety Disorders',
            slug: 'mood-and-anxiety-disorders',
            topics: [
              {
                title: 'Mood',
                slug: 'mood',
                nodes: ['Depressive disorder', 'Bipolar disorder', 'Mania'],
              },
              {
                title: 'Anxiety',
                slug: 'anxiety',
                nodes: [
                  'Generalized anxiety disorder',
                  'Panic disorder',
                  'Phobias',
                  'OCD basics',
                  'Stress-related disorders basics',
                ],
              },
            ],
          },
          {
            title: 'Psychotic Disorders',
            slug: 'psychotic-disorders',
            topics: [
              {
                title: 'Psychosis',
                slug: 'psychosis',
                nodes: ['Schizophrenia', 'Acute psychosis basics', 'Delusions', 'Hallucinations'],
              },
            ],
          },
          {
            title: 'Substance Use',
            slug: 'substance-use',
            topics: [
              {
                title: 'Substances',
                slug: 'substances',
                nodes: [
                  'Alcohol use disorder',
                  'Alcohol withdrawal',
                  'Tobacco dependence basics',
                  'Opioid use disorder basics',
                  'Other substances overview',
                ],
              },
            ],
          },
          {
            title: 'Organic, Child & Other Disorders',
            slug: 'organic-child-and-other-disorders',
            topics: [
              {
                title: 'Organic',
                slug: 'organic',
                nodes: ['Delirium', 'Dementia'],
              },
              {
                title: 'Somatic/Dissociative',
                slug: 'somatic-dissociative',
                nodes: ['Somatic symptom disorders basics', 'Dissociative disorders basics'],
              },
              {
                title: 'Child',
                slug: 'child',
                nodes: ['Intellectual disability basics', 'Autism spectrum basics', 'ADHD basics'],
              },
            ],
          },
          {
            title: 'Psychiatric Emergencies & Community',
            slug: 'psychiatric-emergencies-and-community',
            topics: [
              {
                title: 'Emergencies',
                slug: 'emergencies',
                nodes: ['Suicide risk', 'Acute agitation', 'Violence risk basics'],
              },
              {
                title: 'Community',
                slug: 'community',
                nodes: ['National Mental Health Programme', 'Basic rehabilitation principles'],
              },
            ],
          },
          {
            title: 'Psychiatry Skills',
            slug: 'psychiatry-skills',
            topics: [
              {
                title: 'Skills',
                slug: 'skills',
                nodes: [
                  'Mental status examination',
                  'Suicide risk assessment',
                  'Communication with psychiatric patient',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 18,
        name: 'Anaesthesiology',
        slug: 'anaesthesiology',
        accent: 'sky',
        sections: [
          {
            title: 'Preoperative & Basic Principles',
            slug: 'preoperative-and-basic-principles',
            topics: [
              {
                title: 'Preanaesthetic Assessment',
                slug: 'preanaesthetic-assessment',
                nodes: [
                  'History',
                  'Airway assessment',
                  'ASA physical status',
                  'Fasting principles',
                  'Premedication basics',
                ],
              },
              {
                title: 'Relevant Pharmacology',
                slug: 'relevant-pharmacology',
                nodes: [
                  'IV induction agents',
                  'Inhalational agents',
                  'Opioids',
                  'Muscle relaxants',
                  'Reversal agents basics',
                ],
              },
            ],
          },
          {
            title: 'Airway & General Anaesthesia',
            slug: 'airway-and-general-anaesthesia',
            topics: [
              {
                title: 'Airway',
                slug: 'airway',
                nodes: [
                  'Bag-mask ventilation',
                  'Oropharyngeal airway',
                  'Laryngoscopy basics',
                  'Endotracheal intubation principles',
                ],
              },
              {
                title: 'General Anaesthesia',
                slug: 'general-anaesthesia',
                nodes: ['Induction', 'Maintenance', 'Recovery', 'Common complications basics'],
              },
            ],
          },
          {
            title: 'Regional & Local Anaesthesia',
            slug: 'regional-and-local-anaesthesia',
            topics: [
              {
                title: 'Regional',
                slug: 'regional',
                nodes: [
                  'Spinal anaesthesia',
                  'Epidural anaesthesia',
                  'Peripheral nerve block concept',
                ],
              },
              {
                title: 'Local',
                slug: 'local',
                nodes: ['Local anaesthetic drugs', 'Local anaesthetic toxicity recognition basics'],
              },
            ],
          },
          {
            title: 'Monitoring & Perioperative Care',
            slug: 'monitoring-and-perioperative-care',
            topics: [
              {
                title: 'Monitoring',
                slug: 'monitoring',
                nodes: [
                  'Pulse oximetry',
                  'ECG',
                  'Blood pressure',
                  'Capnography basics',
                  'Temperature',
                ],
              },
              {
                title: 'Postoperative',
                slug: 'postoperative',
                nodes: [
                  'Recovery room basics',
                  'Postoperative nausea/vomiting basics',
                  'Postoperative pain',
                ],
              },
            ],
          },
          {
            title: 'Resuscitation & Critical Care',
            slug: 'resuscitation-and-critical-care',
            topics: [
              {
                title: 'Life Support',
                slug: 'life-support',
                nodes: ['BLS', 'CPR', 'AED', 'ALS principles basics'],
              },
              {
                title: 'Critical Care',
                slug: 'critical-care',
                nodes: [
                  'Oxygen therapy',
                  'Airway emergency recognition',
                  'Shock basics',
                  'Ventilation basics',
                ],
              },
            ],
          },
        ],
      },
      {
        number: 19,
        name: 'Radiodiagnosis',
        slug: 'radiodiagnosis',
        accent: 'slate',
        sections: [
          {
            title: 'Imaging Principles & Safety',
            slug: 'imaging-principles-and-safety',
            topics: [
              {
                title: 'Modalities',
                slug: 'modalities',
                nodes: ['Plain X-ray', 'Ultrasound', 'CT', 'MRI'],
              },
              {
                title: 'Safety',
                slug: 'safety',
                nodes: [
                  'Ionizing radiation',
                  'Radiation protection',
                  'Pregnancy considerations',
                  'Contrast precautions basics',
                ],
              },
            ],
          },
          {
            title: 'Chest Imaging',
            slug: 'chest-imaging',
            topics: [
              {
                title: 'Chest X-ray',
                slug: 'chest-x-ray',
                nodes: [
                  'Normal CXR approach',
                  'Consolidation',
                  'Pleural effusion',
                  'Pneumothorax',
                  'Tuberculosis patterns basics',
                  'Cardiomegaly basics',
                ],
              },
            ],
          },
          {
            title: 'Abdominal Imaging',
            slug: 'abdominal-imaging',
            topics: [
              {
                title: 'X-ray & Ultrasound',
                slug: 'x-ray-and-ultrasound',
                nodes: [
                  'Bowel obstruction',
                  'Pneumoperitoneum',
                  'Gallstones on USG basics',
                  'Renal stones basics',
                  'Hepatobiliary ultrasound basics',
                ],
              },
            ],
          },
          {
            title: 'Musculoskeletal Imaging',
            slug: 'musculoskeletal-imaging',
            topics: [
              {
                title: 'X-ray',
                slug: 'x-ray',
                nodes: ['Fracture', 'Dislocation', 'Basic bone lesion recognition'],
              },
            ],
          },
          {
            title: 'Neuroimaging',
            slug: 'neuroimaging',
            topics: [
              {
                title: 'CT/MRI',
                slug: 'ct-mri',
                nodes: [
                  'Ischemic stroke basics',
                  'Intracranial hemorrhage',
                  'Head injury basics',
                  'Mass lesion recognition basics',
                ],
              },
            ],
          },
          {
            title: 'Common Clinical Imaging & Skills',
            slug: 'common-clinical-imaging-and-skills',
            topics: [
              {
                title: 'Modality Selection',
                slug: 'modality-selection',
                nodes: ['Trauma', 'Acute abdomen', 'Stroke', 'Pregnancy basics'],
              },
              {
                title: 'Image Reading',
                slug: 'image-reading',
                nodes: [
                  'Systematic X-ray approach',
                  'Basic CT orientation',
                  'Basic MRI orientation',
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

/** Every subject slug, as a literal tuple, so slugs stay checkable at compile time. */
export const CURRICULUM_SUBJECT_SLUGS = [
  'anatomy',
  'physiology',
  'biochemistry',
  'pathology',
  'pharmacology',
  'microbiology',
  'forensic-medicine',
  'community-medicine',
  'ophthalmology',
  'ent',
  'general-medicine',
  'general-surgery',
  'obgyn',
  'paediatrics',
  'orthopaedics',
  'dermatology',
  'psychiatry',
  'anaesthesiology',
  'radiodiagnosis',
] as const;
