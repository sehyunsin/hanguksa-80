# 개념의 사실·연도를 한국민족문화대백과사전 항목 본문과 자동 대조한다.
# 사용: python -I scripts/verify_check.py verify-cache
# 출력: verify-cache/report.json, verify-cache/report.txt(사람 검토용)
import json, os, re, sys

CACHE = sys.argv[1] if len(sys.argv) > 1 else 'verify-cache'
concepts = json.load(open(os.path.join(CACHE, 'concepts.json'), encoding='utf-8'))
mapping = json.load(open(os.path.join(CACHE, 'map.json'), encoding='utf-8'))

def norm(s):
    return re.sub(r'[\s·.,()\[\]「」『』〈〉<>“”"‘’\'\-:;!?~]', '', s)

DISCLAIMER = '다를 수 있습니다.'

def prose(t):
    """항목 페이지 글자에서 본문 서술만 남긴다: 관련 항목 목록·사진 설명·키워드 목록·참고문헌·주석 제외.
    (관련 항목·참고문헌 속 단어가 우연히 맞아 '확인'으로 잡히던 문제를 막기 위함)"""
    s = t.find(DISCLAIMER)
    if s >= 0:
        s += len(DISCLAIMER)
    else:
        s = max(0, t.find('정의 닫기'))
    k, d = t.find('키워드 ', s), t.find('정의 닫기', s)
    t2 = t[s:k] + ' ' + t[d:] if 0 <= k < d else t[s:]
    ends = [i for i in (t2.find('참고문헌 닫기'), t2.find('주석 닫기')) if i >= 0]
    return t2[: min(ends)] if ends else t2

def body_of(aid):
    p = os.path.join(CACHE, 'articles', aid + '.txt')
    return prose(open(p, encoding='utf-8').read()) if os.path.exists(p) else ''

def header_of(aid):
    """본문 앞 정보 상자(출생·사망 연도, 재위 등). 관련 항목 목록(첫 '더보기' 앞)은 제외 — 연도 대조에만 사용."""
    p = os.path.join(CACHE, 'articles', aid + '.txt')
    if not os.path.exists(p):
        return ''
    t = open(p, encoding='utf-8').read()
    s, e = t.find('더보기'), t.find(DISCLAIMER)
    return t[s:e] if 0 <= s < e else ''

PARTICLES = ['으로부터', '에서는', '에게서', '으로서', '하였으며', '하였는데', '하였고', '되었으며', '하였다', '되었다', '이었다', '였다', '하여', '하고', '하는', '하며', '에서', '에게', '으로', '까지', '부터', '처럼', '라는', '이라는', '이란', '을', '를', '이', '가', '은', '는', '의', '에', '로', '와', '과', '도', '만', '고', '며']
GENERIC = set('실시 설치 설립 조직 건립 편찬 정비 강화 사용 만들었다 만들 세웠다 세우 주장 추진 시행 전개 발표 발행 체결 파견 저술 지급 폐지 개혁 운동 사건 나라 시대 당시 이후 이전 위해 통해 대한 관한 그리고 하였다 있었다 있다 되었다 처음 다시 크게 많이 모든 각각 함께 중심 대표 일어났다 일으켰다 이끌었다 맞서 따라 의해 위한 대해 지방 중앙'.split())

def stem(tok):
    for _ in range(2):
        for p in PARTICLES:
            if tok.endswith(p) and len(tok) - len(p) >= 2:
                tok = tok[: -len(p)]
                break
    return tok

def content_words(text):
    toks = re.findall(r'[가-힣A-Za-z0-9一-龥]+', text)
    out = []
    for t in toks:
        s = stem(t)
        if len(s) >= 2 and s not in GENERIC and not re.fullmatch(r'\d+', s):
            out.append(s)
    return list(dict.fromkeys(out))

KOR = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
def num2kor(n):
    if n == 0:
        return '영'
    out = ''
    for unit, name in ((1000, '천'), (100, '백'), (10, '십')):
        q, n = divmod(n, unit)
        if q:
            out += ('' if q == 1 else KOR[q]) + name
    return out + KOR[n]

def variants(w):
    vs = {norm(w)}
    if re.search(r'\d', w):
        vs.add(norm(re.sub(r'\d+', lambda m: num2kor(int(m.group())) if int(m.group()) < 10000 else m.group(), w)))
    return vs

def has(nbody, w):
    return any(v and v in nbody for v in variants(w))

CORPUS = {}
for fn in os.listdir(os.path.join(CACHE, 'articles')):
    if fn.endswith('.txt'):
        CORPUS[fn[:-4]] = norm(body_of(fn[:-4]))

def cooccur(term, names, window=220):
    """전체 내려받은 항목에서 핵심어와 개념 이름이 가까이(약 220자 이내) 함께 나오는 곳"""
    tvs = [v for v in variants(term) if len(v) >= 2]
    nvs = [norm(n) for n in names if len(norm(n)) >= 2]
    for aid, txt in CORPUS.items():
        for tv in tvs:
            i = txt.find(tv)
            while i >= 0:
                seg = txt[max(0, i - window): i + len(tv) + window]
                if any(n in seg for n in nvs):
                    return aid
                i = txt.find(tv, i + 1)
    return None

