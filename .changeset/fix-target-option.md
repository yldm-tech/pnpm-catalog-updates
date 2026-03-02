---
"pcu": patch
---

fix: resolve --target option not being applied to package checks (#82)

The `--target` CLI option was being ignored because `catalogCheckService.ts` only read the config file's target value. Now properly uses priority chain: CLI `--target` > config file > default ('latest').
