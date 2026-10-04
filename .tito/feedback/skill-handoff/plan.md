# skill-handoff plan

Before an approved slice is written, Tito lists installed skills in `.cursor/skills` and `.agents/skills` and reads only each skill's name and description. The implementation handoff names the skills the writer must read. The coordinator skill named `tito` is not a pick. If none match, the handoff says so and continues. If two skills conflict, Tito asks once.
