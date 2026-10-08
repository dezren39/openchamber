/**
 * What the user has settled on for an ambiguous phrase. A choice counts toward
 * its question's key; undoing an interpretation counts against the option it
 * came from. An option is learned once it leads by the threshold, so one
 * answer never changes the default on its own.
 */
export const learnedChoices = (feedback, { learnAfter = 3 } = {}) => {
  const tallies = new Map();
  for (const entry of feedback) {
    if (typeof entry?.key !== 'string' || typeof entry?.option !== 'string') continue;
    const delta = entry.accepted === 'corrected' ? 1 : entry.accepted === false ? -1 : 0;
    if (delta === 0) continue;
    const labels = tallies.get(entry.key) ?? new Map();
    labels.set(entry.option, (labels.get(entry.option) ?? 0) + delta);
    tallies.set(entry.key, labels);
  }
  const learned = {};
  for (const [key, labels] of tallies) {
    const [top, second] = [...labels].sort((a, b) => b[1] - a[1]);
    if (top && top[1] >= learnAfter && (!second || top[1] > second[1])) learned[key] = top[0];
  }
  return learned;
};
