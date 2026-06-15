# FTML source notice

This directory contains a WebAssembly build of FTML:

- Project: https://github.com/scpwiki/ftml
- Source commit: `31566bbfa013a8e28cf9e35ba22c4ae6a75dabfa`
- Package version: `1.32.2`
- License: GNU Affero General Public License v3 or later

The build uses `wasm-pack build --target web --release` and pins the transitive
`time` dependency to `0.3.44` for compatibility. See
`scripts/build-ftml.ps1` in the WikitDB source tree for the reproducible build
command.
