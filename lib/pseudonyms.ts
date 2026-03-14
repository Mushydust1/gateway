const adjectives = [
  "Aisle",
  "Window",
  "Captain",
  "Turbo",
  "Cloud",
  "Runway",
  "Jetstream",
  "Tailwind",
  "Cruising",
  "Terminal",
  "Boarding",
  "Skyline",
  "Altitude",
  "Taxiway",
  "Overhead",
  "Redeye",
  "Layover",
  "Standby",
  "Priority",
  "Express",
];

const nouns = [
  "Warrior",
  "Coffee",
  "Pretzel",
  "Nomad",
  "Wanderer",
  "Voyager",
  "Pilot",
  "Navigator",
  "Explorer",
  "Drifter",
  "Cruiser",
  "Sprinter",
  "Hopper",
  "Trekker",
  "Flyer",
  "Jetsetter",
  "Globetrotter",
  "Passenger",
  "Traveler",
  "Adventurer",
];

export function generatePseudonym(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}_${noun}`;
}
