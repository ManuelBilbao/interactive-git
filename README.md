# Git interactivo

Un sitio para aprender los comandos básicos de git escribiéndolos, al estilo de
[Learn Git Branching](https://learngitbranching.js.org/), pero enfocado en el
flujo de todos los días: `add`, `commit`, `status`, `restore`, ramas, y el ida y
vuelta con un servidor.

No hay ningún git de verdad atrás: hay un simulador escrito en JavaScript que
modela el repositorio, el stage y el remoto, y que responde con los mismos
mensajes que git. Cuando algo falla, aparece el error de git y al lado una
tarjeta que explica qué pasó y cómo seguir.

La terminal viene en castellano, igual que git de verdad cuando corre con
`LANG` en español. El switch **Terminal en castellano**, arriba a la derecha, la
pasa al inglés que se ve por defecto en la mayoría de las máquinas.

## Cómo correrlo

```bash
npm install
npm run dev      # http://localhost:5173
```

Para publicarlo:

```bash
npm run build    # deja el sitio en dist/
npm run preview  # para revisarlo antes de subirlo
```

El build usa rutas relativas (`base: './'` en `vite.config.js`), así que `dist/`
funciona tal cual en GitHub Pages o en cualquier carpeta de un servidor.

## Qué enseña

Diecisiete lecciones, en orden, sobre estos comandos:

`git init`, `git clone`, `git status`, `git add`,
`git restore [--staged]`, `git commit -m`, `git branch [-a]`,
`git checkout [-b]`, `git merge`, `git push [-u]`, `git pull`.

El detalle de cada lección está en [docs/lessons.md](docs/lessons.md).

La terminal también acepta `ls`, `cat`, `touch`, `rm`, `echo`, `pwd`, `clear` y
`help`, para crear y mirar archivos sin salir del teclado. Lo mismo se puede
hacer con el panel **Archivos**, que hace las veces de editor de texto.

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
    commands/        un archivo por familia de comandos
  lessons/index.js   las lecciones: setup y condición de victoria
  i18n/              proveedor de traducciones y locales
    locales/es-AR.json
  components/        la interfaz
  styles/app.css
docs/                arquitectura y catálogo de lecciones
scripts/             chequeos de render y de navegador, y el extractor de mensajes
test/                tests del simulador, de las lecciones y del grafo
```

## Tests

```bash
npm test             # simulador + lecciones + i18n + grafo + render
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
2. Agregá los textos en `src/i18n/locales/es-AR.json`, bajo `lessons.<id>`:
   `title`, `intro` (lista de párrafos), `goal`, `hints` (lista) y opcionalmente
   `note`.
3. Agregá una solución en `test/lessons.test.js`. El test falla si falta.

En los textos podés usar `` `código` `` y `**negrita**`.

## Agregar un idioma

1. Copiá `src/i18n/locales/es-AR.json` a, por ejemplo, `en.json` y traducilo.
2. Registralo en `src/i18n/locales/index.js`.

El selector de idioma aparece solo cuando hay más de uno. Los tests de i18n
verifican que no falte ninguna pista.

El bloque `git` de ese archivo es aparte: es el catálogo de la salida de la
terminal, con el texto en inglés como clave, igual que hace gettext. Para
regenerar la lista de mensajes que hay que traducir:

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

## Enlaces directos

`?leccion=N` abre una lección puntual, por ejemplo
`http://localhost:5173/?leccion=12`. Sirve para mandar una lección específica a
la clase.
