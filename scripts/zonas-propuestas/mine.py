import json, re, unicodedata, collections
def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii','ignore').decode().lower()
    s = re.sub(r'[^a-z0-9 ]+',' ', s)
    return re.sub(r'\s+',' ', s).strip()
DROP_PREFIX = r'^(col|colonia|fracc|fraccionamiento|fracionamiento|residencial|res|priv|privada|cerrada|cto|circuito|zona|conjunto|condominio|unidad habitacional|u h|barrio|bo|av|avenida|blvd|boulevard|calle|en|cerca de|atras de|atras|frente a|a un costado de|junto a|a lado de|por|sobre|la zona de|zona de)\s+'
NOISE = {'puebla','pue','mexico','heroica puebla de zaragoza','puebla pue','puebla puebla','cerca','zona','centro sur','sur','norte','oriente','poniente','sin datos','n a','na','none','null',''}
def pieces(txt):
    if not txt: return []
    out=[]
    for p in re.split(r',|;|/|\(|\)|\bo\b|\by\b| - ', txt, flags=re.I):
        n = norm(p)
        for _ in range(3): n = re.sub(DROP_PREFIX,'',n)
        n = re.sub(r'\b(pue|puebla|mexico|mex|cp \d+|\d{5})\b$','',n).strip()
        if len(n)<4 or n in NOISE or re.fullmatch(r'[\d ]+',n): continue
        if re.search(r'\b(no|num|numero|#)\s*\d',n) or re.match(r'^\d+ (sur|norte|oriente|poniente)',n): continue
        out.append(n)
    return out
cnt = collections.defaultdict(lambda: collections.Counter())
pts = collections.defaultdict(list)
for f,src in [('wa.json','wa'),('props.json','prop'),('perfil.json','perfil'),('req.json','req')]:
    for r in json.load(open(f)):
        ps = pieces(r.get('txt'))
        for i,n in enumerate(ps):
            cnt[n][src]+=1
            # real points only: app listings / requests, and WA rows geocoded to an exact point
            if r.get('lat') and r.get('lng') and (src != 'wa' or r.get('prec') == 'point'):
                pts[n].append((r['lng'],r['lat']))
tot = sorted(cnt.items(), key=lambda kv: -sum(kv[1].values()))
json.dump({n:{'c':dict(c),'pts':pts[n][:400]} for n,c in tot}, open('names.json','w'))
print(len(tot))
for n,c in tot[:260]:
    print(f"{sum(c.values()):4d} {n:45s} {dict(c)}")
