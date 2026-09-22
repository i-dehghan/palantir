export enum MatchingStrategy {
  Exact = 0,
  NumericTolerance = 1,
  FuzzyText = 2
}

export interface ReconciliationRule {
  id: number;
  ruleName: string;
  sourceTableA: string;
  sourceFieldA: string;
  sourceTableB: string;
  sourceFieldB: string;
  strategy: MatchingStrategy;
  toleranceOrThreshold: number;
  isActive: boolean;
}

export interface CreateRuleDto {
  ruleName: string;
  sourceTableA: string;
  sourceFieldA: string;
  sourceTableB: string;
  sourceFieldB: string;
  strategy: MatchingStrategy;
  toleranceOrThreshold: number;
}