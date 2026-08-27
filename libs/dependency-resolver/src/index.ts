/**
 * @dmaker/dependency-resolver
 * Feature dependency resolution for DMaker
 */

export {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  getIncompleteDependencies,
  orderFeaturesForExecution,
  shouldBlockOnDependencies,
  wouldCreateCircularDependency,
  dependencyExists,
  getAncestors,
  formatAncestorContextForPrompt,
  type DependencyResolutionResult,
  type RankableFeature,
  type DependencySatisfactionOptions,
  type ShouldBlockOptions,
  type AncestorContext,
} from './resolver.js';
