#!/usr/bin/env bash
#
# Assembles the demo site into an output directory (default: demo/_site).
#
# The demo deliberately runs the *published* package rather than a build of
# the working tree: a visitor who runs `npm install japan-calendar` must get
# the behaviour they just saw on the page. So the tarball is fetched from the
# registry at the version pinned in demo/pinned-version.txt, and that version
# is stamped into the page.
#
# Run: ./demo/build.sh [outdir]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="${1:-$here/_site}"
version="$(tr -d '[:space:]' < "$here/pinned-version.txt")"

# The version is substituted into the page with sed, so a stray `/` (or a
# leading `v`) would either break the substitution or quietly print a version
# that does not exist. Matched with bash's own `=~` rather than piping into
# `grep -q`: under `set -o pipefail` an early-exiting reader kills the writer
# with SIGPIPE and fails the pipeline precisely when the pattern matches.
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "demo/pinned-version.txt must contain a bare semver, got: '$version'" >&2
  exit 1
fi

# A fixed path under demo/, not mktemp -d.
#
# esbuild writes each module's path — relative to the output file — into the
# bundle as a comment, so a temp directory ends up baked into what gets
# published: the first deployed bundle carried 22 lines naming
# `/tmp/tmp.elSrzUwrDZ/...`. Two things follow, and the second is the one that
# matters. It leaks the build machine's scratch path into a public artifact,
# and it makes the build irreproducible — rebuilding here produced a bundle
# that differed from the deployed one in exactly those 22 comment lines, so
# "is the published page running the bytes I think it is?" could not be
# answered by comparing hashes. Anchoring the extract directory inside the
# repository makes those paths constant, and the answer becomes a diff.
work="$here/_work"
rm -rf "$work"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"

echo "fetching japan-calendar@$version from the registry"
# npm pack does not create its destination directory (npm/cli#4351), and a
# release workflow in a sibling project was once broken by exactly that.
mkdir -p "$work/tgz"
npm pack "japan-calendar@$version" --pack-destination "$work/tgz" > /dev/null

tarball="$work/tgz/japan-calendar-$version.tgz"
if [ ! -f "$tarball" ]; then
  echo "expected $tarball to exist after npm pack; got:" >&2
  ls -la "$work/tgz" >&2
  exit 1
fi

mkdir -p "$work/x"
tar -xzf "$tarball" -C "$work/x"

# Guard against silently shipping a page with no library in it. Checked with
# `test -f` rather than `tar -tzf | grep -q`: under `set -o pipefail` a
# short-circuiting reader kills the writer with SIGPIPE and fails the
# pipeline exactly when the pattern *does* match.
entry="$work/x/package/dist/esm/index.js"
for required in "$entry" "$work/x/package/LICENSE" "$work/x/package/NOTICE"; do
  if [ ! -f "$required" ]; then
    echo "missing from the published tarball: $required" >&2
    exit 1
  fi
done

# Verify the tarball really is the version we asked for, rather than trusting
# the filename npm chose.
packed_version="$(node -p "require('$work/x/package/package.json').version")"
if [ "$packed_version" != "$version" ]; then
  echo "tarball declares version $packed_version, expected $version" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out/vendor"

# The published package ships tsc output — a directory of ES modules with
# relative specifiers — not a single file, so it is bundled here. esbuild is
# already a devDependency (the Worker build uses it), and it runs from the
# repository root so that the local install is the one resolved.
(cd "$root" && npx --no-install esbuild "$entry" \
  --bundle --format=esm --platform=browser --log-level=warning \
  --outfile="$out/vendor/japan-calendar.js")

bundle="$out/vendor/japan-calendar.js"
if [ ! -s "$bundle" ]; then
  echo "esbuild produced no bundle at $bundle" >&2
  exit 1
fi

# Every module comment esbuild emits must name a path inside the repository.
#
# The check is written against what the failure actually looks like, not what
# it sounds like. Reverting to `mktemp -d` does not produce an absolute path in
# the bundle — esbuild makes it relative to the output file, so it comes out as
# `// ../../../tmp/tmp.XXXX/...`. A guard matching only `^// /` therefore passed
# straight through the very regression it was added for; this one was caught by
# re-introducing the bug and watching the guard stay quiet.
#
# Counted into a variable rather than piped into `grep -q`: under
# `set -o pipefail` an early-exiting reader kills the writer with SIGPIPE and
# fails the pipeline exactly when the pattern matches. The `|| true` is for
# grep's exit status 1 on zero matches, which is the good case.
escaping="$(grep -c -E '^// (\.\./|/)' "$bundle" || true)"
if [ "$escaping" != "0" ]; then
  echo "the bundle names $escaping module path(s) outside the repository:" >&2
  grep -m 3 -E '^// (\.\./|/)' "$bundle" >&2 || true
  echo "the extract directory must stay inside the repository, so these stay stable" >&2
  echo "(otherwise the published bundle is irreproducible and leaks the build path)" >&2
  exit 1
fi

cp "$work/x/package/LICENSE" "$out/vendor/LICENSE.txt"
# Copied as .txt, not as the extensionless original: Pages serves an unknown
# extension as a download, so a visitor checking the attribution would get a
# file in their downloads folder instead of a page. Same reason the sibling
# project renames its PROVENANCE.md.
cp "$work/x/package/NOTICE" "$out/vendor/NOTICE.txt"

# Measured, not remembered: the page states this number, so recompute it on
# every build instead of letting a hand-written figure drift.
gzip_kb="$(gzip -9 -c "$bundle" | wc -c | awk '{printf "%.0f", $1/1024}')"

# Pages would otherwise run the output through Jekyll, which drops files and
# directories beginning with an underscore.
touch "$out/.nojekyll"

for file in index.html app.js style.css; do
  sed -e "s/__JC_VERSION__/$version/g" \
      -e "s/__BUNDLE_GZIP_KB__/$gzip_kb/g" \
      "$here/$file" > "$out/$file"
done

# A stale pin is the one way this page can quietly start lying, so say so
# loudly at build time rather than discovering it from a bug report.
latest="$(npm view japan-calendar version 2>/dev/null || true)"
if [ -n "$latest" ] && [ "$latest" != "$version" ]; then
  echo "::warning::demo/pinned-version.txt pins $version but the registry's latest is $latest — bump the pin"
  echo "WARNING: pinned $version, registry latest $latest" >&2
fi

echo "built $out (japan-calendar $version, bundle ${gzip_kb}KB gzipped)"
