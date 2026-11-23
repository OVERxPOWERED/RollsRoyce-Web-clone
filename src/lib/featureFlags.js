// src/lib/featureFlags.js
import { telemetry } from './telemetry';
import { EventEmitter } from 'events';

export const FlagType = {
  BOOLEAN: 'boolean',
  STRING: 'string',
  NUMBER: 'number',
  JSON: 'json',
};

export const TargetingRuleType = {
  PERCENTAGE: 'percentage',
  USER_ATTRIBUTE: 'user_attribute',
  VEHICLE_TIER: 'vehicle_tier',
  ENVIRONMENT: 'environment',
  CUSTOM: 'custom',
};

export const Operator = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  IN: 'in',
  NOT_IN: 'not_in',
  REGEX: 'regex',
};

export class FlagDefinition {
  constructor({
    key,
    name,
    description,
    type = FlagType.BOOLEAN,
    defaultValue = false,
    variants = [],
    targetingRules = [],
    rolloutPercentage = 0,
    enabled = true,
    metadata = {},
  }) {
    this.key = key;
    this.name = name;
    this.description = description;
    this.type = type;
    this.defaultValue = defaultValue;
    this.variants = variants;
    this.targetingRules = targetingRules;
    this.rolloutPercentage = rolloutPercentage;
    this.enabled = enabled;
    this.metadata = metadata;
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      key: this.key,
      name: this.name,
      description: this.description,
      type: this.type,
      defaultValue: this.defaultValue,
      variants: this.variants,
      targetingRules: this.targetingRules,
      rolloutPercentage: this.rolloutPercentage,
      enabled: this.enabled,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export class EvaluationContext {
  constructor({
    userId,
    sessionId,
    userAttributes = {},
    vehicleTier = 'standard',
    environment = 'production',
    customAttributes = {},
    timestamp = Date.now(),
  }) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.userAttributes = userAttributes;
    this.vehicleTier = vehicleTier;
    this.environment = environment;
    this.customAttributes = customAttributes;
    this.timestamp = timestamp;
  }

  getAttribute(path) {
    const keys = path.split('.');
    let value = this;
    for (const key of keys) {
      if (value === null || value === undefined) return undefined;
      value = value[key];
    }
    return value;
  }
}

export class FlagVariant {
  constructor({
    key,
    value,
    weight = 0,
    targetingRules = [],
    metadata = {},
  }) {
    this.key = key;
    this.value = value;
    this.weight = weight;
    this.targetingRules = targetingRules;
    this.metadata = metadata;
  }
}

class TargetingRule {
  constructor({
    type,
    attribute,
    operator,
    values,
    percentage,
    customEvaluator,
  }) {
    this.type = type;
    this.attribute = attribute;
    this.operator = operator;
    this.values = values || [];
    this.percentage = percentage;
    this.customEvaluator = customEvaluator;
  }

  evaluate(context) {
    switch (this.type) {
      case TargetingRuleType.PERCENTAGE:
        return this.evaluatePercentageRule(context);
      case TargetingRuleType.USER_ATTRIBUTE:
        return this.evaluateUserAttributeRule(context);
      case TargetingRuleType.VEHICLE_TIER:
        return this.evaluateVehicleTierRule(context);
      case TargetingRuleType.ENVIRONMENT:
        return this.evaluateEnvironmentRule(context);
      case TargetingRuleType.CUSTOM:
        return this.evaluateCustomRule(context);
      default:
        return false;
    }
  }

  evaluatePercentageRule(context) {
    if (this.percentage === undefined || this.percentage === null) {
      return false;
    }
    const hashInput = `${context.userId || context.sessionId || 'anonymous'}:${this.attribute || 'default'}`;
    const hash = this.hashString(hashInput);
    const bucket = hash % 100;
    return bucket < this.percentage;
  }

  evaluateUserAttributeRule(context) {
    const attributeValue = context.getAttribute(this.attribute);
    if (attributeValue === undefined) return false;
    return this.compareValues(attributeValue, this.values, this.operator);
  }

  evaluateVehicleTierRule(context) {
    return this.compareValues(context.vehicleTier, this.values, this.operator);
  }

  evaluateEnvironmentRule(context) {
    return this.compareValues(context.environment, this.values, this.operator);
  }

  evaluateCustomRule(context) {
    if (typeof this.customEvaluator === 'function') {
      try {
        return this.customEvaluator(context);
      } catch (error) {
        console.error('Custom rule evaluation error:', error);
        return false;
      }
    }
    return false;
  }

