import json

data = json.load(open('curriculum.json', encoding='utf-8'))

BS = chr(92)
QT = chr(39)


def q(s):
    return QT + s.replace(BS, BS + BS).replace(QT, BS + QT) + QT


out = []
w = out.append
w("""/**
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

export const CURRICULUM: CurriculumPhase[] = [""")
for p in data:
    w('  {')
    w('    id: %s,' % q(p['id']))
    w('    label: %s,' % q(p['label']))
    w('    title: %s,' % q(p['title']))
    w('    subjects: [')
    for sub in p['subjects']:
        w('      {')
        w('        number: %d,' % sub['number'])
        w('        name: %s,' % q(sub['name']))
        w('        slug: %s,' % q(sub['slug']))
        w('        accent: %s,' % q(sub['accent']))
        w('        sections: [')
        for sec in sub['sections']:
            w('          {')
            w('            title: %s,' % q(sec['title']))
            w('            slug: %s,' % q(sec['slug']))
            w('            topics: [')
            for t in sec['topics']:
                w('              {')
                w('                title: %s,' % q(t['title']))
                w('                slug: %s,' % q(t['slug']))
                if t['nodes']:
                    w('                nodes: [')
                    for n in t['nodes']:
                        w('                  %s,' % q(n))
                    w('                ],')
                else:
                    w('                nodes: [],')
                w('              },')
            w('            ],')
            w('          },')
        w('        ],')
        w('      },')
    w('    ],')
    w('  },')
w('];')
w('')
w('/** Every subject slug, as a literal tuple, so slugs stay checkable at compile time. */')
w('export const CURRICULUM_SUBJECT_SLUGS = [')
for p in data:
    for sub in p['subjects']:
        w('  %s,' % q(sub['slug']))
w('] as const;')
w('')
open('data.ts', 'w', encoding='utf-8').write('\n'.join(out))
print('lines', len(out))
