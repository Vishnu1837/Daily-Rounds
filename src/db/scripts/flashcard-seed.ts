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
];
