# Tools (not part of the site: only `web/` is published)

## Mission pictures

The stage wall, the stage strip and the story screens show one rendered picture per mission. They used to be drawn on every
visitor's device after every release; now the pictures of the built-in courses ship with the site (`web/stills/*.webp`) and the
page only fetches them. They exist for **every aircraft** of the page (all planes and all drones), so whichever aircraft a trainee
picks in the hangar, the pictures are files and not a few seconds of drawing.

How a picture stays honest: it is valid only for the code that made it.

* `PIC_SIG` (in `web/index.html`) hashes the picture code that does not depend on the aircraft: the worlds, the shots, the textures
  and the renderer.
* `PIC_MSIG` holds one signature per aircraft (`plane.p51`, `quad.fs5`, ...): a fingerprint of the object the page builds for that
  aircraft (geometry, colours, materials, the numbers the shots read), taken in headless Chromium. A change to one aircraft
  therefore invalidates the pictures of that aircraft only.
* `#stillsMan` (also in the page) lists the pictures that exist (file stem and the three colours shown while a file loads), the
  signature of the world and the signature of each aircraft they were made with. The page uses a shipped picture only when both
  signatures match; otherwise it draws the picture on the device exactly as before (so a forgotten regeneration costs speed, never
  correctness).

Commands (run from the repository root; `NODE_PATH=/opt/npm-tools/node_modules` if the packages are installed there):

* `node tools/picsig.js web/index.html --check` — compares `PIC_SIG` and `PIC_MSIG` with the picture code and the aircraft.
  `--write` updates the constants. `--static` checks only `PIC_SIG` (no browser needed). `--list` prints the hashed declarations.
  Needs `typescript`; the aircraft part needs `playwright` and `THREE_JS=<three.min.js r128>` (without it three.js comes from its CDN).
* `node tools/stills.js web/index.html web/stills` — renders what is missing or stale and writes the files plus the manifest.
  A picture is kept when the page's `PIC_SIG` and the signature of ITS aircraft are the ones it was made with and the file exists,
  so after changing one aircraft only that aircraft's pictures are made again (about 2 minutes, 195 files); after a change to the
  world, the shots or the renderer all of them (about 25 minutes, 2,535 files, 27 MB). `--models=plane:p51,quad:fs5` limits the
  run to some aircraft, `--only=<regex on the file stem>` to some pictures, `--force` renders everything. The manifest is written
  after every aircraft, so an interrupted run loses at most one aircraft. Needs `playwright`, `sharp`.
* `tools/lib.js` is shared by the two: an instrumented copy of the page in headless Chromium (never written back) and the
  fingerprint code.

Release rule: after any change to the picture code or to an aircraft run `picsig.js --write`, then `stills.js`, and commit the
pictures with the page. The page's own header comment next to `PIC_SIG` explains which declarations count.
