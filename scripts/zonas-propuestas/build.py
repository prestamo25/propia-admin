import json, re, unicodedata, collections, math
from spec import SPEC
def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii','ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]+',' ', s); return re.sub(r'\s+',' ', s).strip()
names = json.load(open('names.json'))
inegi = {r['key']: {**r,'lat':float(r['lat']),'lng':float(r['lng']),'km2':float(r['km2'])} for r in json.load(open('inegi.json'))}
hits = collections.defaultdict(dict)
for h in json.load(open('pin_hits.json')): hits[h['n']][h['key']] = h['k']
km = lambda a,b: math.hypot((a[0]-b[0])*111*math.cos(math.radians(19)), (a[1]-b[1])*111)
rows=[]
for s in SPEC:
    men = collections.Counter(); pins=[]; ph=collections.Counter()
    for n in s['syn']:
        d = names.get(n)
        if not d: continue
        men.update(d['c']); pins += d['pts']
        ph.update(hits.get(n, {}))
    npins = sum(ph.values())
    core = None
    if pins:
        xs=sorted(p[0] for p in pins); ys=sorted(p[1] for p in pins); core=(xs[len(xs)//2], ys[len(ys)//2])
    kind, *args = s['rule']; members=[]
    if kind=='keys': members=list(args[0])
    elif kind=='mun': members=[k for k,r in inegi.items() if r['municipio'] in args[0]]
    elif kind=='loc': members=[k for k in inegi if k[:9] in args[0]]
    elif kind=='stem':
        stems, anchor, rad = args
        cand=[k for k,r in inegi.items() if any(re.search(r'\b'+st+r'\b', norm(r['nombre'])) for st in stems)]
        c = (inegi[anchor]['lng'],inegi[anchor]['lat']) if anchor else core
        if not c:  # no anchor, no pins: the biggest match anchors
            b = max(cand, key=lambda k: inegi[k]['km2']); c=(inegi[b]['lng'],inegi[b]['lat'])
        members=[k for k in cand if km((inegi[k]['lng'],inegi[k]['lat']), c) <= rad]
    elif kind=='pins':
        strong=[k for k,c in ph.items() if c >= max(2, 0.1*npins) and k in inegi and inegi[k]['nombre']!='NINGUNO']
        members=sorted(set(args[0])|set(strong))
    tipo = {'keys':'colonias','stem':'familia','loc':'localidad','mun':'municipio','pins':'pins','dibujar':'dibujar'}[kind]
    rows.append(dict(nombre=s['nombre'], sinonimos=s['syn'], tipo=tipo, miembros=sorted(set(members)),
        menciones=dict(men), total=sum(men.values()), brokers=men.get('perfil',0),
        pins=[[round(x,5),round(y,5)] for x,y in pins[:300]], nota=s.get('nota')))
rows.sort(key=lambda r:-r['total'])
json.dump(rows, open('propuestas.json','w'), ensure_ascii=False)
for r in rows:
    nm=[inegi[k]['nombre'][:18] for k in r['miembros'][:5]]
    print(f"{r['total']:4d} {r['nombre'][:30]:30s} {r['tipo']:9s} pins={len(r['pins']):3d} n={len(r['miembros']):4d} {nm}")
