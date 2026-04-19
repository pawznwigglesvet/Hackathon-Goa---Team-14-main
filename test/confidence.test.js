/**
 * Unit tests for PR confidence scoring module
 *
 * Tests the new PR quality-based confidence calculation
 * Run with: npm test
 */

import {
  DefaultPRConfidenceCalculator,
  calculatePRConfidence,
  formatConfidenceBadge,
  formatConfidenceDetails,
} from '../src/agent/confidence.js';

import {
  analyzePRQuality,
  parseReviewerIssues,
  classifyIssueSeverity,
  calculateCodeQualityScore,
  IssueSeverity,
} from '../src/agent/pr-quality-analyzer.js';

describe('PR Quality Analyzer', () => {
  describe('classifyIssueSeverity', () => {
    it('should classify critical issues', () => {
      expect(classifyIssueSeverity('This has a security vulnerability')).toBe(IssueSeverity.CRITICAL);
      expect(classifyIssueSeverity('- SQL injection risk in query')).toBe(IssueSeverity.CRITICAL);
      expect(classifyIssueSeverity('🐛 Critical bug found')).toBe(IssueSeverity.CRITICAL);
    });

    it('should classify warnings', () => {
      expect(classifyIssueSeverity('This code has performance issues')).toBe(IssueSeverity.WARNING);
      expect(classifyIssueSeverity('- Warning: code duplication detected')).toBe(IssueSeverity.WARNING);
      expect(classifyIssueSeverity('⚠️ Refactor needed')).toBe(IssueSeverity.WARNING);
    });

    it('should classify suggestions', () => {
      expect(classifyIssueSeverity('Consider using const instead of let')).toBe(IssueSeverity.SUGGESTION);
      expect(classifyIssueSeverity('- Nit: fix typo in comment')).toBe(IssueSeverity.SUGGESTION);
      expect(classifyIssueSeverity('💡 Maybe add documentation')).toBe(IssueSeverity.SUGGESTION);
    });

    it('should default to suggestion for unknown', () => {
      expect(classifyIssueSeverity('This is some random text')).toBe(IssueSeverity.SUGGESTION);
    });
  });

  describe('parseReviewerIssues', () => {
    it('should parse bullet point issues', () => {
      const text = `
Some intro text

- Critical bug in authentication
- Warning: performance issue
- Suggest adding tests
`;
      const issues = parseReviewerIssues(text);

      expect(issues.length).toBe(3);
      expect(issues[0].severity).toBe(IssueSeverity.CRITICAL);
      expect(issues[1].severity).toBe(IssueSeverity.WARNING);
      expect(issues[2].severity).toBe(IssueSeverity.SUGGESTION);
    });

    it('should parse numbered list issues', () => {
      const text = `
1. Security vulnerability found
2. Consider refactoring
3. Add documentation
`;
      const issues = parseReviewerIssues(text);

      expect(issues.length).toBe(3);
    });

    it('should handle empty text', () => {
      expect(parseReviewerIssues('')).toEqual([]);
      expect(parseReviewerIssues(null)).toEqual([]);
    });

    it('should ignore markdown headers', () => {
      const text = `
# Title
## Subtitle
- Actual issue here
`;
      const issues = parseReviewerIssues(text);

      expect(issues.length).toBe(1);
    });
  });

  describe('calculateCodeQualityScore', () => {
    it('should start at 100 with no issues', () => {
      const result = calculateCodeQualityScore([]);

      expect(result.score).toBe(100);
      expect(result.totalIssues).toBe(0);
      expect(result.breakdown.critical).toBe(0);
    });

    it('should deduct points for critical issues', () => {
      const issues = [
        { severity: IssueSeverity.CRITICAL, weight: 20 },
        { severity: IssueSeverity.CRITICAL, weight: 20 },
      ];

      const result = calculateCodeQualityScore(issues);

      expect(result.score).toBe(60); // 100 - 40
      expect(result.breakdown.critical).toBe(2);
    });

    it('should deduct points for mixed severity', () => {
      const issues = [
        { severity: IssueSeverity.CRITICAL, weight: 20 },
        { severity: IssueSeverity.WARNING, weight: 5 },
        { severity: IssueSeverity.SUGGESTION, weight: 2 },
      ];

      const result = calculateCodeQualityScore(issues);

      expect(result.score).toBe(73); // 100 - 27
      expect(result.breakdown.critical).toBe(1);
      expect(result.breakdown.warnings).toBe(1);
      expect(result.breakdown.suggestions).toBe(1);
    });

    it('should not go below 0', () => {
      const issues = Array(10).fill({ severity: IssueSeverity.CRITICAL, weight: 20 });

      const result = calculateCodeQualityScore(issues);

      expect(result.score).toBe(0);
    });
  });

  describe('analyzePRQuality', () => {
    it('should analyze PR with issues', () => {
      const reviewerText = `
- Critical: SQL injection vulnerability
- Warning: Duplicate code
- Suggestion: Add comments
`;
      const result = analyzePRQuality(reviewerText);

      expect(result.success).toBe(true);
      expect(result.score).toBeLessThan(100);
      expect(result.totalIssues).toBe(3);
    });

    it('should handle clean PR', () => {
      const reviewerText = `
Great work! Code looks good.
No issues found.
`;
      const result = analyzePRQuality(reviewerText);

      expect(result.success).toBe(true);
      expect(result.score).toBe(100);
      expect(result.totalIssues).toBe(0);
    });
  });
});

