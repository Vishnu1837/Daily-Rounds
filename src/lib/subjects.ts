/** The subject catalogue seeded into every environment. */
export const SUBJECTS = [
  { name: 'Pathology', slug: 'pathology', accent: 'violet' },
  { name: 'Pharmacology', slug: 'pharmacology', accent: 'emerald' },
  { name: 'Anatomy', slug: 'anatomy', accent: 'rose' },
  { name: 'Physiology', slug: 'physiology', accent: 'sky' },
  { name: 'Biochemistry', slug: 'biochemistry', accent: 'amber' },
  { name: 'Microbiology', slug: 'microbiology', accent: 'teal' },
  { name: 'Forensic Medicine', slug: 'forensic-medicine', accent: 'slate' },
  { name: 'Community Medicine', slug: 'community-medicine', accent: 'lime' },
  { name: 'General Medicine', slug: 'general-medicine', accent: 'indigo' },
  { name: 'General Surgery', slug: 'general-surgery', accent: 'orange' },
  { name: 'Obstetrics & Gynaecology', slug: 'obgyn', accent: 'fuchsia' },
  { name: 'Paediatrics', slug: 'paediatrics', accent: 'cyan' },
] as const;

export type SubjectSlug = (typeof SUBJECTS)[number]['slug'];
