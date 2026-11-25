# Tools (not part of the site: only `web/` is published)

## Mission pictures

The stage wall, the stage strip and the story screens show one rendered picture per mission. They used to be drawn on every
visitor's device after every release; now the pictures of the built-in courses ship with the site (`web/stills/*.webp`) and the
page only fetches them.

* `node tools/picsig.js --check` — hashes exactly the declarations of `web/index.html` that can change a picture (worlds, shots,
  aircraft models, textures; see the CUT list in the tool) and compares it with the `PIC_SIG` constant in the page.
  `--write` updates the constant. The device cache and the shipped pictures are valid only for the build of the picture code that
  made them. Needs `typescript` (`npm i typescript`).
* `node tools/stills.js web/index.html web/stills` — renders every picture with the page's own picture code (headless Chromium,
  software GL, highest quality level) and writes the files plus the manifest (`#stillsMan` in the page).
  Needs `playwright`, `sharp`; set `THREE_JS=<three.min.js r128>` to avoid the CDN.

Release rule: after any change to the picture code run `picsig.js --write`, then `stills.js` (about 6 minutes), and commit the
pictures with the page. A page whose manifest does not match its `PIC_SIG` ignores the shipped pictures and draws them on the
device exactly as before, so a forgotten regeneration costs speed, never correctness.
