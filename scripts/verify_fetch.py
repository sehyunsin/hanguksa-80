# 한국민족문화대백과사전에서 개념별 대조용 항목을 찾아 내려받는다(캐시: verify-cache/, git 제외).
# 사용: python -I scripts/verify_fetch.py verify-cache   [--terms]  (--terms: 사실의 핵심어 항목도 내려받기)
import html, json, os, re, sys, time, urllib.parse, urllib.request

CACHE = sys.argv[1] if len(sys.argv) > 1 else 'verify-cache'
DO_TERMS = '--terms' in sys.argv
BASE = 'https://encykorea.aks.ac.kr'
UA = {'User-Agent': 'Mozilla/5.0 (study-app content verification)'}
os.makedirs(os.path.join(CACHE, 'search'), exist_ok=True)
os.makedirs(os.path.join(CACHE, 'articles'), exist_ok=True)

ERA_WORDS = {
    'pre': ['석기', '청동기', '철기', '선사'],
    'gojoseon': ['고조선', '부여', '고구려', '옥저', '동예', '삼한', '초기 국가'],
    'samguk': ['고구려', '백제', '신라', '가야', '삼국'],
    'nambuk': ['신라', '발해', '통일신라', '후백제', '후고구려', '태봉'],
    'goryeo': ['고려'],
    'joseon1': ['조선'],
    'joseon2': ['조선', '후기'],
    'gaehang': ['조선', '대한제국', '개항', '1880', '1890', '190'],
    'ilje': ['일제', '독립', '항일', '1910', '1920', '1930', '1940'],
    'hyeondae': ['대한민국', '광복', '정부', '1945', '195', '196', '197', '198', '199', '200'],
    'theme': [],
}

def norm(s):
    return re.sub(r'[\s·.,()\[\]「」『』〈〉<>“”"‘’\'\-:;!?]', '', s)

def get(url, path):
    if os.path.exists(path):
        return open(path, encoding='utf-8').read()
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read().decode('utf-8', 'replace')
            open(path, 'w', encoding='utf-8').write(data)
            time.sleep(0.35)
            return data
        except Exception as e:  # 네트워크 오류는 잠시 후 재시도
            time.sleep(2 + attempt * 3)
            last = e
    raise last

def search(q):
    fn = os.path.join(CACHE, 'search', re.sub(r'[^\w가-힣]', '_', q)[:80] + '.html')
    h = html.unescape(get(BASE + '/Article/Search?query=' + urllib.parse.quote(q), fn))
    out = []
    for m in re.finditer(r'<a href="/Article/(E\d+)" class="item">(.*?)</a>', h, re.S):
        block = m.group(2)
        sm = re.search(r'<p class="subject">(.*?)</p>', block, re.S)
        dm = re.search(r'<p class="desc">(.*?)</p>', block, re.S)
        subj = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', sm.group(1))).strip() if sm else ''
        title = re.sub(r'\s*\(.*$', '', subj).strip()
        desc = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', dm.group(1))).strip() if dm else ''
        if not title:  # 사이드바(실시간 인기 항목) 링크는 제목 블록이 없음 → 제외
            continue
        out.append({'id': m.group(1), 'title': title, 'subject': subj, 'desc': desc[:300]})
    return out

def article(aid):
    fn = os.path.join(CACHE, 'articles', aid + '.txt')
    if os.path.exists(fn):
        return open(fn, encoding='utf-8').read()
    raw = get(BASE + '/Article/' + aid, os.path.join(CACHE, 'articles', aid + '.html'))
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    t = re.sub(r'\s+', ' ', t)
    s = t.find('본문축소')
    e = t.find('콘텐츠 수정 요청')
    body = t[s + 4 if s >= 0 else 0: e if e > 0 else len(t)]
    open(fn, 'w', encoding='utf-8').write(body)
    return body

def pick(results, names, era):
    best, bs = None, -1
    words = ERA_WORDS.get(era, [])
    for i, r in enumerate(results[:15]):
        t = norm(r['title'])
        if not t:
            continue
        sc = 0
        for n in names:
            nn = norm(n)
            if not nn:
                continue
            if t == nn:
                sc = max(sc, 100)
            elif nn in t or t in nn:
                sc = max(sc, 40 + min(len(t), len(nn)))
        if sc == 0:
            continue
        sc += sum(6 for w in words if w in r['desc'])
        sc -= i  # 앞 순위 우대
        if sc > bs:
            best, bs = r, sc
    return best, bs

