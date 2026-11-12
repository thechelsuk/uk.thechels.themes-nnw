#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
REPO_SLUG="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo "Missing VERSION argument"
  exit 1
fi

if [[ -z "$REPO_SLUG" ]]; then
  echo "Missing REPO_SLUG argument (owner/repo)"
  exit 1
fi

# Templates are committed with script references only; inline the shared scripts before packaging.
"$(dirname "${BASH_SOURCE[0]}")/inject-template-scripts.sh"

# NetNewsWire 7.3+ reads template7.3.html, which adds the article media tags; build it from the injected template.
"$(dirname "${BASH_SOURCE[0]}")/make-template-7.3.sh"

mkdir -p dist
shopt -s nullglob
THEME_DIRS=( *.nnwtheme )

if [[ ${#THEME_DIRS[@]} -eq 0 ]]; then
  echo "No .nnwtheme directories found in repository root"
  exit 1
fi

rm -f dist/*.zip
RELEASE_BODY_FILE="dist/release_body.md"
NNW_LINKS=""
LAST_COMMIT_MESSAGE="$(git log -1 --pretty=%B | awk 'NR == 1 { sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, ""); if (match($0, /[.!?][[:space:]]/)) $0 = substr($0, 1, RSTART); print; exit }')"

{
  echo
  echo  $LAST_COMMIT_MESSAGE
  echo
  echo "## Themes"
  echo
} > "$RELEASE_BODY_FILE"

for THEME_DIR in "${THEME_DIRS[@]}"; do
  THEME_NAME="${THEME_DIR%.nnwtheme}"
  ZIP_NAME="${THEME_NAME}.zip"
  ZIP_PATH="dist/$ZIP_NAME"
  ZIP_URL="https://github.com/${REPO_SLUG}/releases/download/v${VERSION}/${ZIP_NAME}"
  NNW_LINK="netnewswire://theme/add?url=$ZIP_URL"

  zip -r "$ZIP_PATH" "$THEME_DIR"

  # Ensure each zip only contains the matching .nnwtheme root directory.
  ROOT_ENTRIES="$(zipinfo -1 "$ZIP_PATH" | awk -F/ 'NF {print $1}' | sort -u)"
  ROOT_COUNT="$(printf '%s\n' "$ROOT_ENTRIES" | sed '/^$/d' | wc -l | tr -d ' ')"
  FIRST_ROOT="$(printf '%s\n' "$ROOT_ENTRIES" | sed -n '1p')"
  if [[ "$ROOT_COUNT" -ne 1 || "$FIRST_ROOT" != "$THEME_DIR" ]]; then
    echo "Invalid zip structure in $ZIP_PATH"
    echo "Expected single root: $THEME_DIR"
    echo "Found roots: $ROOT_ENTRIES"
    exit 1
  fi

  {
    echo "### $THEME_NAME"
    echo
    printf -- '- Download [%s](%s) to install this theme.\n' "$ZIP_NAME" "$ZIP_URL"
    echo
  } >> "$RELEASE_BODY_FILE"

  NNW_LINKS+="- $THEME_NAME: $NNW_LINK"$'\n'
done

{
  echo "## NetNewsWire Install Links"
  echo
  printf "%s" "$NNW_LINKS"
} >> "$RELEASE_BODY_FILE"
