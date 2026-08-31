import re, json

lines = open('roadmap-source.txt', encoding='utf-8').read().split('\n')
ARROW = '\u2192'
STOP = 'Developer Data Model'

# Canonical app-facing subject naming + slug + accent, keyed by doc heading.
SUBJECT_META = {
    'ANATOMY': ('Anatomy', 'anatomy', 'rose'),
    'PHYSIOLOGY': ('Physiology', 'physiology', 'sky'),
    'BIOCHEMISTRY': ('Biochemistry', 'biochemistry', 'amber'),
    'PATHOLOGY': ('Pathology', 'pathology', 'violet'),
    'PHARMACOLOGY': ('Pharmacology', 'pharmacology', 'emerald'),
    'MICROBIOLOGY': ('Microbiology', 'microbiology', 'teal'),
    'FORENSIC MEDICINE & TOXICOLOGY': ('Forensic Medicine', 'forensic-medicine', 'slate'),
    'COMMUNITY MEDICINE': ('Community Medicine', 'community-medicine', 'lime'),
    'OPHTHALMOLOGY': ('Ophthalmology', 'ophthalmology', 'cyan'),
    'ENT / OTORHINOLARYNGOLOGY': ('ENT', 'ent', 'teal'),
    'GENERAL MEDICINE': ('General Medicine', 'general-medicine', 'indigo'),
    'GENERAL SURGERY': ('General Surgery', 'general-surgery', 'orange'),
    'OBSTETRICS & GYNAECOLOGY': ('Obstetrics & Gynaecology', 'obgyn', 'fuchsia'),
    'PEDIATRICS': ('Paediatrics', 'paediatrics', 'cyan'),
    'ORTHOPAEDICS': ('Orthopaedics', 'orthopaedics', 'orange'),
    'DERMATOLOGY, VENEREOLOGY & LEPROSY': ('Dermatology', 'dermatology', 'rose'),
    'PSYCHIATRY': ('Psychiatry', 'psychiatry', 'violet'),
    'ANAESTHESIOLOGY': ('Anaesthesiology', 'anaesthesiology', 'sky'),
    'RADIODIAGNOSIS': ('Radiodiagnosis', 'radiodiagnosis', 'slate'),
}
PHASE_META = {
    'PHASE I': ('phase-1', 'Phase I', 'First Professional MBBS'),
    'PHASE II': ('phase-2', 'Phase II', 'Second Professional MBBS'),
    'PHASE III PART I': ('phase-3a', 'Phase III · Part I', 'Third Professional MBBS Part I'),
    'PHASE III PART II': ('phase-3b', 'Phase III · Part II', 'Final Professional MBBS'),
}

def slugify(s):
    s = s.lower().replace('&', ' and ')
    s = re.sub(r"[^a-z0-9]+", '-', s).strip('-')
    return s

phases, cur_phase, cur_subject, cur_section = [], None, None, None
for raw in lines:
    s = raw.strip()
    if not s:
        continue
    if s.startswith(STOP):
        break
    if s.startswith('PHASE '):
        head = s.split('\u2014')[0].strip()
        key = next(k for k in sorted(PHASE_META, key=len, reverse=True) if head.startswith(k))
        pid, label, full = PHASE_META[key]
        cur_phase = {'id': pid, 'label': label, 'title': full, 'subjects': []}
        phases.append(cur_phase); cur_subject = cur_section = None
        continue
    m = re.match(r'^(\d{2})\.\s+(.+)$', s)
    if m and cur_phase is not None:
        name, slug, accent = SUBJECT_META[m.group(2).strip()]
        cur_subject = {'number': int(m.group(1)), 'name': name, 'slug': slug,
                       'accent': accent, 'sections': []}
        cur_phase['subjects'].append(cur_subject); cur_section = None
        continue
    if cur_subject is None:
        continue  # preamble
    if ARROW in s:
        parts = [p.strip() for p in s.split(ARROW) if p.strip()]
        assert len(parts) >= 3, s
        section, topic, nodes = parts[1], parts[2], parts[3:]
        if cur_section is None or cur_section['title'] != section:
            cur_section = next((x for x in cur_subject['sections'] if x['title'] == section), None)
            if cur_section is None:
                cur_section = {'title': section, 'slug': slugify(section), 'topics': []}
                cur_subject['sections'].append(cur_section)
        cur_section['topics'].append({'title': topic, 'slug': slugify(topic), 'nodes': nodes})
    else:
        cur_section = next((x for x in cur_subject['sections'] if x['title'] == s), None)
        if cur_section is None:
            cur_section = {'title': s, 'slug': slugify(s), 'topics': []}
            cur_subject['sections'].append(cur_section)

# drop headings that never received topics
for p in phases:
    for sub in p['subjects']:
        sub['sections'] = [x for x in sub['sections'] if x['topics']]

# integrity checks
slugs = [sub['slug'] for p in phases for sub in p['subjects']]
assert len(slugs) == len(set(slugs)) == 19, slugs
for p in phases:
    for sub in p['subjects']:
        ss = [x['slug'] for x in sub['sections']]
        assert len(ss) == len(set(ss)), (sub['slug'], ss)
        for sec in sub['sections']:
            ts = [t['slug'] for t in sec['topics']]
            assert len(ts) == len(set(ts)), (sub['slug'], sec['slug'], ts)

json.dump(phases, open('curriculum.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
nsec = sum(len(x['sections']) for p in phases for x in p['subjects'])
nt = sum(len(sec['topics']) for p in phases for x in p['subjects'] for sec in x['sections'])
nn = sum(len(t['nodes']) for p in phases for x in p['subjects'] for sec in x['sections'] for t in sec['topics'])
print('phases', len(phases), 'subjects', len(slugs), 'sections', nsec, 'topics', nt, 'nodes', nn)
for p in phases:
    print(' ', p['label'], '::', ', '.join(f"{x['slug']}({len(x['sections'])})" for x in p['subjects']))