concepts = json.load(open(os.path.join(CACHE, 'concepts.json'), encoding='utf-8'))
mapping = {}
path_map = os.path.join(CACHE, 'map.json')
if os.path.exists(path_map):
    mapping = json.load(open(path_map, encoding='utf-8'))

qpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify-queries.json')
OVERRIDES = json.load(open(qpath, encoding='utf-8')) if os.path.exists(qpath) else {}

def pick_exact(q, must):
    rs = search(q)
    nq = norm(q)
    ok = [r for r in rs[:15] if norm(r['title']) and (not must or re.search(must, r['desc']))]
    for r in ok:
        if norm(r['title']) == nq:
            return r
    # 정확히 같지 않으면 거의 같은 제목만(예: '안시성 전투' ↔ '안시성전투'), 짧은 일반어 제목은 제외
    for r in ok:
        nt = norm(r['title'])
        if len(nt) >= 2 and ((nq in nt and len(nt) <= len(nq) + 2) or (nt in nq and len(nt) >= len(nq) - 1)):
            return r
    return None

REPICK = '--repick' in sys.argv
for i, c in enumerate(concepts):
    if c['id'] in mapping and not DO_TERMS and not REPICK:
        continue
    if c['id'] in OVERRIDES:
        ov = OVERRIDES[c['id']]
        arts = []
        for q in ov['q']:
            # '검색어|조건' 형식이면 그 검색어에만 설명 조건을 적용(같은 제목 항목이 여럿일 때: 예 '동국지도|정상기')
            q, _, must1 = q.partition('|')
            try:
                r = pick_exact(q, must1 or ov.get('must'))
            except Exception as e:
                print('override search fail', q, e)
                r = None
            if r and all(a['id'] != r['id'] for a in arts):
                arts.append({'id': r['id'], 'title': r['title'], 'subject': r['subject'], 'desc': r['desc'][:200]})
                article(r['id'])
        prev = mapping.get(c['id'], {})
        mapping[c['id']] = {'query': ov['q'], 'article': arts[0] if arts else None, 'articles': arts, 'score': 'override', 'terms': prev.get('terms', {})}
        if not DO_TERMS:
            continue
    base = re.sub(r'\(.*?\)', '', c['name']).strip()
    names = list(dict.fromkeys([c['q'], base, c['name']] + c['aliases']))
    cands = []
    for q in names[:4]:
        try:
            cands += search(q)
        except Exception as e:
            print('search fail', q, e)
    if c['id'] in OVERRIDES:
        entry = mapping[c['id']]
    else:
        best, score = pick(cands, names, c['era'])
        entry = {'query': names, 'article': None, 'score': score, 'cands': [{'id': r['id'], 'title': r['title'], 'desc': r['desc'][:80]} for r in cands[:6]], 'terms': mapping.get(c['id'], {}).get('terms', {})}
        if best:
            entry['article'] = {'id': best['id'], 'title': best['title'], 'subject': best['subject'], 'desc': best['desc'][:200]}
            entry['articles'] = [entry['article']]
            article(best['id'])
    # 사실 핵심어 항목(역방향 검증)
    if DO_TERMS:
        entry['terms'] = entry.get('terms') or {}
        flagged = None
        rp = os.path.join(CACHE, 'report.json')
        if os.path.exists(rp):
            rep = json.load(open(rp, encoding='utf-8')).get(c['id'], {})
            flagged = {f['id'] for f in rep.get('facts', []) if not f['ok']}
        for f in c['facts']:
            b = f['blank']
            if not b or norm(b) == norm(base) or f['id'] in entry['terms']:
                continue
            if flagged is not None and f['id'] not in flagged:
                continue
            q = re.sub(r'[『』「」]', '', b)
            try:
                rs = search(q)
            except Exception as e:
                print('term search fail', q, e)
                continue
            ex = [r for r in rs[:8] if norm(r['title']) == norm(q)]
            if ex:
                # 같은 제목이 여러 개면 시대어가 맞는 것
                words = ERA_WORDS.get(c['era'], [])
                ex.sort(key=lambda r: -sum(1 for w in words if w in r['desc']))
                entry['terms'][f['id']] = {'id': ex[0]['id'], 'title': ex[0]['title']}
                article(ex[0]['id'])
    mapping[c['id']] = entry
    if i % 10 == 0:
        json.dump(mapping, open(path_map, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(i, c['id'], '->', entry['article']['title'] if entry['article'] else None, flush=True)

json.dump(mapping, open(path_map, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('done', len(mapping))
