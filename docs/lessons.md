# El curso

Diecisiete lecciones, pensadas para hacerse en orden y de una sentada
(aproximadamente 45 minutos). Cada una introduce un comando o una idea, y no
avanza hasta que el objetivo se cumple.

Cada lección se puede abrir directo con `?leccion=N`, por ejemplo
`http://localhost:5173/?leccion=10`.

El orden vive en la lista `ORDER` de `src/lessons/index.js`: reordenar el curso
es editar esa lista y nada más. Los tests verifican que ninguna lección use un
comando que recién se enseña más adelante.

## El hilo

El curso está armado en cinco bloques:

1. **Un repositorio solo tuyo** (1–6): init, status, add, commit, el ciclo de
   trabajo y cómo deshacer.
2. **Ramas** (7–9): qué es una rama y cómo moverse entre ellas.
3. **El servidor** (10–12): clone, push y pull.
4. **Juntar el trabajo** (13–14): los dos tipos de merge.
5. **Las dos cosas a la vez** (15–17): el push rechazado, las ramas del
   servidor, y el flujo completo sin pistas paso a paso.

Hay dos decisiones de fondo detrás de ese orden.

**`clone` no te mete adentro.** Crea la carpeta y te deja afuera, igual que en
git de verdad, así que hace falta un `cd`. Es de las cosas que más se olvidan, y
el simulador no la regala: después de clonar, `git status` sigue diciendo que ahí
no hay repositorio, `ls` muestra la carpeta nueva, y de ahí se sale con `cd`. La
lección 10 lo pide explícitamente en el objetivo.

**El remoto no va primero.** Casi todos los tutoriales meten `git clone` en el
primer minuto, y el resultado es que se aprende a copiar comandos antes de
entender qué es un commit. Acá el servidor recién aparece cuando el ciclo
*editar → add → commit* ya está incorporado.

**Pero sí va antes del merge.** `git pull` sobre una rama que no tocaste es
solamente adelantar la etiqueta, así que clone, push y pull se pueden enseñar
sin hablar de merge todavía. Y cuando el merge ya se entiende, el push rechazado
de la lección 15 se lee por lo que realmente es: un push y un merge chocando.
Al revés —merge primero, remoto después— el push rechazado obliga a explicar
las dos cosas al mismo tiempo.

## Las lecciones

| # | id | Comandos | Objetivo |
| --- | --- | --- | --- |
| 1 | `init` | `git init` | Convertir la carpeta en un repositorio. |
| 2 | `status` | `git status` | Correr `git status` y ver un archivo *untracked*. |
| 3 | `add` | `git add` | Poner dos archivos en el stage. |
| 4 | `commit` | `git commit -m` | Hacer el primer commit. |
| 5 | `cycle` | `git status`, `git add`, `git commit -m` | Modificar un archivo y verlo pasar de rojo a verde antes de commitear. |
| 6 | `restore` | `git restore`, `git restore --staged` | Dejar todo limpio sin hacer ningún commit. |
| 7 | `branch` | `git branch` | Crear una rama sin moverse de `main`. |
| 8 | `checkout` | `git checkout` | Pasarse a otra rama y ver que cambian los archivos. |
| 9 | `checkoutB` | `git checkout -b` | Crear una rama, saltar a ella y commitear ahí. |
| 10 | `clone` | `git clone` | Traer un repositorio del servidor y entrar en la carpeta. |
| 11 | `push` | `git push` | Subir un commit propio. |
| 12 | `pull` | `git pull` | Bajar el commit que subió otra persona. |
| 13 | `merge` | `git merge` | Un merge que es un fast-forward. |
| 14 | `mergeDiverged` | `git merge` | Un merge de verdad, con commit de merge. |
| 15 | `pushRejected` | `git pull`, `git push` | Resolver un push rechazado. |
| 16 | `branchAll` | `git push -u`, `git branch -a` | Subir una rama y listar todas. |
| 17 | `final` | todos | El flujo completo, sin pistas paso a paso. |

## Por qué está armado así

**El stage antes que el commit (3 y 4).** El stage es lo que más cuesta y es lo
que más se saltea. Separarlo en dos lecciones obliga a mirar `git status` en el
medio, con los archivos ya en `Changes to be committed` pero todavía sin commit.

**Los colores hacen el trabajo pesado (5).** `git status` pinta de rojo lo que
todavía está solo en tu carpeta y de verde lo que ya está en el stage, igual que
git de verdad. La lección 5 se apoya en eso: el ciclo entero se ve como un
archivo que pasa de rojo a verde y después desaparece de la lista.

**Deshacer temprano (6).** Si alguien no sabe cómo volver atrás, no experimenta.
La lección arranca con el repositorio ya ensuciado —una línea a medio escribir en
el stage y basura tipeada en el archivo— para que las dos formas de `git restore`
se usen una detrás de la otra y se vea la diferencia.

**Dos lecciones de merge (13 y 14).** El fast-forward y el merge con commit se
ven distintos en el grafo y confunden si se explican juntos. Primero el caso en
que git solo adelanta una etiqueta, después el caso en que tiene que inventar un
commit nuevo.

