# Propuestas de zonas para Puebla (2026-09-23). Cada una: nombre como lo dicen
# los brokers, sinónimos (tal como salen de la minería normalizada), y la regla
# para elegir polígonos INEGI:
#   stem   = colonias cuyo nombre contiene la raíz, cerca del ancla (km)
#   keys   = polígonos explícitos
#   loc    = todas las colonias de esas localidades INEGI (prefijo de clave)
#   mun    = todas las colonias del municipio
#   pins   = polígonos donde caen ≥2 pins limpios del nombre
#   dibujar= INEGI no lo tiene: se dibuja a mano con los pins de guía
SPEC = [
 dict(nombre="Lomas de Angelópolis", syn=["lomas de angelopolis","lomas angelopolis","lomas"], rule=("keys",["2110600420001","2111900130064","2111900130065"])),
 dict(nombre="Lomas de Angelópolis I", syn=["lomas i","lomas 1","lomas de angelopolis i","lomas de angelopolis 1"], rule=("keys",["2111900130064"])),
 dict(nombre="Lomas de Angelópolis II", syn=["lomas ii","lomas 2","lomas de angelopolis ii","lomas de angelopolis 2"], rule=("keys",["2111900130065"])),
 dict(nombre="Lomas de Angelópolis III", syn=["lomas iii","lomas 3","lomas de angelopolis iii","lomas de angelopolis 3"], rule=("dibujar",), nota="INEGI no separa la III: queda dentro del polígono «Lomas de Angelópolis» (Ocoyucan). Dibujar con los pins."),
 dict(nombre="Cascatta", syn=["cascatta","punta cascatta","cascatta 1","lomas de angelopolis cascatta"], rule=("dibujar",), nota="Sub-zona dentro de Lomas de Angelópolis; INEGI no la tiene."),
 dict(nombre="Sonata", syn=["sonata","sonata towers"], rule=("dibujar",), nota="Sub-zona dentro de Lomas de Angelópolis; INEGI no la tiene."),
 dict(nombre="Gran Reserva", syn=["gran reserva","la gran reserva","la loma gran reserva"], rule=("dibujar",), nota="Sub-zona dentro de Lomas de Angelópolis; INEGI no la tiene."),
 dict(nombre="Zavaleta", syn=["zavaleta","calzada zavaleta","jardines de zavaleta","bosques de zavaleta"], rule=("stem",["zavaleta"],"2111400010102",3)),
 dict(nombre="La Paz", syn=["la paz"], rule=("stem",["la paz"],"2111400010330",1.5)),
 dict(nombre="Cuautlancingo", syn=["cuautlancingo","san juan cuautlancingo"], rule=("mun",["Cuautlancingo"]), nota="Municipio completo: así lo usan los brokers."),
 dict(nombre="Cholula", syn=["cholula","cholulas"], rule=("loc",["211400001","211190001"]), nota="Las dos cabeceras (Cholula de Rivadavia y San Andrés Cholula), sin Angelópolis ni Tlaxcalancingo."),
 dict(nombre="San Andrés Cholula", syn=["san andres cholula","san andres"], rule=("mun",["San Andrés Cholula"]), nota="Municipio completo (incluye Angelópolis)."),
 dict(nombre="San Pedro Cholula", syn=["san pedro cholula","cholula de rivadavia"], rule=("mun",["San Pedro Cholula"]), nota="Municipio completo."),
 dict(nombre="Atlixco", syn=["atlixco","villas de atlixco"], rule=("mun",["Atlixco"])),
 dict(nombre="Reserva Territorial Atlixcáyotl", syn=["reserva territorial atlixcayotl","atlixcayotl","via atlixcayotl","lateral atlixcayotl","corredor comercial desarrollo atlixcayotl"], rule=("stem",["atlixcayotl"],"2111900130012",4)),
 dict(nombre="Morillotla", syn=["morillotla","campestre morillotla"], rule=("stem",["morillotla"],"2111900010032",3)),
 dict(nombre="Momoxpan", syn=["momoxpan","santiago momoxpan","camino real a momoxpan"], rule=("stem",["momoxpan"],"2114000010063",3)),
 dict(nombre="Camino Real a Cholula", syn=["camino real","camino real a cholula"], rule=("stem",["camino real"],None,3)),
 dict(nombre="Las Ánimas", syn=["las animas","animas"], rule=("stem",["animas"],"2111400010040",2)),
 dict(nombre="Zerezotla", syn=["zerezotla"], rule=("stem",["zerezotla"],"2114000010047",3)),
 dict(nombre="La Noria", syn=["la noria","noria"], rule=("stem",["noria"],"2111400010870",2)),
 dict(nombre="San Manuel", syn=["san manuel","jardines de san manuel"], rule=("stem",["san manuel"],"2111400010247",3)),
 dict(nombre="La Vista", syn=["la vista","la vista country club","la vista country"], rule=("keys",["2111900130063","2111900130067"])),
 dict(nombre="La Carcaña", syn=["carcana","la carcana"], rule=("stem",["carcana"],"2114000010006",3)),
 dict(nombre="Emiliano Zapata", syn=["emiliano zapata"], rule=("keys",["2111900130001"]), nota="La de San Andrés Cholula (la que usan las propiedades); hay homónimas en Puebla capital, Tehuacán y otros."),
 dict(nombre="Mayorazgo", syn=["mayorazgo","san jose mayorazgo"], rule=("stem",["mayorazgo"],"2111400010294",2.5)),
 dict(nombre="Huexotitla", syn=["huexotitla"], rule=("stem",["huexotitla"],None,2)),
 dict(nombre="Anzures", syn=["anzures"], rule=("stem",["anzures"],None,2)),
 dict(nombre="Bugambilias", syn=["bugambilias"], rule=("stem",["bugambilias"],None,2)),
 dict(nombre="Xilotzingo", syn=["xilotzingo","san jose xilotzingo"], rule=("stem",["xilotzingo"],None,3)),
 dict(nombre="Forjadores", syn=["forjadores"], rule=("stem",["forjadores"],None,3)),
 dict(nombre="El Mirador", syn=["mirador","el mirador"], rule=("stem",["mirador"],"2111400010304",2)),
 dict(nombre="La Calera", syn=["la calera"], rule=("stem",["calera"],"2111400010860",1.5)),
 dict(nombre="San Diego los Sauces", syn=["san diego los sauces"], rule=("stem",["san diego los sauces"],None,2)),
 dict(nombre="Amalucan", syn=["amalucan"], rule=("stem",["amalucan"],None,2.5)),
 dict(nombre="El Cerrito", syn=["el cerrito"], rule=("stem",["el cerrito"],None,1.5)),
 dict(nombre="UDLAP", syn=["udlap","la udlap","de la universidad de las americas"], rule=("pins",["2111900010128"]), nota="Alrededor de la Universidad de las Américas."),
 dict(nombre="Recta a Cholula", syn=["recta a cholula","la recta","recta","recta cholula"], rule=("pins",[]), nota="Corredor: los polígonos salen de dónde caen los pins; revisar a ojo."),
 dict(nombre="Plaza San Diego", syn=["plaza san diego"], rule=("pins",[]), nota="Referencia comercial (Recta a Cholula); revisar si conviene como zona."),
 dict(nombre="Tlaxcalancingo", syn=["tlaxcalancingo","san bernardino tlaxcalancingo","san bernardino"], rule=("dibujar",), nota="La localidad INEGI incluye todo Angelópolis (83 colonias): el pueblo hay que dibujarlo."),
 dict(nombre="Bello Horizonte", syn=["bello horizonte"], rule=("dibujar",), nota="INEGI no lo tiene."),
 dict(nombre="Chipilo", syn=["chipilo"], rule=("dibujar",), nota="INEGI no tiene colonias en Chipilo."),
 dict(nombre="Valsequillo", syn=["valsequillo"], rule=("dibujar",), nota="Zona de la presa; INEGI no la tiene."),
 dict(nombre="Coronango", syn=["coronango"], rule=("mun",["Coronango"])),
 dict(nombre="Huejotzingo", syn=["huejotzingo"], rule=("mun",["Huejotzingo"])),
 dict(nombre="Amozoc", syn=["amozoc"], rule=("mun",["Amozoc"])),
 dict(nombre="San Martín Texmelucan", syn=["san martin texmelucan"], rule=("mun",["San Martín Texmelucan"])),
 dict(nombre="Juan C. Bonilla", syn=["juan c bonilla","cuanala"], rule=("mun",["Juan C. Bonilla"])),
]
