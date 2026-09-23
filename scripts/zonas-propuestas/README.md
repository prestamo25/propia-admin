# Propuestas de zonas — generador

Produce las **zonas propuestas** que aparecen en admin → Zonas → pestaña «Propuestas»
(tabla `zona_propuestas`, SQL en `Propia/supabase/sql/applied/zona-propuestas-2026-09-23.sql`).
Una propuesta no cambia el matching: sólo se vuelve zona cuando alguien la aprueba en el editor.

Primera corrida: Puebla, 2026-09-23 (48 propuestas; 3 idénticas a zonas existentes quedaron aprobadas).

## Pasos

Correr en una carpeta de trabajo (los scripts leen/escriben JSON en el directorio actual).
Las consultas se mandan por la Management API (receta en la memoria del proyecto).

1. **Exportar** (una consulta por archivo):
   - `wa.json` — `select 'wa' src, w.extracted->>'location' txt, w.geo_lat lat, w.geo_lng lng, w.geo_precision prec from wa_listings w join wa_groups g on g.group_jid=w.group_jid where g.state='Puebla' and coalesce(w.extracted->>'location','')<>''`
   - `props.json` — `select 'prop' src, address_components->>'colonia' txt, lat, lng from properties where state='Puebla'`
   - `perfil.json` — `select 'perfil' src, e->>'nombre' txt from users u, jsonb_array_elements(u.zonas) e where 'Puebla'=any(u.states)`
   - `req.json` — `select 'req' src, coalesce(reference_address, geo_place) txt, lat, lng from search_requests where 'Puebla'=any(states)`
   - `inegi.json` — `select key, nombre, tipo, municipio, st_y(st_centroid(geom)) lat, st_x(st_centroid(geom)) lng, st_area(geom::geography)/1e6 km2 from colonias where estado='Puebla' and tipo<>'ZONA'`
2. `python3 mine.py` → `names.json`: cada nombre normalizado con menciones por fuente y pins.
   Pins de WhatsApp sólo con `geo_precision='point'`: los de «area» caen todos en el centroide
   de la zona resuelta (334 en Lomas, 120 en Zavaleta) y contaminan la evidencia.
3. `python3 pts.py` → `pts_payload.json`; mandarlo a SQL (`st_contains` contra `colonias`) y
   guardar el resultado como `pin_hits.json` (nombre, key, conteo).
4. Editar **`spec.py`** — la lista de zonas, sus sinónimos y la regla para elegir colonias.
   Es la parte con criterio: los brokers escriben lo mismo de cinco formas y hay nombres que
   no son colonias (UDLAP, Recta a Cholula).
5. `python3 build.py` → `propuestas.json`, y cargarlo con el `insert … on conflict (estado, nombre)`
   de la primera corrida (conserva la revisión de las ya aprobadas/descartadas) + el `update … geom`.

## Criterios que salieron de los datos

- El resolver prefiere el nombre exacto de una colonia a una zona: «Lomas de Angelópolis» sin
  ciudad resuelve a UNO de sus 3 polígonos. Por eso «ya resuelve» no basta para descartar un nombre.
- La localidad INEGI de San Bernardino Tlaxcalancingo abarca todo Angelópolis (83 colonias):
  el pueblo se dibuja a mano.
- «Estrellas del Sur» se dejó fuera a propósito: el veto del resolver del 08-05 vive.
