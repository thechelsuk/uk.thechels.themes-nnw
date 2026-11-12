#!/usr/bin/env bash
set -euo pipefail

# make-template-7.3.sh
# Writes template7.3.html next to each theme's template.html.
#
# NetNewsWire 7.3 and later read template7.3.html instead of template.html when a theme has one, and
# older versions ignore it. The 7.3 copy adds the article media tags around the body:
#
#   primary_media  above the body (a video, else audio with the article's image, else the image)
#   enclosures     below the body (the other audio, video and images)
#
# Both go outside .articleBody, so theme rules such as `.articleBody > p:first-child` keep working.
# Without an enclosures tag, NetNewsWire 7.3 wraps the body in a <div> and appends the enclosures to it.
# The tags are never written into template.html, because older versions would show them as text.
#
# Run after inject-template-scripts.sh, so the copy has the inlined scripts too.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PRIMARY_TAG='[[primary_media]]'
ENCLOSURES_TAG='[[enclosures]]'

fail() {
    echo "[ERROR] $1" >&2
    exit 1
}

count=0
while IFS= read -r template_file; do
    theme_dir="$(dirname "$template_file")"
    output_file="$theme_dir/template7.3.html"

    if grep -qF -e "$PRIMARY_TAG" -e "$ENCLOSURES_TAG" "$template_file"; then
        fail "$template_file contains a 7.3-only tag; keep those out of template.html"
    fi

    body_lines="$(grep -c 'id="bodyContainer"[^>]*>\[\[body\]\]</div>' "$template_file" || true)"
    if [[ "$body_lines" -ne 1 ]]; then
        fail "$template_file needs exactly one <div id=\"bodyContainer\" ...>[[body]]</div> line (found $body_lines)"
    fi

    # Keep the line's indentation; give each new block the user's text size, as the body has.
    perl -pe '
        if (/^(\s*)(<div id="bodyContainer"[^>]*>\[\[body\]\]<\/div>)\s*$/) {
            $_ = "$1<div class=\"articlePrimaryMedia [[text_size_class]]\">[[primary_media]]</div>\n"
               . "$1$2\n"
               . "$1<div class=\"articleEnclosures [[text_size_class]]\">[[enclosures]]</div>\n";
        }
    ' "$template_file" > "$output_file"

    for tag in "$PRIMARY_TAG" "$ENCLOSURES_TAG"; do
        if [[ "$(grep -cF "$tag" "$output_file")" -ne 1 ]]; then
            fail "$output_file should contain $tag exactly once"
        fi
    done

    echo "[INFO] Wrote $output_file"
    count=$((count + 1))
done < <(find "$PROJECT_ROOT" -maxdepth 2 -type f -path "*.nnwtheme/template.html" | sort)

if [[ $count -eq 0 ]]; then
    fail "No template.html files found"
fi

echo "[INFO] Wrote template7.3.html for $count theme(s)"
