# 자동 대조 결과(report.json) + 문장 근처 일치 등급(strength.json) + 사람 검토 결과(scripts/verify-manual.json)를 합쳐
# 앱용 검증 기록을 만든다.
# 사용: python -I scripts/verify_build.py verify-cache scripts/verify-manual.json src/content/verification.json
#  사실 상태: manual(사람이 출처 본문을 읽고 확인) > auto/term(핵심어와 나머지 내용이 같은 문장 근처에서 자동 일치)
#            > unconfirmed(근거 없음, 또는 핵심어만 맞은 '약한 자동 확인'을 아직 사람이 읽지 않음)
import json, os, re, sys, datetime

cache, manual_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
report = json.load(open(f'{cache}/report.json', encoding='utf-8'))
mapping = json.load(open(f'{cache}/map.json', encoding='utf-8'))
sp = f'{cache}/strength.json'
strength = json.load(open(sp, encoding='utf-8')) if os.path.exists(sp) else {}
try:
    manual = json.load(open(manual_path, encoding='utf-8'))
except FileNotFoundError:
    manual = {}
# manual 형식: { "facts": { factId: "manual 근거 설명" }, "years": { conceptId: "근거" }, "notes": { conceptId: "메모" },
#               "extraSources": { conceptId: [{"title":..,"id":"E00.."} | {"title":..,"url":"https://contents.history.go.kr/id/.."}] } }
mf = manual.get('facts', {})
rv = manual.get('reviewed', {})  # 약한 자동 확인을 사람이 읽고 판단한 결과
my = manual.get('years', {})
mn = manual.get('notes', {})  # 확인하지 못한 사실에 대한 설명(앱에 메모로 표시)
extra = manual.get('extraSources', {})
today = datetime.date.today().isoformat()
BASE = 'https://encykorea.aks.ac.kr/Article/'
TITLES = {}  # 백과사전 Article ID -> 표제어(대조에 쓴 항목들)
for r in report.values():
    for a in r['articles']:
        TITLES[a['id']] = a['title']
for mp in mapping.values():
    for t in (mp.get('terms') or {}).values():
        TITLES.setdefault(t['id'], t['title'])
for es in extra.values():
    for e in es:
        if e.get('id'):
            TITLES.setdefault(e['id'], e['title'])

out = {}
stats = {'verified': 0, 'partial': 0, 'none': 0}
for cid, r in report.items():
    srcs = []
    if r['article']:
        srcs.append({'title': r['article']['title'], 'url': BASE + r['article']['id']})
    facts = {}
    strong = lambda f: f['ok'] and strength.get(f['id'], {}).get('grade', 'strong') == 'strong'
    for f in r['facts']:
        if f['id'] in rv or f['id'] in mf:
            facts[f['id']] = 'manual'
        elif strong(f):
            facts[f['id']] = 'term' if '항목에' in f['how'] else 'auto'
        else:
            facts[f['id']] = 'unconfirmed'
    # 역대조에 쓴 핵심어 항목도 출처로 표시
    used_terms = {f['id'] for f in r['facts'] if strong(f) and '항목에' in f['how'] and facts[f['id']] != 'manual'}
    for fid, t in (mapping.get(cid, {}).get('terms') or {}).items():
        if fid in used_terms and all(s['url'] != BASE + t['id'] for s in srcs):
            srcs.append({'title': t['title'], 'url': BASE + t['id']})
    for e in extra.get(cid, []):
        # 백과사전 항목은 id, 그 밖의 출처(우리역사넷 등)는 전체 url
        url = e.get('url') or BASE + e['id']
        if all(s['url'] != url for s in srcs):
            srcs.append({'title': e['title'], 'url': url})
    # 사람이 확인한 근거에 적힌 백과사전 항목도 출처로 표시(같은 개념의 보조 항목에서 확인한 경우)
    for fid, st in facts.items():
        if st != 'manual':
            continue
        for aid in re.findall(r'E\d{7}', mf.get(fid, '') + ' ' + rv.get(fid, '')):
            url = BASE + aid
            if aid in TITLES and all(s['url'] != url for s in srcs):
                srcs.append({'title': TITLES[aid], 'url': url})
    years_ok = not r['yearsMissing'] or cid in my
    confirmed = sum(1 for v in facts.values() if v != 'unconfirmed')
    if not srcs or confirmed == 0:
        stats['none'] += 1
        continue
    status = 'verified' if confirmed == len(facts) and years_ok else 'partial'
    stats[status] += 1
    rec = {'status': status, 'checkedAt': today, 'sources': srcs, 'facts': facts, 'yearsOk': years_ok}
    note = ' / '.join(x for x in (my.get(cid), mn.get(cid)) if x)
    if note:
        rec['note'] = note
    out[cid] = rec

json.dump(out, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(stats)
