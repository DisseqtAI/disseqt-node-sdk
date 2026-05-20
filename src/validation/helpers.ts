import type { JsonObject } from '../http/types.js';
import {
  AgenticBehavior,
  Composite,
  InputValidation,
  McpSecurity,
  OutputValidation,
  RagGrounding,
  ThemesClassifier,
} from './enums.js';
import type {
  AgenticBehaviourRequest,
  AgenticBehaviourRequestInit,
  CompositeScoreRequest,
  CompositeScoreRequestInit,
  InputValidationRequest,
  InputValidationRequestInit,
  LlmTextFieldsInit,
  McpSecurityRequest,
  OutputValidationRequest,
  RagGroundingRequest,
  ThemesClassifierRequest,
  ThemesClassifierRequestInit,
  ValidatorConfigInput,
} from './models.js';
import {
  AgenticBehaviourValidator,
  ClassifyValidator,
  CompositeScoreEvaluator,
  InputValidator,
  McpSecurityValidator,
  OutputValidator,
  RagGroundingValidator,
  type Validatable,
} from './validators.js';

interface ValidationExecutor {
  validate(request: Validatable): Promise<JsonObject>;
}

export type InputValidationData = InputValidationRequest | InputValidationRequestInit;
export type OutputValidationData = OutputValidationRequest | LlmTextFieldsInit;
export type RagGroundingData = RagGroundingRequest | LlmTextFieldsInit;
export type AgenticBehaviourData = AgenticBehaviourRequest | AgenticBehaviourRequestInit;
export type McpSecurityData = McpSecurityRequest | LlmTextFieldsInit;
export type ThemesClassifierData = ThemesClassifierRequest | ThemesClassifierRequestInit;
export type CompositeScoreData = CompositeScoreRequest | CompositeScoreRequestInit;

export class InputValidationHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: InputValidation, data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.executor.validate(new InputValidator({ slug, data, config }));
  }

  toxicity(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Toxicity, data, config);
  }

  bias(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Bias, data, config);
  }

  promptInjection(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.PromptInjection, data, config);
  }

  intersectionality(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Intersectionality, data, config);
  }

  racialBias(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.RacialBias, data, config);
  }

  genderBias(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.GenderBias, data, config);
  }

  politicalBias(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.PoliticalBias, data, config);
  }

  selfHarm(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.SelfHarm, data, config);
  }

  violence(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Violence, data, config);
  }

  terrorism(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Terrorism, data, config);
  }

  sexualContent(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.SexualContent, data, config);
  }

  hateSpeech(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.HateSpeech, data, config);
  }

  nsfw(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.Nsfw, data, config);
  }

  invisibleText(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.InvisibleText, data, config);
  }

  childSafety(data: InputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(InputValidation.ChildSafety, data, config);
  }
}

export class OutputValidationHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: OutputValidation, data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.executor.validate(new OutputValidator({ slug, data, config }));
  }

  factualConsistency(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.FactualConsistency, data, config);
  }

  answerRelevance(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.AnswerRelevance, data, config);
  }

  conceptualSimilarity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.ConceptualSimilarity, data, config);
  }

  grammarCorrectness(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.GrammarCorrectness, data, config);
  }

  responseTone(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.ResponseTone, data, config);
  }

  clarity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Clarity, data, config);
  }

  coherence(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Coherence, data, config);
  }

  creativity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Creativity, data, config);
  }

  readability(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Readability, data, config);
  }

  diversity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Diversity, data, config);
  }

  narrativeContinuity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.NarrativeContinuity, data, config);
  }

  bias(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Bias, data, config);
  }

  genderBias(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.GenderBias, data, config);
  }

  racialBias(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.RacialBias, data, config);
  }

  politicalBias(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.PoliticalBias, data, config);
  }

  intersectionality(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Intersectionality, data, config);
  }

  toxicity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Toxicity, data, config);
  }

  nsfw(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Nsfw, data, config);
  }

  terrorism(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Terrorism, data, config);
  }

  violence(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.Violence, data, config);
  }

  selfHarm(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.SelfHarm, data, config);
  }

  sexualContent(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.SexualContent, data, config);
  }

  hateSpeech(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.HateSpeech, data, config);
  }

  childSafety(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.ChildSafety, data, config);
  }

  dataLeakage(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.DataLeakage, data, config);
  }

  insecureOutput(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.InsecureOutput, data, config);
  }

  bleuScore(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.BleuScore, data, config);
  }

  rougeScore(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.RougeScore, data, config);
  }

  meteorScore(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.MeteorScore, data, config);
  }

  cosineSimilarity(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.CosineSimilarity, data, config);
  }

  fuzzyScore(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.FuzzyScore, data, config);
  }

  compressionScore(data: OutputValidationData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(OutputValidation.CompressionScore, data, config);
  }
}