def snippet(body, word, width=70):
    i = body.find(word)
    if i < 0:
        nb = norm(body)
        j = nb.find(norm(word))
        if j < 0:
            return ''
        return '…' + nb[max(0, j - width): j + width] + '…'
    return '…' + body[max(0, i - width): i + width] + '…'

ERA_HINT = {
    'pre': ['석기', '청동기', '철기'], 'gojoseon': ['고조선', '부여', '고구려', '옥저', '동예', '삼한'],
    'samguk': ['고구려', '백제', '신라', '가야'], 'nambuk': ['신라', '발해'], 'goryeo': ['고려'],
    'joseon1': ['조선'], 'joseon2': ['조선'], 'gaehang': ['조선', '대한제국', '고종'],
    'ilje': ['일제', '독립', '항일'], 'hyeondae': ['대한민국', '정부', '대통령'], 'theme': [],
}
# 묶음·주제 개념은 이름 대신 대표 주체로 동시 출현을 확인
EXTRA_NAMES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify-names.json'), encoding='utf-8'))
report = {}
lines = []
tot_f = tot_ok = 0
for c in concepts:
    m = mapping.get(c['id'], {})
    art = (m.get('article') or {})
    arts = m.get('articles') or ([art] if art else [])
    body = ' '.join(body_of(a['id']) for a in arts)
    nbody = norm(body)
    base = re.sub(r'\(.*?\)', '', c['name']).strip()
    names = [base] + c['aliases']
    facts = []
    for f in c['facts']:
        res = {'id': f['id'], 'text': f['text'], 'ok': False, 'how': ''}
        b = norm(re.sub(r'[『』「」]', '', f['blank'])) if f['blank'] else ''
        cw = content_words(f['text'])
        hits = [w for w in cw if has(nbody, w)]
        cov = len(hits) / len(cw) if cw else 0
        if len(b) < 2:  # 한 글자 핵심어(왜·철·얼 등)는 다른 낱말 속에서도 잡혀 근거가 안 됨 → 내용어 비율로만 판단
            b = ''
        if b and has(nbody, b):
            res.update(ok=True, how='핵심어가 항목 본문에 있음')
        elif not b and cov >= 0.6:
            res.update(ok=True, how=f'내용어 {len(hits)}/{len(cw)} 일치')
        else:
            t = (m.get('terms') or {}).get(f['id'])
            if t:
                tb = norm(body_of(t['id']))
                tcw = [w for w in cw if norm(w) in tb]
                era_ok = any(w in tb for w in ERA_HINT.get(c['era'], [])) if ERA_HINT.get(c['era']) else True
                if any(norm(n) in tb for n in names if len(norm(n)) >= 2):
                    res.update(ok=True, how=f'「{t["title"]}」 항목에 {base} 언급')
                elif era_ok and cw and len(tcw) / len(cw) >= 0.5:
                    res.update(ok=True, how=f'「{t["title"]}」 항목에 시대·내용 일치({len(tcw)}/{len(cw)})')
        if not res['ok'] and b and cov >= 0.75:
            res.update(ok=True, how=f'핵심어 표기 차이, 내용어 {len(hits)}/{len(cw)} 일치')
        if not res['ok']:
            # 핵심어(빈칸어 또는 가장 긴 내용어)가 다른 항목에서 개념 이름과 함께 나오는지
            terms = [f['blank']] if f['blank'] else sorted(cw, key=len, reverse=True)[:2]
            for term in terms:
                if len(norm(term)) < 2:
                    continue
                aid = cooccur(term, names + EXTRA_NAMES.get(c['id'], []))
                if aid:
                    res.update(candidate=aid, candidateTerm=term)  # 동시 출현은 우연일 수 있어 사람 검토 후보로만 사용
                    break
        res['coverage'] = round(cov, 2)
        res['missing'] = [w for w in cw if w not in hits][:6]
        facts.append(res)
    years = re.findall(r'(\d{3,4})', c['when'] or '')
    ybody = body + ' ' + ' '.join(header_of(a['id']) for a in arts)
    year_bad = [y for y in years if y not in ybody] if body else years
    ok_n = sum(1 for f in facts if f['ok'])
    tot_f += len(facts)
    tot_ok += ok_n
    report[c['id']] = {
        'name': c['name'],
        'article': art,
        'articles': arts,
        'facts': facts,
        'years': years,
        'yearsMissing': year_bad,
        'allOk': bool(art) and ok_n == len(facts) and not year_bad,
    }
    if not report[c['id']]['allOk']:
        lines.append(f"## {c['id']} {c['name']} → {art.get('subject', '항목 없음')} [{ok_n}/{len(facts)}]" + (f" 연도 미확인: {','.join(year_bad)} (when={c['when']})" if year_bad else ''))
        for f in facts:
            if not f['ok']:
                key = f['missing'][0] if f['missing'] else ''
                lines.append(f"  ✗ {f['text']}  | 없음: {', '.join(f['missing'])}")
        lines.append('')

json.dump(report, open(os.path.join(CACHE, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(CACHE, 'report.txt'), 'w', encoding='utf-8').write('\n'.join(lines))
all_ok = sum(1 for r in report.values() if r['allOk'])
no_art = sum(1 for r in report.values() if not r['article'])
print(f'facts ok {tot_ok}/{tot_f} ({tot_ok / max(1, tot_f):.0%}), concepts all-ok {all_ok}/{len(report)}, no article {no_art}')
