const KEY = "endless_worldle_stats_v1";

export function loadStats() {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    return { rounds: 0, wins: 0, totalGuessesOnWins: 0, streak: 0, bestStreak: 0 };
  }
  try { return JSON.parse(raw); }
  catch {
    localStorage.removeItem(KEY);
    return loadStats();
  }
}

export function saveStats(stats) {
  localStorage.setItem(KEY, JSON.stringify(stats));
}

export function resetStats() {
  localStorage.removeItem(KEY);
  return loadStats();
}

export function recordWin(stats, guessesThisRound) {
  stats.rounds += 1;
  stats.wins += 1;
  stats.totalGuessesOnWins += guessesThisRound;
  stats.streak += 1;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  saveStats(stats);
  return stats;
}

export function recordSkip(stats) {
  stats.rounds += 1;
  stats.streak = 0;
  saveStats(stats);
  return stats;
}

export function derivedStats(stats) {
  const winPct = stats.rounds ? Math.round((stats.wins / stats.rounds) * 100) : 0;
  const avgGuesses = stats.wins ? (stats.totalGuessesOnWins / stats.wins) : 0;
  return { winPct, avgGuesses };
}
