/** Welcome copy. The screen shows these beats at once. Enter the sea opens the gate. */
export const PRACTICE_LINE = "Stake 1 USDC into the pool to enter. There is no practice sea.";

export const INTRO_MS = 3600;

export type IntroBeat = {
  id: string;
  kicker: string;
  title: string;
  body: string;
};

export const INTRO: readonly IntroBeat[] = [
  {
    id: "title",
    kicker: "Shoal",
    title: "FISH",
    body: "Big fish bite little fish.",
  },
  {
    id: "sea",
    kicker: "One sea",
    title: "No clock.",
    body: "Every fish shares the map. A stake locks when you swim. Leave after 5 quiet seconds.",
  },
  {
    id: "mouth",
    kicker: "The mouth",
    title: "Bite in front.",
    body: "Click the sea to bite a fish in front of the mouth. A fish behind you is out of reach. Space bursts for one second. Both return in a few seconds.",
  },
  {
    id: "hold",
    kicker: "Hold",
    title: "W A S D move.",
    body: "W swims forward. S backs up. A and D turn, so the fish arcs. Let go and it glides. X holds still. The fish stays on the level plane.",
  },
  {
    id: "grow",
    kicker: "Grow",
    title: "Meals change the body.",
    body: "Eat enough and the fish grows. One shape can change. The tier stays. A kill does not mint a new fish. A live spring is a plus on the radar. Small fish can hide in a reef or a cave.",
  },
  {
    id: "enter",
    kicker: "Six species",
    title: "A coin flip.",
    body: "A Shoal fish mint starts at Bubble. Two heads climb one tier. The chain also flips swift, fang, or hide. The sea wears that model. Stake 1 USDC to enter.",
  },
];

/** The played rules, without the title card or the closing line. */
export const STORY: readonly IntroBeat[] = INTRO.slice(1, -1);

export function introIndex(step: number): number {
  if (step < 0) return 0;
  if (step >= INTRO.length) return INTRO.length - 1;
  return step;
}
