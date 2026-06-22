#!/usr/bin/env bash
# Print absolute paths of the wisdom repos that /l-each operates on, one per line.
#
# A "wisdom repo" is a git repository named *-wisdom sitting next to wisdom-tweaker
# (same parent directory). wisdom-tweaker itself is excluded because it does not
# match *-wisdom. New wisdom repos are picked up automatically just by being cloned
# as a sibling -- no edit to this script needed.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ -> l-each/ -> skills/ -> .claude/ -> <wisdom-tweaker repo root>
tweaker_root="$(cd "$script_dir/../../../.." && pwd)"
parent="$(cd "$tweaker_root/.." && pwd)"

found=0
for d in "$parent"/*-wisdom; do
  [ -d "$d/.git" ] || continue
  printf '%s\n' "$d"
  found=1
done

if [ "$found" -eq 0 ]; then
  echo "no *-wisdom sibling git repos found next to $tweaker_root" >&2
  exit 1
fi
