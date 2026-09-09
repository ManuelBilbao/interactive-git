# Git interactivo

Un sitio para aprender los comandos básicos de git escribiéndolos, al estilo de
[Learn Git Branching](https://learngitbranching.js.org/), pero enfocado en el
flujo de todos los días: `add`, `commit`, `status`, `restore`, ramas, y el ida y
vuelta con un servidor.

No hay ningún git de verdad atrás: hay un simulador escrito en JavaScript que
modela el repositorio, el stage y el remoto, y que responde con los mismos
mensajes que git. Cuando algo falla, aparece el error de git y al lado una
tarjeta que explica qué pasó y cómo seguir.

La terminal habla en castellano, igual que git de verdad cuando corre con `LANG`
en español. Las palabras clave quedan en inglés: commit, stage, push, pull,
merge.

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:5173
```

Para revisar el build:

```bash
npm run build    # deja el sitio en dist/
npm run preview
```

## Publicar en GitHub Pages

Ya está el workflow (`.github/workflows/deploy.yml`): cada push a `main` corre
los tests, hace el build y publica. Si algo falla, no publica nada.

La primera vez hay que hacer tres cosas:

1. Crear el repositorio en GitHub y subir `main`:

   ```bash
   gh repo create <usuario>/<repo> --public --source=. --remote=origin --push
   ```

   o, si el repo ya existe:

   ```bash
   git remote add origin git@github.com:<usuario>/<repo>.git
   git push -u origin main
   ```

2. En **Settings → Pages**, poner **Source: GitHub Actions**. (Con *Deploy from
   a branch* no funciona: el sitio se arma en el workflow, no está commiteado.)

3. Esperar el primer deploy. Queda en
   `https://<usuario>.github.io/<repo>/`; para este repo,
   <https://manuelbilbao.github.io/interactive-git/>.

De ahí en adelante, publicar es hacer push. También se puede correr el workflow
a mano desde la pestaña **Actions**.

El build usa rutas relativas (`base: './'` en `vite.config.js`), así que anda
igual en la raíz de un dominio que en un subdirectorio como `/<repo>/`. Los
enlaces `?leccion=N` son query params, no rutas, así que no hace falta ninguna
configuración de SPA ni un `404.html`.

## Qué enseña

Veintidós lecciones, en orden, sobre estos comandos:

`git init`, `git clone`, `git status`, `git add`,
`git restore [--staged]`, `git commit -m`, `git diff [--staged]`,
`git log [--oneline]`, `git branch [-a] [-d]`, `git checkout [-b]`,
`git merge`, `git push [-u]`, `git pull`.

El detalle de cada lección está en [docs/lessons.md](docs/lessons.md).

`git <comando> --help` (o `-h`, o `git help <comando>`) muestra qué hace cada
comando y qué opciones acepta **acá**: es una ayuda reducida a propósito, y la
tarjeta que la acompaña manda a leer la de verdad en una terminal.

La terminal también acepta `ls`, `cd`, `cat`, `touch`, `rm`, `echo`, `pwd`,
`clear` y `help`, para moverse y mirar archivos sin salir del teclado. `cd` hace
falta de verdad: `git clone` crea la carpeta pero deja al usuario afuera, como en
git de verdad. Lo mismo se puede
hacer con el panel **Archivos**, que hace las veces de editor de texto.

## Métricas

El sitio mide cuatro cosas, y nada más: **cuánta gente lo usa**, **cuánta
termina cada lección**, **cuántas pistas abrió antes de terminarla** y **cuánto
le llevó**. Las recibe [GoatCounter](https://www.goatcounter.com/), que no usa
cookies ni guarda nada que identifique a una persona, así que no hace falta
ningún cartel de consentimiento.

No se manda nada de lo que la persona escribe: ni los comandos, ni los archivos,
ni los errores. El evento es el id de la lección, un número de pistas y un rango
de tiempo.

El panel está en <https://manuelbilbao.goatcounter.com>. **Total unique
visitors** es la primera métrica; las otras tres están en **Events**, con un
prefijo cada una:

```
leccion/03-add                 119     ← cuánta gente terminó la lección 3
pistas/03-add/0-de-4            71     ← de esa gente, cuántos no abrieron ninguna
pistas/03-add/4-de-4            12     ← y cuántos llegaron a mostrar la solución
tiempo/03-add/2-30s-1m          44     ← cuánto les llevó
tiempo/03-add/4-2-5m            18
```

Un evento de GoatCounter es una ruta y nada más —no hay dónde poner un número—,
así que el valor viaja en la ruta. De ahí las dos decisiones que se notan al
mirar el panel:

- Las pistas se informan como `2-de-4`, con el total, porque el número solo no
  dice nada: dos pistas es la mitad en una lección que tiene cuatro y es la
  solución en una que tiene dos. `4-de-4` es siempre "mostró la solución".
- El tiempo cae en un rango (`1-hasta-30s`, `2-30s-1m`, `3-1-2m`, `4-2-5m`,
  `5-5-10m`, `6-10-20m`, `7-mas-20m`). Van numerados para que ordenen bien: sin
  el número el panel los lista `1-2m`, `10-20m`, `2-5m`.

El reloj **no cuenta el tiempo con la pestaña en segundo plano**, así que alguien
que deja el sitio abierto y se va a almorzar no ensucia el promedio. Empieza de
cero en cada lección y en cada **Reiniciar**.

Cada persona cuenta una sola vez por lección, aunque la repita, vuelva otro día o
toque **Reiniciar progreso**. Eso vale también para las pistas y el tiempo: una
segunda vuelta ya contesta otra pregunta, y promediarla haría quedar a todas las
lecciones más fáciles de lo que son.

Para bajar los números y hacer cuentas de verdad está el export a CSV del panel,
o su API. Las lecciones van numeradas (`03-add`) para que el CSV quede ordenado
en el orden en que se dan.

### Configuración

Todo vive en `SITE`, arriba de todo en `src/analytics.js`:

```js
const SITE = 'manuelbilbao'
```

Vacío apaga las métricas por completo —no se carga ningún script ni se hace
ningún pedido—, que es lo que quiere un fork del repositorio. En `npm run dev`
tampoco cuenta nada, incluso con `SITE` puesto: el script de GoatCounter se niega
a contar en localhost.

## Estructura

```
src/
  ansi.js            colores: el motor los emite, la terminal los pinta
  engine/            el simulador de git (no sabe nada de React)
    messages.js      catálogo de mensajes al estilo gettext: msg('On branch {branch}')
    model.js         el "mundo": archivos, repositorio local, remoto
    status.js        la comparación entre commit, stage y carpeta
    workdir.js       cambiar de snapshot sin pisar trabajo sin guardar
    parser.js        de una línea de texto a tokens
    errors.js        GitError: mensaje de git + clave de la pista traducida
    diff.js          comparar dos snapshots, con formato de `git diff`
    merge.js         juntar dos versiones de un archivo, línea por línea
    commands/        un archivo por familia de comandos
  analytics.js       las métricas del curso, vía GoatCounter
  lessons/index.js   las lecciones: setup y condición de victoria
  i18n/              proveedor de traducciones y locales
    locales/es-AR.json
  components/        la interfaz
  styles/app.css
public/favicon.svg   el logo del header, redibujado para 16px
docs/                arquitectura y catálogo de lecciones
scripts/             chequeos de render y de navegador, y el extractor de mensajes
test/                tests del simulador, de las lecciones y del grafo
```

## Tests

```bash
npm test             # simulador + lecciones + i18n + grafo + métricas + render
npm run check:render # sólo el render de los componentes
npm run check:browser  # end to end en Chrome (requiere `npm run dev` corriendo)
```

`npm test` corre los tests unitarios y después renderiza todos los componentes
en Node. `check:browser` abre el sitio en un Chrome headless y escribe comandos
en la terminal como lo haría una persona; si tu Chrome está en otro lado, pasale
la ruta con `CHROME_PATH`.

Cada lección tiene un test que la resuelve de punta a punta, así que si agregás
una lección imposible de completar, el test te lo dice.

## Agregar una lección

1. Agregá una entrada en `src/lessons/index.js` con `id`, `commands`, `setup` y
   `check`. `setup` devuelve el mundo inicial; `check(world, history)` decide si
   se cumplió el objetivo. Después sumá su `id` a la lista `ORDER` del mismo
   archivo, que es la que define el orden del curso.

   `commands` no se muestra: es metadata de qué enseña la lección. Con eso los
   tests verifican que ninguna lección necesite un comando que se enseña más
   adelante, y que la última pista nombre alguno de ellos.
2. Agregá los textos en `src/i18n/locales/es-AR.json`, bajo `lessons.<id>`:
   `title`, `intro` (lista de párrafos), `goal`, `hints` (lista) y opcionalmente
   `note`. Poné al menos dos pistas, de lo general a lo concreto, y dejá el
   comando exacto para la última: es la que se ofrece como *Mostrar solución*.
3. Agregá una solución en `test/lessons.test.js`. El test falla si falta.

En los textos podés usar `` `código` ``, `**negrita**` y bloques con triple
backtick, uno por línea, para las soluciones de varios comandos. `{repoUrl}` se
reemplaza por la URL del repositorio del curso, que vive en una sola constante
(`COURSE_REPO_URL`) para que la prosa no se desincronice del servidor simulado.

## Agregar un idioma

1. Copiá `src/i18n/locales/es-AR.json` a, por ejemplo, `en.json` y traducilo.
2. Registralo en `src/i18n/locales/index.js`.

El selector de idioma aparece solo cuando hay más de uno. Los tests de i18n
verifican que no falte ninguna pista.

El bloque `git` de ese archivo es aparte: es el catálogo de la salida de la
terminal, con el texto en inglés como clave, igual que hace gettext. Cada idioma
trae el suyo, y la terminal usa el del idioma activo. Para regenerar la lista de
mensajes que hay que traducir:

```bash
node scripts/extract-messages.mjs
```

Lo que falte queda en inglés, nunca en blanco. Los tests fallan si sobra o falta
alguna entrada, o si una traducción se come un `{parámetro}`.

## Convenciones

- **El código, los identificadores y los comentarios están en inglés.** Las
  palabras clave de git (`commit`, `push`, `pull`, `merge`, `stage`) se dejan en
  inglés también en los textos en castellano, porque es como se las nombra.
- **La salida de la terminal se traduce, pero los mensajes de commit no**: eso
  último es contenido del repositorio, no salida, y git tampoco lo traduce.
- Las pistas que citan una sección de `git status` no la escriben a mano: usan
  parámetros como `{gitUntracked}`, así siguen siendo correctas en los dos
  idiomas.
- Los textos del sitio están en castellano rioplatense (voseo).
- `docs/architecture.md` está en inglés porque describe el código;
  `docs/lessons.md` está en castellano porque describe el curso.

## El recorrido guiado

La primera vez que alguien abre el sitio arranca un recorrido que muestra para
qué es cada panel. Se sale con **Saltar** o llegando al final, y queda siempre a
mano en **¿Cómo funciona?**, arriba a la derecha. Clickear fuera no lo cierra:
se sale por sus botones, o con Escape.

Los pasos están en `STEPS`, en `src/components/Tour.jsx`: cada uno nombra una
región por selector, y los textos viven en `tour.steps.<id>` del archivo de
idioma. Un paso cuya región no está en pantalla se saltea solo.

## Enlaces directos

`?leccion=N` abre una lección puntual, por ejemplo
`http://localhost:5173/?leccion=12`. Sirve para mandar una lección específica a
la clase.
