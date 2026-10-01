# workflow-gates plan

The workflow is Discover → Plan → Human Approval → Code → Verify → Docs gate → Review.

Discover restates the goal and what is out of scope in one or two sentences, then asks whether that is what the user wants, and waits. After confirmation, Tito asks one batch of 3 to 5 clarifying questions. Each question offers options and a recommended default. `solo-fast` does only the intent check, plus questions about real ambiguity. `client-careful` and `solo-balanced` use the full batch. One obvious reading still continues, after a one-line confirmation. This replaces asking one "Did you mean" question. Tito still asks before locking a technical decision or a product-vision change. After the user answers, the plan records that decision and includes guidance code when it removes implementation ambiguity.

Every plan has one approval and four sections: Decisions, Test cases, Docs impact, and Slices and branch. Each decision names the principle behind it and the project convention it follows, with where that convention lives. Each test case has an ID and a layer tag `[unit]`, `[integration]`, or `[e2e]`. Behavior tests use Arrange / Act / Assert. Edge cases are one line each. Docs impact names which existing docs change, plus suggested new docs. The approved plan is the spec.

The coding sub-agent writes the approved tests first, confirms they fail, then implements until they pass. A test added beyond the approved list is flagged as new. A bug fix starts with a test that reproduces the bug.

Verify reports each approved test ID as passing or failing, plus lint and build.

Docs named in Docs impact are updated, or the user waives them, before Tito offers to open a pull request. After a finished module, Tito schedules the tech docs writer and then the user docs writer for larger docs, one at a time, unless the user waives that handoff.

The short code-review walkthrough stays. Review fixes still go into one plan named `review/<slug>` on the same branch.

For a single slice, the user may say "skip test discussion" or "skip docs", in the same spirit as skipping the plan.

Tenancy testing and the debt and upgrade playbook are later plans.
