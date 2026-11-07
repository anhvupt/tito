export const USAGE_SCENARIOS = Object.freeze([
  {
    id: "ordinary",
    mode: "agent",
    prompt: "What does this repository do? Answer in one short paragraph.",
  },
  {
    id: "plan",
    mode: "plan",
    prompt: "Propose a plan for how a newcomer should learn this repository. Do not produce source code.",
  },
  {
    id: "tito",
    mode: "agent",
    prompt: "/tito Should I start with inspect or with a plan? Reply as coordinator only; do not launch any writer.",
  },
]);
