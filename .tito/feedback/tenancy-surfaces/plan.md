# tenancy-surfaces plan

Optional `product.tenancy` (`single` or `multi`) and `product.surfaces` (a list of `{ id }`). Missing fields stay valid. Schema version stays 1.

A plan that touches shared data includes only the kinds that apply: isolation, consistency, propagation, and permissions. The default layer is `[integration]`. `[e2e]` only when the plan names a browser journey. `[unit]` stays for logic that does not cross a surface.

Slice 1 is the parser, tests T1–T5, and this policy text.

Slice 2 is the init/upgrade walkthrough for unset fields (profile, screen language, tenancy, surfaces, default base). A blank answer skips that field. A non-TTY run needs flags. `--confirm` writes.

Slice 3 is discover/inspect suggesting tenancy, surfaces, and client-careful when the repo has outgrown the config. That suggestion is written only after the user agrees.
