# Theme Bundle for NetNewsWire

A collection of themes for [NetNewsWire](https://netnewswire.com/).

## Themes

- Fresh, a light theme, based on thechels.uk 'morning' theme
- Guro; a light mode only, clean and minimal.
- Thechelsuk; adaptive to device light/dark mode and is based on the thechels.uk website design
- Retro; dark-only theme, red text.
- Magda; dark-only theme, with gray text and custom fonts, for easy reading.
- Claudio; adaptive theme with warm charcoal or soft parchment backgrounds and a clay accent, using system fonts.
- Franco; adaptive theme based on Claudio with a blue accent, using system fonts.
- Micha; adaptive Bauhaus / geometric modernist theme with primary colours, a sticky detail rail on wide windows and numbered sections.
- Maika; adaptive Japanese minimalist theme with washi and sumi tones, a hanko seal from the feed's initial and a vertical scroll line.
- Sunjiyo; adaptive sunlit theme whose sky follows the hour a post was published, with an auto contents list and a progress dial.

## Install

1. Go to the [latest release](https://github.com/thechelsuk/uk.thechels.themes-nnw/releases/latest).
2. Download the `.zip` for your chosen theme, unzip it, and open the `.nnwtheme` file directly.

## Release a new version

1. Make changes inside the relevant `name.nnwtheme` folder (e.g. `guro.nnwtheme` or `thechelsuk.nnwtheme`).
2. Update the `Version` in `name.nnwtheme/Info.plist`.
3. Bump the version in `package.json`.
4. Commit and push to `main` — the release workflow runs automatically.

The workflow calls `scripts/build-release-artifacts.sh` to:

- Inline the shared scripts into each template (see below)
- Write each theme's `template7.3.html` for NetNewsWire 7.3 and later (see below)
- Package each `*.nnwtheme` folder into its own `name.zip`
- Validate that each zip contains only the correct `name.nnwtheme` root
- Publish a GitHub Release with all zips attached

Themes are only built in CI. Install themes from a release, not from the repository folders.

## Adding a new theme

1. Create a new `name.nnwtheme` folder in the repo root containing at minimum `Info.plist`, `stylesheet.css`, and `template.html`.
2. Add the script markers to `template.html` (see below).
3. Add a `test/name.html` page that links the theme's stylesheet and the source scripts. Copy the `<head>` of an existing preview page so it has a description, canonical URL, and Open Graph and X (Twitter) tags. Match the stylesheet path's capitalisation to the folder name exactly: GitHub Pages is case-sensitive, even though macOS isn't.
4. Add the preview page to `sitemap.xml`, and add the theme to the structured data and theme cards in `index.html` and to `llms.txt`.
5. No workflow changes needed — it discovers all `*.nnwtheme` folders automatically.

## Shared scripts

NetNewsWire themes cannot load external JavaScript, so shared scripts live once in `scripts/template-scripts/` and are inlined into every template at release time.

```text
scripts/
├── template-scripts/              # Shared JS (single source of truth)
│   ├── youtube-link-rewrite.js    # Inline YouTube embeds + "Open in extension.app" link
│   └── linker.js                  # Reference-style citations and a References list
├── inject-template-scripts.sh     # Inlines the scripts between the markers
├── make-template-7.3.sh           # Writes template7.3.html with the NetNewsWire 7.3 media tags
└── build-release-artifacts.sh     # CI: inject, write 7.3 templates, zip, write release notes
```

Committed templates only reference the scripts between markers:

```html
<!-- INJECT_SCRIPTS_BEGIN -->
<script src="youtube-link-rewrite.js"></script>
<script src="linker.js"></script>
<!-- INJECT_SCRIPTS_END -->
```

During the release, `inject-template-scripts.sh` replaces each `<script src>` with the file's contents. Nothing is inlined in the repository, so templates never go stale.

To add a shared script, create it in `scripts/template-scripts/` and add a `<script src="yourscript.js"></script>` line inside the markers of each template that needs it.

A theme-specific script (such as Claudio's reading time and progress bar) can be written inline in that theme's `template.html`, outside the markers.

## Feed media in NetNewsWire 7.3

NetNewsWire 7.3 can show audio, video and images from a feed's enclosures. It reads `template7.3.html` instead of `template.html` when a theme has one, and earlier versions ignore that file.

`scripts/make-template-7.3.sh` writes `template7.3.html` at release time. It copies `template.html` and adds the primary media tag above the body and the enclosures tag below it, outside `.articleBody`. Each template therefore needs exactly one `<div id="bodyContainer" …>[[body]]</div>` line. Keep the 7.3 tags out of `template.html`: earlier versions would show them as text. The script stops the release if it finds them anywhere in that file, comments included, because NetNewsWire 7.3 also looks for them anywhere.

Each `stylesheet.css` styles the media under an "Article media" heading. To check them in a browser, open `test/media-7.3.html?theme=Claudio` (or any theme name).

## Test locally

Open any `test/*.html` file in a browser. Test pages link the theme stylesheet and the source scripts directly, so no build is needed.

- `test/bluesky.html` mirrors a Bluesky RSS post: a plain-text body with scheme-less and repeated YouTube links.
- `test/youtube-url-cases.html` runs the YouTube script against a list of URL forms and edge cases and prints PASS or FAIL for each. Serve the repo root over http (e.g. `python3 -m http.server`) to open it, as it fetches the source script.

## Theme showcase

The repository root contains a small catalogue with screenshot previews and NetNewsWire install links. Select a screenshot to open the full live preview, including YouTube embeds and reference links. To view it locally, serve the repository root over HTTP (for example, `python3 -m http.server`) and open `http://localhost:8000/`.

The `Deploy theme showcase` workflow publishes the site to GitHub Pages when the showcase, preview assets, or a theme stylesheet changes. Enable GitHub Pages for the repository with **GitHub Actions** as the build and deployment source. The custom domain is `themes-nnw.thechels.uk`; point a Cloudflare CNAME record named `themes-nnw` to `thechelsuk.github.io`, then set the same hostname as the custom domain in the repository's Pages settings and enable HTTPS.

## YouTube embeds

YouTube rejects embeds that send no HTTP referrer (*Error 153*), and NetNewsWire sends none because articles load from a local base URL. The themes therefore embed videos via [embed.thechels.uk](https://github.com/thechelsuk/uk.thechels.embed), a static wrapper page that supplies the referrer.

If the wrapper does not report back within 10 seconds of the embed scrolling into view, the iframe is replaced with a thumbnail linking to the video on YouTube.
