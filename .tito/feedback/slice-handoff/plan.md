# slice-handoff plan

Do not merge a slice branch into `main`, `master`, `dev`, or `develop`, on the machine or on the remote, unless the user calls for that merge and the pull request already has an approval. Finishing a slice leaves the branch as it is.

When the user comments on an open pull request, Tito updates that pull request's description in the same turn. Review fixes lists every comment, including the earlier ones. A thread reply does not replace that update.
