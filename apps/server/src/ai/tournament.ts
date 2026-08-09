import { FOOTBALLERS } from "../footballers.js";
import { DEFAULT_SETTINGS } from "../gameEngine.js";
import { runBotStrategySimulation } from "./simulations.js";
import type { BotDifficulty } from "@auction-eleven/shared";

const difficulties: BotDifficulty[] = ["Amateur", "Professional", "World Class", "Legendary"];
const matches = Math.max(1, Number.parseInt(process.argv[2] ?? "100", 10) || 100);
const results = difficulties.map(difficulty => runBotStrategySimulation({
  footballers: FOOTBALLERS,
  settings: { ...DEFAULT_SETTINGS, botDifficulty: difficulty, playerPoolMode: "mixed" },
  difficulty,
  matches,
  seed: 20260809
}));

console.table(results.map(result => ({
  difficulty: result.difficulty,
  matches: result.matches,
  completion: `${(result.completionRate * 100).toFixed(1)}%`,
  lineupScore: result.averageLineupScore.toFixed(2),
  budgetLeft: result.averageBudgetRemaining.toFixed(1),
  squadSize: result.averageSquadSize.toFixed(2),
  overpay: result.averageOverpayment.toFixed(2)
})));
