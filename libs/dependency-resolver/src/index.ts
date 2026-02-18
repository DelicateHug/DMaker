/**
 * @automaker/dependency-resolver
 * Feature dependency resolution for AutoMaker
 */

export {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  shouldBlockOnDependencies,
  wouldCreateCircularDependency,
  dependencyExists,
  getAncestors,
  formatAncestorContextForPrompt,
  type DependencyResolutionResult,
  type DependencySatisfactionOptions,
  type ShouldBlockOptions,
  type AncestorContext,
} from './resolver.js';
