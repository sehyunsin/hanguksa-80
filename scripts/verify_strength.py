# 자동 확인된 사실이 '핵심어만' 맞은 것인지, 같은 문장 근처에서 나머지 내용까지 맞는지 가려낸다.
# 사용: python -I scripts/verify_strength.py verify-cache
# 출력: verify-cache/strength.json(사실별 등급), verify-cache/strength.txt(사람 검토용: 약한 확인과 근거 문장)
#
# 등급
#   strong — 핵심어가 있는 문장(앞뒤 한 문장 포함) 안에 사실의 나머지 내용어도 절반 이상 있음
#            (핵심어 항목으로 확인한 경우는 그 문장 근처에 개념 이름도 있어야 함)
#   weak   — 핵심어는 본문에 있지만 그 근처에서 나머지 내용이 확인되지 않음 → 사람이 읽고 판단
import json, os, re, sys

CACHE = sys.argv[1] if len(sys.argv) > 1 else 'verify-cache'
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_check.py'), encoding='utf-8').read()
# verify_check.py의 본문 추출·내용어 함수만 가져다 쓴다(대조 실행부는 제외)
_ns = {'__file__': os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_check.py'), 'sys': sys}
exec(_src.split('CORPUS = {}')[0].replace("CACHE = sys.argv[1] if len(sys.argv) > 1 else 'verify-cache'", f'CACHE = {CACHE!r}'), _ns)
norm, body_of, content_words, variants = _ns['norm'], _ns['body_of'], _ns['content_words'], _ns['variants']

concepts = {c['id']: c for c in json.load(open(os.path.join(CACHE, 'concepts.json'), encoding='utf-8'))}
report = json.load(open(os.path.join(CACHE, 'report.json'), encoding='utf-8'))
mapping = json.load(open(os.path.join(CACHE, 'map.json'), encoding='utf-8'))

def sentences(text):
    text = re.sub(r'\s+', ' ', text.replace(' 닫기 ', '. '))
    return [s.strip() for s in re.split(r'(?<=[다요음함됨임라])\.\s+|(?<=[.?!])\s+(?=[가-힣『「“(])', text) if s.strip()]

def windows(sents):
    for i in range(len(sents)):
        yield i, ' '.join(sents[max(0, i - 1): i + 2])

def find_any(nseg, w):
    # 활용형 차이(몰아내/몰아냈)를 위해 3글자 이상 낱말은 마지막 글자를 뺀 앞부분도 허용
    return any(v and (v in nseg or (len(v) >= 3 and v[:-1] in nseg)) for v in variants(w))

def grade(fact, arts, names, need_name):
    blank = norm(re.sub(r'[『』「」]', '', fact['blank'])) if fact['blank'] else ''
    if len(blank) < 2:
        blank = ''
    if blank and not any(find_any(norm(body_of(a)), blank) for a in arts):
        blank = ''  # 핵심어 표기가 달라 본문에 그대로 없으면 내용어만으로 판단
    cw = content_words(fact['text'])
    nb = blank
    others = [w for w in cw if not (nb and (norm(w) in nb or nb in norm(w)))]
    best = (-1.0, '', 0)
    for aid in arts:
        sents = sentences(body_of(aid))
        for i, win in windows(sents):
            nwin = norm(win)
            if blank and not find_any(nwin, blank):
                continue
            if need_name and not any(len(norm(n)) >= 2 and norm(n) in nwin for n in names):
                continue
            got = sum(1 for w in others if find_any(nwin, w))
            ratio = got / len(others) if others else 1.0
            if not blank and not others:
                ratio = 0.0
            if ratio > best[0]:
                best = (ratio, win, got)
    ratio, win, got = best
    if ratio < 0:
        return 'weak', 0.0, '', others
    need = 0.6 if not blank else 0.5
    return ('strong' if ratio >= need else 'weak'), round(ratio, 2), win, others

def blank_of(fact):
    b = norm(re.sub(r'[『』「」]', '', fact['blank'])) if fact['blank'] else ''
    return b if len(b) >= 2 else ''

def clip(win, word, width=150):
    i = win.find(word.replace('『', '').replace('』', '')) if word else -1
    if i < 0:
        i = win.find(word.split()[0]) if word and word.split() else -1
    if i < 0:
        return win[:2 * width] + ('…' if len(win) > 2 * width else '')
    return ('…' if i > width else '') + win[max(0, i - width): i + width] + ('…' if i + width < len(win) else '')

out, lines = {}, []
cnt = {'strong': 0, 'weak': 0}
for cid, r in report.items():
    c = concepts[cid]
    base = re.sub(r'\(.*?\)', '', c['name']).strip()
    names = [base] + c['aliases']
    arts = [a['id'] for a in r['articles']]
    cfacts = {f['id']: f for f in c['facts']}
    for f in r['facts']:
        if not f['ok']:
            continue
        fact = cfacts[f['id']]
        is_term = '항목에' in f['how']
        if is_term:
            t = (mapping.get(cid, {}).get('terms') or {}).get(f['id'])
            g, ratio, win, others = grade(fact, [t['id']], names, True)
        else:
            g, ratio, win, others = grade(fact, arts, names, False)
        cnt[g] += 1
        out[f['id']] = {'grade': g, 'ratio': ratio, 'how': 'term' if is_term else 'auto'}
        if g == 'weak':
            nwin = norm(win)
            miss = [w for w in others if not find_any(nwin, w)]
            j = norm(win).find(blank_of(fact)) if blank_of(fact) else -1
            w2 = clip(win, fact['blank'] if j >= 0 else (miss[0] if miss else ''))
            lines.append(f"[{f['id']}] {c['name']} :: {fact['text']}  (핵심어: {fact['blank'] or '-'} / 근처에 없음: {', '.join(miss)})\n    → {w2}\n")

json.dump(out, open(os.path.join(CACHE, 'strength.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(CACHE, 'strength.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
print(cnt)
