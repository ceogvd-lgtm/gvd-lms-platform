import {
  calculateFinalScore,
  type ScoringConfig,
  type SafetyViolation,
  type StepResult,
} from './scoring-engine';

/**
 * Pure-function tests for the Phase-13 scoring engine.
 * No Prisma / Nest mocks — just math.
 */
describe('scoring-engine · calculateFinalScore', () => {
  const baseConfig: ScoringConfig = {
    steps: [
      { stepId: 's1', maxPoints: 10, isMandatory: true, order: 1 },
      { stepId: 's2', maxPoints: 20, isMandatory: true, order: 2 },
      { stepId: 's3', maxPoints: 30, isMandatory: true, order: 3 },
    ],
    safetyChecklist: [
      { safetyId: 'helmet', description: 'Đội mũ bảo hộ', isCritical: true },
      { safetyId: 'gloves', description: 'Đeo găng tay', isCritical: false },
    ],
    passScore: 70,
  };

  it('awards maxPoints per correct step, no bonus when isInOrder=false', () => {
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true, isInOrder: false },
        { stepId: 's2', isCorrect: true, isInOrder: false },
        { stepId: 's3', isCorrect: true, isInOrder: false },
      ],
      [],
      baseConfig,
    );
    expect(result.finalScore).toBe(60);
    expect(result.maxScore).toBe(60);
    expect(result.passed).toBe(true);
    expect(result.penalty).toBe(0);
  });

  it('gives 10% bonus on each isInOrder step', () => {
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true, isInOrder: true },
        { stepId: 's2', isCorrect: true, isInOrder: true },
        { stepId: 's3', isCorrect: true, isInOrder: true },
      ],
      [],
      baseConfig,
    );
    // 10*1.1 + 20*1.1 + 30*1.1 = 66
    expect(result.finalScore).toBe(66);
    expect(result.maxScore).toBe(60);
    expect(result.passed).toBe(true);
  });

  it('critical violation subtracts 20% of base score', () => {
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true, isInOrder: false },
        { stepId: 's2', isCorrect: true, isInOrder: false },
        { stepId: 's3', isCorrect: true, isInOrder: false },
      ],
      [{ safetyId: 'helmet' }],
      baseConfig,
    );
    // base = 60, penalty = 60 * 0.2 = 12, final = 48 → 80% >= 70 passScore
    expect(result.finalScore).toBe(48);
    expect(result.penalty).toBe(12);
    expect(result.passed).toBe(true);
    expect(result.criticalViolations).toEqual(['helmet']);
  });

  it('two critical violations subtract 40%', () => {
    const config: ScoringConfig = {
      ...baseConfig,
      safetyChecklist: [
        { safetyId: 'helmet', isCritical: true },
        { safetyId: 'harness', isCritical: true },
      ],
    };
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true },
        { stepId: 's2', isCorrect: true },
        { stepId: 's3', isCorrect: true },
      ],
      [{ safetyId: 'helmet' }, { safetyId: 'harness' }],
      config,
    );
    // base 60 → penalty 60*0.2*2 = 24 → final 36
    expect(result.finalScore).toBe(36);
    expect(result.penalty).toBe(24);
  });

  it('non-critical violations do not affect score', () => {
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true },
        { stepId: 's2', isCorrect: true },
        { stepId: 's3', isCorrect: true },
      ],
      [{ safetyId: 'gloves' }],
      baseConfig,
    );
    expect(result.finalScore).toBe(60);
    expect(result.penalty).toBe(0);
  });

  it('mandatory step skipped → 0 earned, still counts vs maxScore', () => {
    const result = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true },
        // s2 skipped
        { stepId: 's3', isCorrect: true },
      ],
      [],
      baseConfig,
    );
    expect(result.finalScore).toBe(40); // 10 + 30
    expect(result.maxScore).toBe(60);
    const breakdown = result.stepBreakdown.find((b) => b.stepId === 's2')!;
    expect(breakdown.skipped).toBe(true);
    expect(breakdown.awarded).toBe(0);
    expect(breakdown.isMandatory).toBe(true);
  });

  it('optional step skipped → not counted in either numerator or denominator', () => {
    const config: ScoringConfig = {
      ...baseConfig,
      steps: [
        { stepId: 's1', maxPoints: 10, isMandatory: true },
        { stepId: 's2', maxPoints: 20, isMandatory: false },
      ],
    };
    const result = calculateFinalScore([{ stepId: 's1', isCorrect: true }], [], config);
    expect(result.finalScore).toBe(10);
    expect(result.maxScore).toBe(10);
    expect(result.passed).toBe(true); // 10/10 = 100%
  });

  it('score >= passScore → passed=true', () => {
    const r = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true },
        { stepId: 's2', isCorrect: true },
        { stepId: 's3', isCorrect: false },
      ],
      [],
      baseConfig,
    );
    // 10 + 20 + 0 = 30 / 60 = 50% < 70 → failed
    expect(r.passed).toBe(false);
  });

  it('score < passScore → passed=false', () => {
    const r = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true },
        { stepId: 's2', isCorrect: true },
        { stepId: 's3', isCorrect: true },
      ],
      [],
      { ...baseConfig, passScore: 100 },
    );
    // 60/60 = 100% >= 100 → passed
    expect(r.passed).toBe(true);
  });

  it('critical violation can push below passScore', () => {
    const r = calculateFinalScore(
      [
        { stepId: 's1', isCorrect: true, isInOrder: false },
        { stepId: 's2', isCorrect: true, isInOrder: false },
        { stepId: 's3', isCorrect: true, isInOrder: false },
      ],
      [{ safetyId: 'helmet' }],
      { ...baseConfig, passScore: 90 },
    );
    // base 60, penalty 12, final 48 → 80% < 90 → failed
    expect(r.finalScore).toBe(48);
    expect(r.passed).toBe(false);
  });

  it('clamps final score at 0 when penalties exceed base', () => {
    const config: ScoringConfig = {
      ...baseConfig,
      safetyChecklist: Array.from({ length: 10 }, (_, i) => ({
        safetyId: `v${i}`,
        isCritical: true,
      })),
    };
    const violations: SafetyViolation[] = config.safetyChecklist.map((s) => ({
      safetyId: s.safetyId,
    }));
    const steps: StepResult[] = [
      { stepId: 's1', isCorrect: true },
      { stepId: 's2', isCorrect: true },
      { stepId: 's3', isCorrect: true },
    ];
    const r = calculateFinalScore(steps, violations, config);
    // base 60, penalty 60 * 0.2 * 10 = 120 → clamp to 0
    expect(r.finalScore).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('handles empty steps config gracefully', () => {
    const r = calculateFinalScore([], [], { ...baseConfig, steps: [] });
    expect(r.finalScore).toBe(0);
    expect(r.maxScore).toBe(0);
    expect(r.passed).toBe(false);
  });
});
