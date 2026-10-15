#!/usr/bin/env bash
# Runs a command in a pseudo-terminal, for an agent whose shell has none. pnpm asks for npm's 2FA
# only in a terminal, and refuses without one (ERR_PNPM_OTP_NON_INTERACTIVE). The terminal's input
# stays open but empty until the command ends: `script` passes an end of input on, which could
# end a prompt. Exits with the command's status.
#
#   .claude/skills/release/terminal.sh vp run release 1.0.0-rc.2 --yes
set -euo pipefail
if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [<argument>...]" >&2
  exit 2
fi
shell=$$
input() { while kill -0 "$shell" 2>/dev/null; do sleep 5; done; }
if [ "$(uname)" = Darwin ]; then
  exec script -q /dev/null "$@" < <(input)
else
  exec script -qec "$(printf '%q ' "$@")" /dev/null < <(input)
fi
