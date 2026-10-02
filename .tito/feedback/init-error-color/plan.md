`tito init` errors are red on a terminal. Success output, the preview, and help stay plain. Inspect, upgrade, and admin stderr stay plain.

When stderr is not a terminal, or `NO_COLOR` is set, the error text stays plain. The message itself does not change. A conflict is still `conflict: ...`. Color wraps that line and then resets.
