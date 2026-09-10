/**
 * Seed decks.
 *
 * Its own module rather than another block in `seed-data.ts`, which is already long enough
 * that finding anything in it is a scroll. The shape is the same as `QUIZ_BANK`: content
 * filed against a curriculum ref, reaching every student whose roadmap touches that branch.
 *
 * Written to exercise every card type the session screen can render, because the one thing
 * a seed for this feature has to prove is that seven interaction models really do share one
 * design — and that is only visible when a cloze card and a true/false card turn up two
 * cards apart in the same run. The content is genuine FMGE-level material rather than
 * filler, so the layouts are tested against the lengths they will actually meet: a
 * definition that fits on one line, and a concept question that does not.
 *
 * The six upper limb decks that follow the first three are a different kind of content and
 * are worth reading as such: they are an *ingested package*, fifty cards taken from a single
 * named textbook — Memorix Anatomy, 1st edition — and from no other source. Nothing in them
 * is recalled or inferred; each back face traces to a section of that book, and the block
 * comment above them lists which sections. Anyone revising a card should check it against
 * the same book rather than against a second one, because the value of a sourced package is
 * that a student who trusts the textbook can trust the deck without re-deriving it.
 */
export type SeedFlashcard = {
  type:
    'definition' | 'question' | 'cloze' | 'multiple_choice' | 'true_false' | 'image' | 'concept';
  front: string;
  back: string;
  explanation?: string;
  options?: string[];
  correctOption?: number;
};