**El push rechazado tiene su propia lección (15), y va después del merge.** Es
el error más frecuente de todos. El texto invita explícitamente a correr
`git push` primero, leer el rechazo entero y recién ahí arreglarlo. Llegar acá
sabiendo qué es un merge cambia el error de "algo se rompió" a "las dos
historias divergieron", que es lo que dice de verdad. Aprender a leerlo vale más
que memorizar la secuencia `pull`, `push`.

**La 17 no da la solución.** Repite el flujo completo sin pistas paso a paso, con
`git status` como única brújula.

## Cómo se valida cada objetivo

Cada lección tiene una función `check(world, history)` en `src/lessons/index.js`.
La mayoría mira el estado final: qué ramas existen, dónde está `HEAD`, si el
repositorio quedó limpio, si el servidor tiene el mismo commit que la copia
local. Las lecciones cuyo objetivo es *leer* algo (2, 5, 16) además revisan que
el comando se haya corrido, mirando `history`.

Ninguna lección exige una secuencia exacta de comandos: si llegás al mismo estado
por otro camino, cuenta igual. `test/lessons.test.js` resuelve las diecisiete de
punta a punta, así que una lección imposible de completar rompe los tests.

## El idioma de la terminal

La terminal habla en castellano, igual que git de verdad cuando la máquina tiene
`LANG` en español. No hay nada que configurar: el idioma de la salida es el
idioma del sitio.

Las palabras clave quedan en inglés igual: commit, stage, push, pull, merge. Son
las que van a tipear toda su vida y las que van a encontrar en cualquier
búsqueda. Los mensajes de commit tampoco se traducen, porque son contenido del
repositorio y no salida del programa.

Vale la pena avisarles en algún momento que en una máquina con `LANG` en inglés
—que es lo más común— los mismos mensajes salen en inglés, y que lo que están
leyendo acá es el mismo texto en el otro idioma.

## Errores y pistas

Cuando un comando falla pasan dos cosas al mismo tiempo:

- la terminal muestra el error de git, palabra por palabra;
- abajo aparece una tarjeta que lo explica en castellano y dice cómo seguir.

La tarjeta dice de qué tipo de nota se trata: **Error** cuando git se negó a
hacer algo, **Ojo** cuando algo quedó a medio hacer (un merge con conflictos, por
ejemplo, que no es un error pero deja trabajo pendiente), **Info** cuando es
información —la ayuda de un comando— y **Tip** cuando es una sugerencia, como
cuando escribieron mal el nombre de un comando.

Los errores están escritos para que valga la pena leerlos. Un `git comit` sugiere
`git commit`; un commit sin nada en el stage muestra el `git status` completo; un
checkout que pisaría trabajo sin guardar lista los archivos en peligro.

Aparte de eso, cada lección tiene pistas propias, que se piden de a una con el
botón **Pedir una pista** y van de lo general a lo concreto. Nadie se queda
trabado, pero hay que decidir pedir ayuda.

Cuando la solución son varios comandos, van en un bloque, uno por línea, listos
para tipear; cuando es uno solo, va en la oración. La URL del repositorio también
va en un bloque: es larga y partida en dos renglones se copia mal.

**El panel no lista los comandos de la lección.** Los tuvo un tiempo, arriba de
las pistas, y era un machete: con el comando a la vista no queda nada que
resolver. Ahora el comando exacto vive en la última pista, que se ofrece como
**Mostrar solución** —con el contador incluido, así se ve que es una pista más y
no algo aparte— y queda marcada en naranja cuando se muestra. La explicación de
arriba sigue nombrando el comando que enseña: eso es dar clase, no dar la
respuesta.

Los tests lo sostienen: toda lección tiene al menos dos pistas, la última nombra
alguno de los comandos que la lección introduce, y el render del panel falla si
la lista de comandos vuelve a aparecer.

## Por qué no está `git status --staged`

Porque no existe en git. Se probó como atajo para mirar solo el stage y se sacó:
enseñar un flag inventado confunde más de lo que ayuda, y los colores de
`git status` ya muestran esa diferencia sin agregar nada. Si alguien lo escribe,
el simulador responde con el mismo `error: unknown option` que git, y la tarjeta
de ayuda lo manda a leer la sección verde. En git real, lo más parecido es
`git diff --staged`, que muestra el contenido de los cambios en vez de la lista
de archivos.

## Ideas para el aula

- La primera vez que abren el sitio les corre solo un recorrido guiado de siete
  pasos que muestra para qué es cada panel. Si lo saltearon, vuelve con
  **¿Cómo funciona?**, arriba a la derecha: sirve para arrancar la clase todos
  mirando lo mismo.
- `git <comando> --help` está para todos los comandos: sirve para que se
  acostumbren a preguntarle a la herramienta antes de preguntar. La ayuda de acá
  es reducida y lo dice, y los manda a correr la de verdad en una terminal.
- Mandar `?leccion=N` para que todos arranquen en el mismo punto.
- **Reiniciar lección** deja la lección como estaba: sirve para mostrar un
  camino, deshacerlo y que lo hagan ellos.
- La lección 14 es un buen lugar para frenar y dibujar el grafo en el pizarrón
  antes de correr el merge.
- Para mostrar un conflicto: en la lección 9, editar el mismo archivo en las dos
  ramas y mergear. Los conflictos están implementados aunque ninguna lección los
  exija, y se resuelven como en la vida real, con `git add` y `git commit`.
