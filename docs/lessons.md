# El curso

Diecisiete lecciones, pensadas para hacerse en orden y de una sentada
(aproximadamente 45 minutos). Cada una introduce un comando o una idea, y no
avanza hasta que el objetivo se cumple.

Cada lección se puede abrir directo con `?leccion=N`, por ejemplo
`http://localhost:5173/?leccion=12`.

## El hilo

El curso está armado en cuatro bloques:

1. **Un repositorio solo tuyo** (1–6): init, status, add, commit, el ciclo de
   trabajo y cómo deshacer.
2. **Ramas** (7–11): qué es una rama, cómo moverse, y los dos tipos de merge.
3. **El servidor** (12–15): clone, push, pull, y el push rechazado.
4. **Cierre** (16–17): ramas locales contra ramas del servidor, y el flujo
   completo sin pistas paso a paso.

La decisión de fondo es dejar el remoto para la segunda mitad. Casi todos los
tutoriales meten `git clone` en el primer minuto, y el resultado es que se
aprende a copiar comandos antes de entender qué es un commit. Acá el servidor
recién aparece cuando el ciclo *editar → add → commit* ya está incorporado.

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
| 10 | `merge` | `git merge` | Un merge que es un fast-forward. |
| 11 | `mergeDiverged` | `git merge` | Un merge de verdad, con commit de merge. |
| 12 | `clone` | `git clone` | Traer un repositorio del servidor. |
| 13 | `push` | `git push` | Subir un commit propio. |
| 14 | `pull` | `git pull` | Bajar el commit que subió otra persona. |
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

**Dos lecciones de merge (10 y 11).** El fast-forward y el merge con commit se
ven distintos en el grafo y confunden si se explican juntos. Primero el caso en
que git solo adelanta una etiqueta, después el caso en que tiene que inventar un
commit nuevo.

**El push rechazado tiene su propia lección (15).** Es el error más frecuente de
todos. El texto invita explícitamente a correr `git push` primero, leer el
rechazo entero y recién ahí arreglarlo. Aprender a leer ese error vale más que
memorizar la secuencia `pull`, `push`.

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

## Errores y pistas

Cuando un comando falla pasan dos cosas al mismo tiempo:

- la terminal muestra el error de git, en inglés y palabra por palabra;
- abajo aparece una tarjeta **Qué pasó** que lo explica en castellano y dice cómo
  seguir.

Los errores están escritos para que valga la pena leerlos. Un `git comit` sugiere
`git commit`; un commit sin nada en el stage muestra el `git status` completo; un
checkout que pisaría trabajo sin guardar lista los archivos en peligro.

Aparte de eso, cada lección tiene pistas propias, que se piden de a una con el
botón **Pedir una pista** y van de lo general a lo concreto: la última siempre
dice el comando exacto. Nadie se queda trabado, pero hay que decidir pedir ayuda.

## Por qué no está `git status --staged`

Porque no existe en git. Se probó como atajo para mirar solo el stage y se sacó:
enseñar un flag inventado confunde más de lo que ayuda, y los colores de
`git status` ya muestran esa diferencia sin agregar nada. Si alguien lo escribe,
el simulador responde con el mismo `error: unknown option` que git, y la tarjeta
de ayuda lo manda a leer la sección verde. En git real, lo más parecido es
`git diff --staged`, que muestra el contenido de los cambios en vez de la lista
de archivos.

## Ideas para el aula

- Mandar `?leccion=N` para que todos arranquen en el mismo punto.
- **Reiniciar lección** deja la lección como estaba: sirve para mostrar un
  camino, deshacerlo y que lo hagan ellos.
- La lección 11 es un buen lugar para frenar y dibujar el grafo en el pizarrón
  antes de correr el merge.
- Para mostrar un conflicto: en la lección 9, editar el mismo archivo en las dos
  ramas y mergear. Los conflictos están implementados aunque ninguna lección los
  exija, y se resuelven como en la vida real, con `git add` y `git commit`.