export const FLASHCARD_DECKS: {
  subject: string;
  curriculumRef: string;
  title: string;
  description: string;
  cards: SeedFlashcard[];
}[] = [
  {
    subject: 'pathology',
    curriculumRef: 'pathology/general-pathology/inflammation',
    title: 'Acute Inflammation',
    description: 'The vascular and cellular events, in the order they happen.',
    cards: [
      {
        type: 'definition',
        front: 'Margination',
        back: 'Neutrophils leaving the central axial column to line the endothelium as blood flow slows.',
        explanation:
          'Stasis is what makes it possible — in fast laminar flow the cells stay central.',
      },
      {
        type: 'cloze',
        front: 'Rolling of neutrophils along the endothelium is mediated by ______.',
        back: 'selectins',
        explanation: 'Selectins roll, integrins stick. Firm adhesion is ICAM-1 binding LFA-1.',
      },
      {
        type: 'multiple_choice',
        front: 'Which vascular change occurs first in acute inflammation?',
        back: 'Transient vasoconstriction',
        options: [
          'Transient vasoconstriction',
          'Persistent vasodilatation',
          'Increased permeability',
          'Stasis of blood flow',
        ],
        correctOption: 0,
        explanation:
          'A brief arteriolar constriction precedes vasodilatation, which is why the initial blanching is transient.',
      },
      {
        type: 'true_false',
        front: 'Macrophages are the predominant cell in the first 24 hours of acute inflammation.',
        back: 'False — neutrophils dominate the first 24 hours.',
        options: ['True', 'False'],
        correctOption: 1,
        explanation: 'Macrophages take over from roughly 24 to 48 hours.',
      },
      {
        type: 'question',
        front: 'Which mediator is chiefly responsible for the pain of acute inflammation?',
        back: 'Bradykinin, with the prostaglandins',
        explanation: 'Histamine drives the vasodilatation; it is bradykinin and PGE2 that hurt.',
      },
      {
        type: 'concept',
        front: 'Why does an exudate carry a high protein content when a transudate does not?',
        back: 'An exudate is produced by increased vascular permeability; a transudate by a pressure imbalance across an intact wall.',
        explanation:
          'Endothelial gaps let albumin through. In a transudate the wall is competent, so only water and small solutes move.',
      },
    ],
  },
  {
    subject: 'pharmacology',
    curriculumRef: 'pharmacology/general-pharmacology/pharmacokinetics',
    title: 'Pharmacokinetics',
    description: 'What the body does to the drug — absorption through to clearance.',
    cards: [
      {
        type: 'definition',
        front: 'Bioavailability',
        back: 'The fraction of an administered dose that reaches the systemic circulation unchanged.',
        explanation:
          'By definition 100% for an intravenous dose — the reference every other route is measured against.',
      },
      {
        type: 'cloze',
        front: 'A drug obeying zero-order kinetics is eliminated at a ______ amount per unit time.',
        back: 'constant',
        explanation:
          'Phenytoin, ethanol, high-dose aspirin. The enzymes are saturated, so the rate cannot rise with concentration.',
      },
      {
        type: 'question',
        front: 'How many half-lives are needed to reach roughly 97% of steady state?',
        back: 'Five',
        explanation:
          'The same five explain washout: after stopping, about 97% of the drug is gone in five half-lives.',
      },
      {
        type: 'multiple_choice',
        front:
          'First-pass metabolism most reduces the bioavailability of a drug given by which route?',
        back: 'Oral',
        options: ['Oral', 'Sublingual', 'Rectal', 'Transdermal'],
        correctOption: 0,
        explanation:
          'Sublingual and transdermal drain into the systemic circulation and bypass the portal vein entirely.',
      },
      {
        type: 'true_false',
        front: 'Increasing plasma protein binding increases the volume of distribution.',
        back: 'False — it decreases it.',
        options: ['True', 'False'],
        correctOption: 1,
        explanation:
          'A drug held in plasma cannot distribute into tissue. Tissue binding is what raises Vd.',
      },
      {
        type: 'concept',
        front:
          'Why does a loading dose depend on volume of distribution, while a maintenance dose depends on clearance?',
        back: 'A loading dose fills a space; a maintenance dose replaces what is being removed from it.',
        explanation:
          'Loading dose = Vd × target concentration. Maintenance rate = clearance × target concentration.',
      },
    ],
  },
  {
    subject: 'physiology',
    curriculumRef: 'physiology/cardiovascular-system/cardiac-cycle',
    title: 'The Cardiac Cycle',
    description: 'Pressures, valves and sounds — and which of them causes which.',
    cards: [
      {
        type: 'definition',
        front: 'Isovolumetric contraction',
        back: 'The phase between mitral closure and aortic opening, when the ventricle tenses with every valve shut and its volume unchanged.',
        explanation:
          'Pressure rises steeply and no blood moves — which is exactly what "isovolumetric" is naming.',
      },
      {
        type: 'question',
        front: 'What causes the first heart sound?',
        back: 'Closure of the mitral and tricuspid valves',
        explanation: 'S2 is aortic and pulmonary closure. S1 opens systole; S2 closes it.',
      },
      {
        type: 'cloze',
        front: 'The ______ wave of the jugular venous pulse is caused by atrial contraction.',
        back: 'a',
        explanation:
          'It disappears in atrial fibrillation, and becomes a cannon wave in complete heart block.',
      },
      {
        type: 'multiple_choice',
        front: 'The dicrotic notch on the aortic pressure curve represents:',
        back: 'Aortic valve closure',
        options: [
          'Aortic valve closure',
          'Mitral valve opening',
          'Peak ventricular ejection',
          'Atrial systole',
        ],
        correctOption: 0,
        explanation:
          'A brief backflow snaps the cusps shut and rebounds against them — hence the notch and its recovery.',
      },
      {
        type: 'true_false',
        front: 'Ventricular filling is mostly passive.',
        back: 'True — roughly 80% is passive.',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'Atrial systole contributes the last fifth, which is why losing it matters most at high heart rates.',
      },
      {
        type: 'concept',
        front:
          'Why does a tachycardia compromise coronary perfusion before it compromises cardiac output?',
        back: 'Because diastole shortens far more than systole does, and the left ventricle is perfused in diastole.',
        explanation: 'Output can be defended by rate for a while. Coronary filling time cannot be.',
      },
    ],
  },
  /* ------------------------------------------------------------- upper limb
   *
   * Six decks, fifty cards, one region. Sourced end to end from Memorix Anatomy
   * (Hudák, Kachlík, Volný; 1st ed.) and from nothing else, so every back face can be
   * pointed at a section of one book: §5 Bones of the upper limb, §5 Joints of the upper
   * limb, §4.1–§4.2, §5.1 and §8 Muscles, §4.6/§4.8/§5.5 Heart and blood vessels,
   * §2.2 Brachial plexus, and §7 Topography of the upper limb.
   *
   * Split by curriculum topic rather than shipped as one deck of fifty, because the
   * scheduler works a deck at a time and a student revising for a wrist viva should not
   * have to wade through the clavicle to reach the carpal tunnel.
   */
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/upper-limb-osteology',
    title: 'Bones of the Upper Limb',
    description: 'Clavicle to phalanges — the markings, and what attaches to them.',
    cards: [
      {
        type: 'definition',
        front: 'Anatomical neck of the humerus',
        back: 'The groove distal to the head that gives attachment to the articular capsule of the shoulder joint.',
        explanation:
          'Not to be confused with the surgical neck below the tubercles, which is where the bone actually breaks.',
      },
      {
        type: 'question',
        front: 'Which three muscles insert on the greater tubercle of the humerus?',
        back: 'Supraspinatus, infraspinatus and teres minor',
        explanation:
          'Three of the four rotator cuff muscles. The fourth, subscapularis, goes to the lesser tubercle instead.',
      },
      {
        type: 'cloze',
        front:
          'The long head of the biceps brachii arises from the ______ tubercle of the scapula.',
        back: 'supraglenoid',
        explanation:
          'Just above the glenoid cavity — which is why its tendon has to travel through the joint to get out.',
      },
      {
        type: 'multiple_choice',
        front: 'The infraglenoid tubercle of the scapula gives origin to:',
        back: 'The long head of the triceps brachii',
        options: [
          'The long head of the triceps brachii',
          'The long head of the biceps brachii',
          'Teres minor',
          'The short head of the biceps brachii',
        ],
        correctOption: 0,
        explanation:
          'Supraglenoid above for the biceps, infraglenoid below for the triceps. The names give away the position.',
      },
      {
        type: 'true_false',
        front: 'The clavicle is the first bone in the body to begin ossifying.',
        back: 'True — and it does so by both intramembranous and endochondral ossification.',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'Two modes of ossification in one bone is unusual enough to be worth remembering on its own.',
      },
      {
        type: 'question',
        front: 'Which fossa on the humeral condyle receives the olecranon, and when does it do so?',
        back: 'The olecranon fossa, on the posterior surface, when the forearm is extended',
        explanation:
          'Anteriorly there are two: the coronoid fossa medially for the coronoid process and the radial fossa laterally for the head of the radius, both filled in flexion.',
      },
      {
        type: 'concept',
        front:
          'Why is a fracture of the surgical neck of the humerus a vascular problem as well as a bony one?',
        back: 'The anterior and posterior circumflex humeral arteries wrap around it, and injuring them can cause ischaemia and necrosis of the humeral head.',
        explanation:
          'The axillary nerve takes the same course to the posterior surgical neck, so the one fracture threatens the deltoid as well.',
      },
      {
        type: 'definition',
        front: 'Pisiform',
        back: 'A carpal bone of the proximal row that develops as a sesamoid bone within the tendon of the flexor carpi ulnaris.',
        explanation:
          'Which is why it takes the insertion of the flexor carpi ulnaris and gives origin to the abductor digiti minimi — it sits in a tendon rather than in the joint line.',
      },
      {
        type: 'multiple_choice',
        front: 'Ossification of the carpal bones proceeds in a circle, beginning with which bone?',
        back: 'The capitate',
        options: ['The capitate', 'The scaphoid', 'The lunate', 'The hamate'],
        correctOption: 0,
        explanation: 'The sequence is used as an X-ray marker of bone age in children.',
      },
    ],
  },
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/pectoral-region-and-axilla',
    title: 'Pectoral Region & Axilla',
    description: 'The pyramid under the shoulder, and everything routed through it.',
    cards: [
      {
        type: 'question',
        front: 'How is the axillary artery divided into three parts?',
        back: 'By the pectoralis minor — into suprapectoral, retropectoral and infrapectoral parts',
        explanation:
          'The muscle is the landmark, not the ribs. Everything in the axilla is described against it.',
      },
      {
        type: 'cloze',
        front:
          'The subclavian artery becomes the axillary artery as it crosses the lateral margin of the ______ rib.',
        back: '1st',
        explanation:
          'It ends at the level of the surgical neck of the humerus, below the pectoralis minor, where it continues as the brachial artery.',
      },
      {
        type: 'definition',
        front: 'Serratus anterior',
        back: 'A muscle running from the 1st–9th ribs to the medial border of the scapula, innervated by the long thoracic nerve, which protracts the scapula and holds it against the thoracic wall.',
        explanation:
          'It also rotates the scapula externally to raise the arm above the horizontal — the synergist of the trapezius in that movement.',
      },
      {
        type: 'multiple_choice',
        front: 'The pectoralis minor inserts on:',
        back: 'The coracoid process of the scapula',
        options: [
          'The coracoid process of the scapula',
          'The crest of the greater tubercle',
          'The acromion',
          'The crest of the lesser tubercle',
        ],
        correctOption: 0,
        explanation:
          'From the 3rd–5th ribs to the coracoid process, which is how it protracts and depresses the scapula.',
      },
      {
        type: 'true_false',
        front:
          'The cords of the brachial plexus are named for their position relative to the axillary artery.',
        back: 'True',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'Lateral, medial and posterior are positions around that vessel — which is why the cords are described in the axilla and not in the neck.',
      },
      {
        type: 'question',
        front: 'Which roots form each of the three trunks of the brachial plexus?',
        back: 'Superior trunk C4–C6, middle trunk C7, inferior trunk C8–T1',
        explanation:
          'The plexus is C5–C8 with contributions from C4 and T1. The clavicle divides it topographically into supraclavicular and infraclavicular parts.',
      },
      {
        type: 'concept',
        front: 'How do the six divisions of the brachial plexus become three cords?',
        back: 'The three posterior divisions form the posterior cord, two anterior divisions form the lateral cord, and one anterior division forms the medial cord.',
        explanation:
          'Posterior divisions carry the extensors, which is why the posterior cord is the one that ends as the axillary and radial nerves.',
      },
      {
        type: 'definition',
        front: "Erb's point (punctum supraclaviculare)",
        back: 'A point 2–3 cm above the junction of the middle and lateral thirds of the clavicle, anterior to vertebra C6 and lateral to the sternocleidomastoid.',
        explanation: 'Hypersensitivity here indicates damage to the brachial plexus.',
      },
      {
        type: 'question',
        front: 'What forms the anterior, posterior and medial walls of the axilla?',
        back: 'Anterior: pectoralis major and minor. Posterior: scapula with subscapularis, latissimus dorsi and teres major. Medial: thoracic wall and serratus anterior.',
        explanation:
          'The axilla is a quadrilateral pyramid whose apex is the glenohumeral joint; laterally it is the humerus with coracobrachialis, biceps brachii and the long head of triceps.',
      },
    ],
  },
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/back-and-scapular-region',
    title: 'Back & Scapular Region',
    description: 'The muscles that move the scapula, and the nerves that reach them.',
    cards: [
      {
        type: 'definition',
        front: 'Spinohumeral muscles',
        back: 'The first and most superficial layer of the back muscles — the trapezius and the latissimus dorsi — which arise from the spine and insert on the upper limb.',
        explanation:
          'The second layer is spinoscapular: rhomboid major, rhomboid minor and levator scapulae.',
      },
      {
        type: 'question',
        front: 'What innervates the trapezius?',
        back: 'The accessory nerve (CN XI), with the anterior rami of C3–C4',
        explanation:
          'A cranial nerve supplying a muscle of the back, which is why the trapezius is tested in a cranial nerve examination.',
      },
      {
        type: 'cloze',
        front: 'The latissimus dorsi inserts on the crest of the ______ tubercle of the humerus.',
        back: 'lesser',
        explanation:
          'It shares that crest with teres major — and both accordingly adduct and internally rotate the arm.',
      },
      {
        type: 'multiple_choice',
        front: 'The rhomboid major and minor are innervated by:',
        back: 'The dorsal scapular nerve',
        options: [
          'The dorsal scapular nerve',
          'The thoracodorsal nerve',
          'The long thoracic nerve',
          'The accessory nerve',
        ],
        correctOption: 0,
        explanation:
          'The thoracodorsal nerve supplies the latissimus dorsi and the long thoracic the serratus anterior — three nerves for three neighbours.',
      },
      {
        type: 'true_false',
        front: 'The levator scapulae inserts on the superior angle of the scapula.',
        back: 'True',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'From the transverse processes of C1–C4 to the superior angle and the upper medial border. It is an upper scapular fixator.',
      },
      {
        type: 'concept',
        front:
          'Why does raising the arm above the horizontal need the trapezius and serratus anterior acting together?',
        back: 'Because the arm can only clear the horizontal if the scapula rotates externally, and that rotation takes the ascending and descending parts of the trapezius pulling with the serratus anterior.',
        explanation:
          'The glenohumeral joint cannot supply it alone — abduction past 90° is blocked by the greater tubercle meeting the fornix humeri.',
      },
    ],
  },
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/shoulder-and-arm',
    title: 'Shoulder & Arm',
    description: 'The most mobile joint in the body, and the muscles that pay for it.',
    cards: [
      {
        type: 'definition',
        front: 'Rotator cuff',
        back: 'Supraspinatus, infraspinatus, teres minor and subscapularis — the four muscles that rotate the humerus and hold its head in the articular fossa.',
        explanation:
          'The glenohumeral joint is a shallow fossa under a large head; the cuff is what compensates for that incongruity.',
      },
      {
        type: 'question',
        front: 'Which nerve supplies the deltoid, and which part of the muscle abducts the arm?',
        back: 'The axillary nerve (C5–C6); the acromial part abducts',
        explanation:
          'The spinal part extends and externally rotates, the clavicular part flexes and internally rotates — and the muscle as a whole presses the head into the fossa.',
      },
      {
        type: 'multiple_choice',
        front: 'The subscapularis inserts on:',
        back: 'The lesser tubercle of the humerus',
        options: [
          'The lesser tubercle of the humerus',
          'The greater tubercle of the humerus',
          'The deltoid tuberosity',
          'The coracoid process',
        ],
        correctOption: 0,
        explanation:
          'It is the one cuff muscle on the costal surface of the scapula, and the one that internally rotates.',
      },
      {
        type: 'cloze',
        front: 'The articular fossa of the shoulder joint is the ______ cavity of the scapula.',
        back: 'glenoid',
        explanation:
          'Deepened a little by a cartilaginous glenoid labrum, but still shallow enough that the joint depends on muscle for its stability.',
      },
      {
        type: 'true_false',
        front:
          'The tendon of the long head of the biceps brachii is the only tendon in the body that runs inside a joint.',
        back: 'True',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'It is covered by synovial membrane within the joint, and by a synovial sheath in the intertubercular groove once it leaves.',
      },
      {
        type: 'question',
        front:
          'Where do the two heads of the biceps brachii arise, and where does the muscle insert?',
        back: 'Long head from the supraglenoid tubercle, short head from the coracoid process; insertion on the radial tuberosity and, through the bicipital aponeurosis, into the antebrachial fascia.',
        explanation:
          'Musculocutaneous nerve, C5–C6. It flexes the elbow only when the forearm is supinated.',
      },
      {
        type: 'definition',
        front: 'The three heads of the triceps brachii',
        back: 'Long head from the infraglenoid tubercle of the scapula; lateral head from the humerus proximal to the radial groove; medial head from the humerus distal to it.',
        explanation:
          'The radial groove is the landmark separating the two humeral heads — and the radial nerve is lying in it.',
      },
      {
        type: 'concept',
        front: 'Why can the arm not be abducted beyond 90° without the scapula rotating?',
        back: 'Because the greater tubercle comes into contact with the fornix humeri — the fibrous arch formed above the joint by the coracoacromial ligament.',
        explanation:
          'Further abduction is possible only with concomitant external rotation of the scapula, which moves the arch out of the way.',
      },
      {
        type: 'multiple_choice',
        front: 'In the radial canal on the posterior humerus, the radial nerve travels with:',
        back: 'The deep brachial artery and veins',
        options: [
          'The deep brachial artery and veins',
          'The posterior circumflex humeral artery',
          'The superior collateral ulnar artery',
          'The brachial artery itself',
        ],
        correctOption: 0,
        explanation:
          'The superior collateral ulnar vessels accompany the ulnar nerve instead, and the posterior circumflex humeral artery goes with the axillary nerve.',
      },
    ],
  },
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/forearm-and-elbow',
    title: 'Forearm & Elbow',
    description: 'Three joints in one capsule, and three canals that decide what goes numb.',
    cards: [
      {
        type: 'question',
        front: 'Which three simple joints make up the elbow joint?',
        back: 'The humero-ulnar (trochlear), the humeroradial (ball-and-socket) and the proximal radio-ulnar (pivot) joints',
        explanation:
          'A compound synovial joint: biaxial overall, allowing flexion and extension and — with the distal radio-ulnar joint — pronation and supination.',
      },
      {
        type: 'cloze',
        front:
          'The median nerve leaves the cubital fossa through the pronator canal, between the two heads of the ______.',
        back: 'pronator teres',
        explanation:
          'It then passes between the two heads of the flexor digitorum superficialis, and runs on between that muscle and the flexor digitorum profundus.',
      },
      {
        type: 'definition',
        front: 'Cubital canal',
        back: 'The space between the humeral and ulnar heads of the flexor carpi ulnaris, containing the ulnar nerve.',
        explanation:
          'Together with the groove behind the medial epicondyle, it is where the ulnar nerve is most commonly entrapped.',
      },
      {
        type: 'multiple_choice',
        front: 'The supinator canal, between the two layers of the supinator, transmits:',
        back: 'The deep branch of the radial nerve',
        options: [
          'The deep branch of the radial nerve',
          'The superficial branch of the radial nerve',
          'The median nerve',
          'The anterior interosseous nerve',
        ],
        correctOption: 0,
        explanation:
          'Its entrance is usually the arcade of Frohse, which is why the deep branch has an entrapment syndrome of its own.',
      },
      {
        type: 'true_false',
        front:
          'Every muscle of the posterior group of the forearm is supplied by the radial nerve.',
        back: 'True',
        options: ['True', 'False'],
        correctOption: 0,
        explanation:
          'The lateral group is radial too. It is the anterior group that is predominantly median, with the flexor carpi ulnaris and part of the flexor digitorum profundus taken by the ulnar nerve.',
      },
      {
        type: 'question',
        front:
          'Reading mediolaterally, what lies just lateral to the medial epicondyle at the elbow?',
        back: 'Median nerve, brachial artery, biceps brachii tendon — MAT',
        explanation:
          'The ulnar nerve is the one that has already left, piercing the medial intermuscular septum to pass behind the epicondyle.',
      },
      {
        type: 'definition',
        front: 'Brachioradialis',
        back: 'Runs from the lateral supraepicondylar ridge of the humerus to the suprastyloid crest of the radius; flexes the forearm, supinates it when extended and pronates it when flexed. Radial nerve, C5–C6.',
        explanation:
          'A flexor of the elbow innervated by the nerve of the extensors — the exception worth naming.',
      },
      {
        type: 'concept',
        front: 'Why is the anterior forearm group not simply "the median nerve group"?',
        back: 'Because the flexor carpi ulnaris and part of the flexor digitorum profundus are supplied by the ulnar nerve, even though the rest of the group is median.',
        explanation:
          'It is why a median nerve lesion leaves ulnar deviation of the wrist and flexion of the 4th and 5th fingers intact.',
      },
      {
        type: 'multiple_choice',
        front: 'The ulnar artery reaches the palm through:',
        back: "The ulnar canal (Guyon's canal), alongside the ulnar nerve",
        options: [
          "The ulnar canal (Guyon's canal), alongside the ulnar nerve",
          'The carpal tunnel, alongside the median nerve',
          'The anatomical snuffbox',
          'The first interdigital space',
        ],
        correctOption: 0,
        explanation:
          'Neither the radial nor the ulnar artery passes through the carpal tunnel. The radial artery reaches the palm through the first interdigital space.',
      },
    ],
  },
  {
    subject: 'anatomy',
    curriculumRef: 'anatomy/upper-limb/wrist-and-hand',
    title: 'Wrist & Hand',
    description: 'The tunnel, the arches, and the two nerves that divide the palm between them.',
    cards: [
      {
        type: 'question',
        front: 'What forms the walls of the carpal tunnel, and what passes through it?',
        back: 'The carpal bones dorsally and the flexor retinaculum in front; through it pass the median nerve, the tendon of flexor pollicis longus, and the tendons of flexor digitorum superficialis and profundus.',
        explanation:
          'The walls cannot expand, which is why it is the median nerve that suffers — carpal tunnel syndrome is the commonest entrapment syndrome there is.',
      },
      {
        type: 'cloze',
        front: 'The most superficial structure within the carpal tunnel is the ______.',
        back: 'median nerve',
        explanation:
          'The tendons of the flexor digitorum profundus pass beneath it as it enters — which is the anatomy behind its vulnerability.',
      },
      {
        type: 'true_false',
        front: 'The ulnar nerve and ulnar artery reach the palm through the carpal tunnel.',
        back: "False — they travel through the ulnar canal (Guyon's canal) instead.",
        options: ['True', 'False'],
        correctOption: 1,
        explanation:
          'It is why releasing the flexor retinaculum does nothing for an ulnar nerve lesion, and why carpal tunnel syndrome spares the little finger.',
      },
      {
        type: 'multiple_choice',
        front: 'The superficial palmar arch is supplied mainly by:',
        back: 'The ulnar artery',
        options: [
          'The ulnar artery',
          'The radial artery',
          'The anterior interosseous artery',
          'The first palmar metacarpal artery',
        ],
        correctOption: 0,
        explanation:
          'And the deep palmar arch mainly by the radial — superficial ulnar, deep radial.',
      },
      {
        type: 'definition',
        front: 'The thenar muscles',
        back: 'Abductor pollicis brevis, opponens pollicis, flexor pollicis brevis and adductor pollicis — the four muscles of the thumb group.',
        explanation:
          'The median nerve takes abductor pollicis brevis, opponens pollicis and the superficial head of flexor pollicis brevis; the ulnar takes adductor pollicis and the deep head. The tendon of flexor pollicis longus is the border between the two territories.',
      },
      {
        type: 'question',
        front: 'What do the palmar and dorsal interossei do, and about which axis?',
        back: 'The palmar interossei draw the fingers towards, and the dorsal interossei away from, an axis running through the centre of the 3rd finger.',
        explanation:
          'Three palmar, four dorsal, all of them ulnar nerve (C8–T1). Both groups also flex at the metacarpophalangeal joints and extend at the interphalangeal joints.',
      },
      {
        type: 'concept',
        front:
          'Why do the lumbricals and interossei flex the metacarpophalangeal joints but extend the interphalangeal ones?',
        back: 'Because they pass in front of the metacarpophalangeal joint but insert into the dorsal aponeurosis, which runs behind the interphalangeal joints.',
        explanation:
          'One muscle, two sides of two axes. The extensor digitorum, extensor indicis, extensor digiti minimi and interossei all reach the phalanges through that same aponeurosis.',
      },
      {
        type: 'definition',
        front: 'Radial foveola (the anatomical snuffbox)',
        back: 'The hollow on the lateral wrist bounded by the tendons of abductor pollicis longus and extensor pollicis brevis in front and extensor pollicis longus behind, in which the radial artery is palpable.',
        explanation:
          'The artery lies deep in the floor; the branches of the superficial radial nerve cross more superficially, over the tendons.',
      },
    ],
  },
];