describe('DefaultPRConfidenceCalculator', () => {
  let calculator;

  beforeEach(() => {
    delete process.env.CONFIDENCE_WEIGHT_CODE_QUALITY;
    delete process.env.CONFIDENCE_WEIGHT_USER_TRUST;
    calculator = new DefaultPRConfidenceCalculator();
  });

  describe('High confidence scenarios', () => {
    it('should score high for clean code and trusted user', () => {
      const codeQuality = {
        score: 100,
        totalIssues: 0,
        breakdown: { critical: 0, warnings: 0, suggestions: 0 },
        details: '',
      };

      const userTrust = {
        score: 90,
        commitsAnalyzed: 10,
        breakdown: {},
        details: '',
      };

      const result = calculator.calculate(codeQuality, userTrust);

      // (100 * 0.6) + (90 * 0.4) = 60 + 36 = 96
      expect(result.score).toBe(96);
    });
  });

  describe('Low confidence scenarios', () => {
    it('should score low for poor code quality', () => {
      const codeQuality = {
        score: 30,
        totalIssues: 10,
        breakdown: { critical: 3, warnings: 5, suggestions: 2 },
        details: '',
      };

      const userTrust = {
        score: 70,
        commitsAnalyzed: 10,
        breakdown: {},
        details: '',
      };

      const result = calculator.calculate(codeQuality, userTrust);

      // (30 * 0.6) + (70 * 0.4) = 18 + 28 = 46
      expect(result.score).toBe(46);
    });

    it('should score low for untrusted user', () => {
      const codeQuality = {
        score: 90,
        totalIssues: 1,
        breakdown: { critical: 0, warnings: 2, suggestions: 0 },
        details: '',
      };

      const userTrust = {
        score: 30,
        commitsAnalyzed: 10,
        breakdown: {},
        details: '',
      };

      const result = calculator.calculate(codeQuality, userTrust);

      // (90 * 0.6) + (30 * 0.4) = 54 + 12 = 66
      expect(result.score).toBe(66);
    });
  });

  describe('Missing data handling', () => {
    it('should return null for missing code quality', () => {
      const userTrust = { score: 80, commitsAnalyzed: 10, breakdown: {}, details: '' };

      const result = calculator.calculate(null, userTrust);

      expect(result.score).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return null for missing user trust', () => {
      const codeQuality = {
        score: 90,
        totalIssues: 0,
        breakdown: {},
        details: '',
      };

      const result = calculator.calculate(codeQuality, null);

      expect(result.score).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('Custom weights configuration', () => {
    it('should respect custom weights', () => {
      process.env.CONFIDENCE_WEIGHT_CODE_QUALITY = '70';
      process.env.CONFIDENCE_WEIGHT_USER_TRUST = '30';

      const customCalculator = new DefaultPRConfidenceCalculator();

      expect(customCalculator.weights.codeQuality).toBe(70);
      expect(customCalculator.weights.userTrust).toBe(30);
    });

    it('should normalize weights if not summing to 100', () => {
      process.env.CONFIDENCE_WEIGHT_CODE_QUALITY = '80';
      process.env.CONFIDENCE_WEIGHT_USER_TRUST = '40';

      const customCalculator = new DefaultPRConfidenceCalculator();

      const total = customCalculator.weights.codeQuality + customCalculator.weights.userTrust;
      expect(total).toBe(100);
    });
  });
});

describe('formatConfidenceBadge', () => {
  it('should format high confidence (85+)', () => {
    const badge = formatConfidenceBadge(92);
    expect(badge).toContain('✅');
    expect(badge).toContain('92%');
    expect(badge).toContain('High');
  });

  it('should format good confidence (70-84)', () => {
    const badge = formatConfidenceBadge(75);
    expect(badge).toContain('✓');
    expect(badge).toContain('75%');
    expect(badge).toContain('Good');
  });

  it('should format moderate confidence (50-69)', () => {
    const badge = formatConfidenceBadge(60);
    expect(badge).toContain('⚠️');
    expect(badge).toContain('60%');
    expect(badge).toContain('Moderate');
  });

  it('should format low confidence (0-49)', () => {
    const badge = formatConfidenceBadge(30);
    expect(badge).toContain('⚠️');
    expect(badge).toContain('30%');
    expect(badge).toContain('Low');
  });

  it('should handle null score', () => {
    expect(formatConfidenceBadge(null)).toBeNull();
  });
});

describe('formatConfidenceDetails', () => {
  it('should format complete details', () => {
    const codeQuality = {
      score: 85,
      totalIssues: 2,
      breakdown: { critical: 0, warnings: 2, suggestions: 0 },
      details: '**Code Quality Score:** ✅ 85/100',
    };

    const userTrust = {
      score: 78,
      commitsAnalyzed: 10,
      breakdown: {},
      details: '**User Trust Score:** ✓ 78/100',
    };

    const weights = { codeQuality: 60, userTrust: 40 };

    const details = formatConfidenceDetails(82, codeQuality, userTrust, weights);

    expect(details).toContain('Overall Score: 82/100');
    expect(details).toContain('Code Quality');
    expect(details).toContain('User Trust');
    expect(details).toContain('85/100');
    expect(details).toContain('78/100');
    expect(details).toContain('Issues'); // Flexible check for issues section
  });

  it('should handle null inputs', () => {
    expect(formatConfidenceDetails(80, null, null, {})).toBeNull();
  });
});
