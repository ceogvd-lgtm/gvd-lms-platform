/**
 * Pure scoring engine for Phase 13 Virtual Lab.
 *
 * Extracted as plain functions so the spec file exercises the math
 * directly, no Prisma / NestJS mocks needed. The service layer wires
 * the persistence around it.
 */

export interface ScoringStepConfig {
  stepId: string;
  description?: string;
  maxPoints: number;
  /** Mandatory steps score 0 when skipped (vs. optional steps which
   *  are simply absent from `stepsResult`). */
  isMandatory?: boolean;
  order?: number;
}

export interface SafetyItemConfig {
  safetyId: string;
  description?: string;
  /** Critical violations trigger a 20% penalty each. Non-critical are
   *  recorded for analytics but don't change the score. */
  isCritical?: boolean;
}

export interface ScoringConfig {
  steps: ScoringStepConfig[];
  safetyChecklist: SafetyItemConfig[];
  /** Percentage 0-100 required to pass. */
  passScore: number;
  /** Seconds — not used by the engine itself, but passed through for
   *  the UI's countdown. */
  timeLimit?: number | null;
}

export interface StepResult {
  stepId: string;
  isCorrect: boolean;
  isInOrder?: boolean;
}

export interface SafetyViolation {
  safetyId: string;
  timestamp?: number;
}

export interface ScoringResult {
  /** Points earned, post-penalty, clamped to [0, maxScore]. */
  finalScore: number;
  /** Sum of every step's `maxPoints` — the denominator. */
  maxScore: number;
  /** true when `finalScore / maxScore >= passScore / 100`. */
  passed: boolean;
  /** Per-step breakdown the UI uses for the post-lab timeline. */
  stepBreakdown: Array<{
    stepId: string;
    awarded: number;
    maxPoints: number;
    isCorrect: boolean;
    isInOrder: boolean;
    isMandatory: boolean;
    skipped: boolean;
  }>;
  /** Total points deducted for critical safety violations. */
  penalty: number;
  /** Copied through so the caller can persist/return together. */
  criticalViolations: string[];
}

/**
 * Compute the final score.
 *
 * Business rules (from Phase 13 spec):
 *   - `isCorrect` → award `maxPoints` for that step
 *   - `isInOrder` (on a correct step) → ×1.10 bonus
 *   - mandatory step missing from stepsResult → 0 for that step (still
 *     counts against the maxScore denominator though)
 *   - optional step missing → not counted in either numerator or
 *     denominator (rare — most builds mark every step mandatory)
 *   - each critical violation → subtract 20% of the pre-penalty base
 *   - result clamped to 0 minimum
 */
export function calculateFinalScore(
  stepsResult: StepResult[],
  safetyViolations: SafetyViolation[],
  config: ScoringConfig,
): ScoringResult {
  const byId = new Map(stepsResult.map((s) => [s.stepId, s]));
  const safetyById = new Map(config.safetyChecklist.map((s) => [s.safetyId, s]));

  let baseScore = 0;
  let maxScore = 0;
  const stepBreakdown: ScoringResult['stepBreakdown'] = [];

  for (const step of config.steps) {
    const mandatory = step.isMandatory ?? false;
    const result = byId.get(step.stepId);

    if (result === undefined) {
      // No action recorded — skipped.
      if (mandatory) {
        // Mandatory step skipped → 0 earned but still counts vs maxScore.
        maxScore += step.maxPoints;
        stepBreakdown.push({
          stepId: step.stepId,
          awarded: 0,
          maxPoints: step.maxPoints,
          isCorrect: false,
          isInOrder: false,
          isMandatory: true,
          skipped: true,
        });
      } else {
        // Optional step skipped — not counted at all. Emit a row
        // anyway so the UI can render "chưa làm" for transparency.
        stepBreakdown.push({
          stepId: step.stepId,
          awarded: 0,
          maxPoints: 0,
          isCorrect: false,
          isInOrder: false,
          isMandatory: false,
          skipped: true,
        });
      }
      continue;
    }

    maxScore += step.maxPoints;
    let awarded = 0;
    if (result.isCorrect) {
      awarded = step.maxPoints;
      if (result.isInOrder) awarded = Math.round(awarded * 1.1 * 100) / 100;
    }
    baseScore += awarded;

    stepBreakdown.push({
      stepId: step.stepId,
      awarded,
      maxPoints: step.maxPoints,
      isCorrect: result.isCorrect,
      isInOrder: result.isInOrder === true,
      isMandatory: mandatory,
      skipped: false,
    });
  }

  // Apply penalties for critical violations — 20% of pre-penalty base
  // per violation, so N criticals subtract N * 0.2 * baseScore.
  const criticalViolations: string[] = [];
  for (const v of safetyViolations) {
    const item = safetyById.get(v.safetyId);
    if (item?.isCritical) criticalViolations.push(v.safetyId);
  }
  const penalty = criticalViolations.length * baseScore * 0.2;
  const rawFinal = baseScore - penalty;
  const finalScore = Math.max(0, Math.round(rawFinal * 100) / 100);

  const ratio = maxScore > 0 ? finalScore / maxScore : 0;
  const passed = ratio * 100 >= config.passScore;

  return {
    finalScore,
    maxScore,
    passed,
    stepBreakdown,
    penalty: Math.round(penalty * 100) / 100,
    criticalViolations,
  };
}
