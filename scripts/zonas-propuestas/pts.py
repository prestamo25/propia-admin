import json
names = json.load(open('names.json'))
rows = []
for n, d in names.items():
    tot = sum(d['c'].values())
    if tot < 4: continue
    for lng, lat in d['pts']:
        rows.append([n, round(lng, 6), round(lat, 6)])
json.dump(rows, open('pts_payload.json', 'w'))
print(len(rows), len({r[0] for r in rows}))