export class RagGroundingHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: RagGrounding, data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.executor.validate(new RagGroundingValidator({ slug, data, config }));
  }

  contextRelevance(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.ContextRelevance, data, config);
  }

  contextRecall(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.ContextRecall, data, config);
  }

  contextPrecision(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.ContextPrecision, data, config);
  }

  contextEntitiesRecall(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.ContextEntitiesRecall, data, config);
  }

  noiseSensitivity(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.NoiseSensitivity, data, config);
  }

  responseRelevancy(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.ResponseRelevancy, data, config);
  }

  faithfulness(data: RagGroundingData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(RagGrounding.Faithfulness, data, config);
  }
}

export class AgenticBehaviorHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(
    slug: AgenticBehavior,
    data: AgenticBehaviourData,
    config: ValidatorConfigInput,
  ): Promise<JsonObject> {
    return this.executor.validate(new AgenticBehaviourValidator({ slug, data, config }));
  }

  topicAdherence(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.TopicAdherence, data, config);
  }

  toolCallAccuracy(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.ToolCallAccuracy, data, config);
  }

  toolFailureRate(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.ToolFailureRate, data, config);
  }

  planOptimality(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.PlanOptimality, data, config);
  }

  agentGoalAccuracy(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.AgentGoalAccuracy, data, config);
  }

  intentResolution(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.IntentResolution, data, config);
  }

  planCoherence(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.PlanCoherence, data, config);
  }

  fallbackRate(data: AgenticBehaviourData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(AgenticBehavior.FallbackRate, data, config);
  }
}

export class McpSecurityHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: McpSecurity, data: McpSecurityData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.executor.validate(new McpSecurityValidator({ slug, data, config }));
  }

  promptInjection(data: McpSecurityData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(McpSecurity.PromptInjection, data, config);
  }

  dataLeakage(data: McpSecurityData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(McpSecurity.DataLeakage, data, config);
  }

  insecureOutput(data: McpSecurityData, config: ValidatorConfigInput): Promise<JsonObject> {
    return this.run(McpSecurity.InsecureOutput, data, config);
  }
}

export class ThemesClassifierHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: ThemesClassifier, data: ThemesClassifierData): Promise<JsonObject> {
    if (slug !== ThemesClassifier.Classify) {
      throw new ValueError(`Unsupported themes classifier slug: ${slug}`);
    }
    return this.classify(data);
  }

  classify(data: ThemesClassifierData): Promise<JsonObject> {
    return this.executor.validate(new ClassifyValidator({ data }));
  }
}

export class CompositeHelpers {
  constructor(private readonly executor: ValidationExecutor) {}

  run(slug: Composite, data: CompositeScoreData): Promise<JsonObject> {
    if (slug !== Composite.Evaluate) {
      throw new ValueError(`Unsupported composite slug: ${slug}`);
    }
    return this.evaluate(data);
  }

  evaluate(data: CompositeScoreData): Promise<JsonObject> {
    return this.executor.validate(new CompositeScoreEvaluator({ data }));
  }
}

class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}
