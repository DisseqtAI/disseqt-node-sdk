export enum ValidatorDomain {
  InputValidation = 'input-validation',
  OutputValidation = 'output-validation',
  RagGrounding = 'rag-grounding',
  AgenticBehavior = 'agentic-behavior',
  McpSecurity = 'mcp-security',
  ThemesClassifier = 'themes-classifier',
  Composite = 'composite',
}

export enum InputValidation {
  Toxicity = 'toxicity',
  Bias = 'bias',
  PromptInjection = 'prompt-injection',
  Intersectionality = 'intersectionality',
  RacialBias = 'racial-bias',
  GenderBias = 'gender-bias',
  PoliticalBias = 'political-bias',
  SelfHarm = 'self-harm',
  Violence = 'violence',
  Terrorism = 'terrorism',
  SexualContent = 'sexual-content',
  HateSpeech = 'hate-speech',
  Nsfw = 'nsfw',
  InvisibleText = 'invisible-text',
  ChildSafety = 'child-safety',
  IntentGuard = 'intent-guard',
  IntentCompliance = 'intent-compliance',
}

export enum OutputValidation {
  FactualConsistency = 'factual-consistency',
  AnswerRelevance = 'answer-relevance',
  ConceptualSimilarity = 'conceptual-similarity',
  GrammarCorrectness = 'grammatical-correctness',
  ResponseTone = 'response-tone',
  Clarity = 'clarity',
  Coherence = 'coherence',
  Creativity = 'creativity',
  Readability = 'readability',
  Diversity = 'diversity',
  NarrativeContinuity = 'narrative-continuity',
  Bias = 'bias',
  GenderBias = 'gender-bias',
  RacialBias = 'racial-bias',
  PoliticalBias = 'political-bias',
  Intersectionality = 'intersectionality',
  Toxicity = 'toxicity',
  Nsfw = 'nsfw',
  Terrorism = 'terrorism',
  Violence = 'violence',
  SelfHarm = 'self-harm',
  SexualContent = 'sexual-content',
  HateSpeech = 'hate-speech',
  ChildSafety = 'child-safety',
  DataLeakage = 'data-leakage',
  InsecureOutput = 'insecure-output',
  IntentGuard = 'intent-guard',
  IntentCompliance = 'intent-compliance',
  BleuScore = 'bleu-score',
  RougeScore = 'rouge-score',
  MeteorScore = 'meteor-score',
  CosineSimilarity = 'cosine-similarity',
  FuzzyScore = 'fuzzy-score',
  CompressionScore = 'compression-score',
}

export enum RagGrounding {
  ContextRelevance = 'context-relevance',
  ContextRecall = 'context-recall',
  ContextPrecision = 'context-precision',
  ContextEntitiesRecall = 'context-entities-recall',
  NoiseSensitivity = 'noise-sensitivity',
  ResponseRelevancy = 'response-relevancy',
  Faithfulness = 'faithfulness',
}

export enum AgenticBehavior {
  TopicAdherence = 'topic-adherence',
  ToolCallAccuracy = 'tool-call-accuracy',
  ToolFailureRate = 'tool-failure-rate',
  PlanOptimality = 'plan-optimality',
  AgentGoalAccuracy = 'agent-goal-accuracy',
  IntentResolution = 'intent-resolution',
  PlanCoherence = 'plan-coherence',
  FallbackRate = 'fallback-rate',
}

export enum McpSecurity {
  PromptInjection = 'prompt-injection',
  DataLeakage = 'data-leakage',
  InsecureOutput = 'insecure-output',
}

export enum ThemesClassifier {
  Classify = 'classify',
}

export enum Composite {
  Evaluate = 'evaluate',
}
