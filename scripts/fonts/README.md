# Font recipes

`fragment-sans.py` builds the fragment sans,
`app/fonts/ibm-plex-sans/ibm-plex-sans-latin-peso.woff2` ("SSC Fragment Sans"),
from the two IBM Plex Sans files the boards pin in `docs/boards/fonts/`: the
`latin` and `latin-ext` entries of `google.css`. It checks both files against
their SHA-256 before it reads them. The recipe:

1. grafts U+20B1, the peso sign, from the Latin Extended file into the Latin
   file: its outline and hinting instructions, its advance, its `gvar`
   variations and its `HVAR` advance deltas;
2. limits the weight axis to 400 to 600 with `fontTools.varLib.instancer`,
   which keeps the hinting (`fpgm`, `prep`, `cvt `, `cvar`), `GDEF`, `GPOS`,
   `GSUB`, `fvar`, `gvar`, `HVAR`, `MVAR` and `avar`;
3. renames every name-table string that contains "Plex" (the OFL's Reserved
   Font Name) to "SSC Fragment Sans" or "SSCFragmentSans", keeping the
   copyright (ID 0) and the licence URL (ID 14) as the Latin file has them;
4. writes WOFF2 with the Latin file's `head` timestamps, so the same inputs give
   the same bytes on any day.

## The environment

The bytes depend on the fontTools and Brotli versions, so the environment is
pinned: CPython 3.12 with `fonttools==4.69.1` and `brotli==1.2.1`, installed
from `requirements.txt` with `--require-hashes`. It lives outside the
repository and outside `node_modules`; nothing here touches the npm
dependencies. The recipe exits with status 2, naming the difference, when it
runs anywhere else.

The default location is `~/.cache/studiosc-portfolio/fonts-venv` (under
`$XDG_CACHE_HOME` when that is set); `FONTS_VENV` names another. With
[uv](https://docs.astral.sh/uv/), from the repository root:

```sh
FONTS_VENV="${FONTS_VENV:-${XDG_CACHE_HOME:-$HOME/.cache}/studiosc-portfolio/fonts-venv}"
uv venv --python 3.12 "$FONTS_VENV"
uv pip install --python "$FONTS_VENV/bin/python" --require-hashes \
  -r scripts/fonts/requirements.txt
"$FONTS_VENV/bin/python" -I scripts/fonts/fragment-sans.py
```

Without uv, `python3.12 -m venv "$FONTS_VENV"` and
`"$FONTS_VENV/bin/pip" install --require-hashes -r scripts/fonts/requirements.txt`
make the same environment.

The script writes the committed path by default (`--out` writes elsewhere) and
prints the size and SHA-256. That SHA-256 is D16's built hash in
`docs/boards/deviations.md`.

## The checks

`e2e/design-tokens.spec.ts` holds the recipe to the committed file:

- `the fragment sans rebuilds from the board pins` runs the recipe twice in the
  pinned environment and compares both outputs with the committed file, byte
  for byte. Where the environment is missing it skips, naming what is missing;
  a recipe error or a byte mismatch fails it.
- `the committed fragment sans matches the recorded recipe hash` runs on every
  build: the committed file's SHA-256 must be D16's.