  compareValues(actual, expectedValues, operator) {
    const values = Array.isArray(expectedValues) ? expectedValues : [expectedValues];
    
    switch (operator) {
      case Operator.EQUALS:
        return values.some(v => this.deepEqual(actual, v));
      case Operator.NOT_EQUALS:
        return !values.some(v => this.deepEqual(actual, v));
      case Operator.CONTAINS:
        if (typeof actual === 'string') {
          return values.some(v => actual.includes(String(v)));
        }
        if (Array.isArray(actual)) {
          return values.some(v => actual.includes(v));
        }
        return false;
      case Operator.NOT_CONTAINS:
        if (typeof actual === 'string') {
          return !values.some(v => actual.includes(String(v)));
        }
        if (Array.isArray(actual)) {
          return !values.some(v => actual.includes(v));
        }
        return true;
      case Operator.GREATER_THAN:
        return values.some(v => Number(actual) > Number(v));
      case Operator.LESS_THAN:
        return values.some(v => Number(actual) < Number(v));
      case Operator.IN:
        return values.some(v => this.deepEqual(actual, v));
      case Operator.NOT_IN:
        return !values.some(v => this.deepEqual(actual, v));
      case Operator.REGEX:
        if (typeof actual === 'string') {
          return values.some(v => new RegExp(v).test(actual));
        }
        return false;
      default:
        return false;
    }
  }

  deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export class FeatureFlagEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.flags = new Map();
    this.evaluationCache = new Map();
    this.cacheTTL = options.cacheTTL || 60000;
    this.telemetry = telemetry;
    this.samplingRate = options.samplingRate || 1.0;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.pendingEvents = [];
    this.flushTimer = null;
    
    this.startFlushTimer();
  }

  startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flushTelemetry();
    }, this.flushInterval);
    
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  registerFlag(definition) {
    if (!(definition instanceof FlagDefinition)) {
      definition = new FlagDefinition(definition);
    }
    
    this.flags.set(definition.key, definition);
    this.invalidateCache(definition.key);
    this.emit('flagRegistered', definition.key);
    return definition;
  }

  unregisterFlag(flagKey) {
    const existed = this.flags.delete(flagKey);
    this.invalidateCache(flagKey);
    if (existed) {
      this.emit('flagUnregistered', flagKey);
    }
    return existed;
  }

  getFlag(flagKey) {
    return this.flags.get(flagKey);
  }

  getAllFlags() {
    return Array.from(this.flags.values());
  }

  evaluateFlag(flagKey, context) {
    const flag = this.flags.get(flagKey);
    if (!flag) {
      return this.emitEvaluationEvent(flagKey, context, false, 'flag_not_found');
    }

    if (!flag.enabled) {
      return this.emitEvaluationEvent(flagKey, context, flag.defaultValue, 'flag_disabled');
    }

    const cacheKey = this.getCacheKey(flagKey, context);
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return this.emitEvaluationEvent(flagKey, context, cached.value, 'cache_hit');
    }

    let result = flag.defaultValue;
    let decisionReason = 'default';

    for (const rule of flag.targetingRules) {
      const targetingRule = rule instanceof TargetingRule ? rule : new TargetingRule(rule);
      if (targetingRule.evaluate(context)) {
        result = true;
        decisionReason = `rule_matched:${targetingRule.type}`;
        break;
      }
    }

    if (result === flag.defaultValue && flag.rolloutPercentage > 0) {
      const percentageRule = new TargetingRule({
        type: TargetingRuleType.PERCENTAGE,
        percentage: flag.rolloutPercentage,
        attribute: flagKey,
      });
      if (percentageRule.evaluate(context)) {
        result = true;
        decisionReason = 'percentage_rollout';
      }
    }

    this.evaluationCache.set(cacheKey, { value: result, timestamp: Date.now() });
    
    return this.emitEvaluationEvent(flagKey, context, result, decisionReason);
  }

  getVariant(flagKey, context) {
    const flag = this.flags.get(flagKey);
    if (!flag || !flag.enabled || flag.variants.length === 0) {
      return this.emitVariantEvent(flagKey, context, flag?.defaultValue, 'default', 'flag_not_found_or_no_variants');
    }

    const cacheKey = `variant:${this.getCacheKey(flagKey, context)}`;
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return this.emitVariantEvent(flagKey, context, cached.value.value, cached.value.key, 'cache_hit');
    }

    for (const variantDef of flag.variants) {
      const variant = variantDef instanceof FlagVariant ? variantDef : new FlagVariant(variantDef);
      let matches = true;
      
      for (const rule of variant.targetingRules) {
        const targetingRule = rule instanceof TargetingRule ? rule : new TargetingRule(rule);
        if (!targetingRule.evaluate(context)) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        this.evaluationCache.set(cacheKey, { value: variant, timestamp: Date.now() });
        return this.emitVariantEvent(flagKey, context, variant.value, variant.key, 'variant_matched');
      }
    }

    const totalWeight = flag.variants.reduce((sum, v) => sum + (v.weight || 0), 0);
    if (totalWeight > 0) {
      const hashInput = `${context.userId || context.sessionId || 'anonymous'}:${flagKey}`;
      const hash = this.hashString(hashInput);
      let bucket = hash % totalWeight;
      
      for (const variantDef of flag.variants) {
        const variant = variantDef instanceof FlagVariant ? variantDef : new FlagVariant(variantDef);
        bucket -= variant.weight || 0;
        if (bucket < 0) {
          this.evaluationCache.set(cacheKey, { value: variant, timestamp: Date.now() });
          return this.emitVariantEvent(flagKey, context, variant.value, variant.key, 'weighted_random');
        }
      }
    }

    return this.emitVariantEvent(flagKey, context, flag.defaultValue, 'default', 'fallback_to_default');
  }

  evaluateAllFlags(context) {
    const results = {};
    for (const [key, flag] of this.flags) {
      if (flag.enabled) {
        results[key] = this.evaluateFlag(key, context);
      }
    }
    return results;
  }

  getAllVariants(context) {
    const results = {};
    for (const [key, flag] of this.flags) {
      if (flag.enabled && flag.variants.length > 0) {
        results[key] = this.getVariant(key, context);
      }
    }
    return results;
  }

  emitEvaluationEvent(flagKey, context, value, reason) {
    const event = {
      type: 'flag_evaluation',
      flagKey,
      value,
      reason,
      context: this.sanitizeContext(context),
      timestamp: Date.now(),
    };

    this.queueTelemetryEvent(event);
    return value;
  }

  emitVariantEvent(flagKey, context, value, variantKey, reason) {
    const event = {
      type: 'flag_variant_evaluation',
      flagKey,
      variant: variantKey,
      value,
      reason,
      context: this.sanitizeContext(context),
      timestamp: Date.now(),
    };

    this.queueTelemetryEvent(event);
    return { value, variant: variantKey };
  }

  sanitizeContext(context) {
    return {
      userId: context.userId ? this.hashString(context.userId).toString(36) : undefined,
      sessionId: context.sessionId ? this.hashString(context.sessionId).toString(36) : undefined,
      vehicleTier: context.vehicleTier,
      environment: context.environment,
      userAttributesKeys: Object.keys(context.userAttributes || {}),
      customAttributesKeys: Object.keys(context.customAttributes || {}),
    };
  }

  queueTelemetryEvent(event) {
    if (Math.random() > this.samplingRate) {
      return;
    }

    this.pendingEvents.push(event);
    
    if (this.pendingEvents.length >= this.batchSize) {
      this.flushTelemetry();
    }
  }

  async flushTelemetry() {
    if (this.pendingEvents.length === 0) return;

    const events = this.pendingEvents.splice(0, this.batchSize);
    
    try {
      await this.telemetry.trackBatch(events.map(e => ({
        name: e.type,
        properties: e,
        timestamp: e.timestamp,
      })));
    } catch (error) {
      console.error('Failed to flush feature flag telemetry:', error);
      this.pendingEvents.unshift(...events);
    }
  }

  invalidateCache(flagKey) {
    for (const key of this.evaluationCache.keys()) {
      if (key.startsWith(flagKey) || key.startsWith(`variant:${flagKey}`)) {
        this.evaluationCache.delete(key);
      }
    }
  }

  getCacheKey(flagKey, context) {
    const identifier = context.userId || context.sessionId || 'anonymous';
    return `${flagKey}:${this.hashString(identifier)}`;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  clearCache() {
    this.evaluationCache.clear();
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushTelemetry();
    this.clearCache();
    this.flags.clear();
    this.removeAllListeners();
  }
}

export const featureFlagEngine = new FeatureFlagEngine();

export function createFeatureFlagEngine(options) {
  return new FeatureFlagEngine(options);
}

export default featureFlagEngine;
```