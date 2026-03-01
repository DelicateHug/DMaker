export interface PipelineStepTemplate {
  id: string;
  name: string;
  colorClass: string;
  instructions: string;
}

const codeReviewTemplate: PipelineStepTemplate = {
  id: 'code-review',
  name: 'Code Review',
  colorClass: 'bg-blue-500/20',
  instructions: `## Code Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING, YOU MUST MODIFY THE CODE WITH YOUR FINDINGS.**

This step has TWO mandatory phases:
1. **REVIEW** the code (identify issues)
2. **UPDATE** the code (fix the issues you found)

**You cannot complete this step by only reviewing. You MUST make code changes based on your review findings.**

---

### Phase 1: Review Phase
Perform a thorough code review of the changes made in this feature. Focus on:

#### Code Quality
- **Readability**: Is the code easy to understand? Are variable/function names descriptive?
- **Maintainability**: Will this code be easy to modify in the future?
- **DRY Principle**: Is there any duplicated code that should be abstracted?
- **Single Responsibility**: Do functions and classes have a single, clear purpose?

#### Best Practices
- Follow established patterns and conventions used in the codebase
- Ensure proper error handling is in place
- Check for appropriate logging where needed
- Verify that magic numbers/strings are replaced with named constants

#### Performance
- Identify any potential performance bottlenecks
- Check for unnecessary re-renders (React) or redundant computations
- Ensure efficient data structures are used

#### Testing
- Verify that new code has appropriate test coverage
- Check that edge cases are handled

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE BASED ON YOUR REVIEW FINDINGS.**

**This is not optional. Every issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Fix Issues Immediately**: For every issue you found during review:
   - ✅ Refactor code for better readability
   - ✅ Extract duplicated code into reusable functions
   - ✅ Improve variable/function names for clarity
   - ✅ Add missing error handling
   - ✅ Replace magic numbers/strings with named constants
   - ✅ Optimize performance bottlenecks
   - ✅ Fix any code quality issues you identify
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

2. **Apply All Improvements**: Don't just identify problems - fix them in code:
   - ✅ Improve code structure and organization
   - ✅ Enhance error handling and logging
   - ✅ Optimize performance where possible
   - ✅ Ensure consistency with codebase patterns
   - ✅ Add or improve comments where needed
   - ✅ **MODIFY THE FILES DIRECTLY WITH YOUR IMPROVEMENTS**

3. **For Complex Issues**: If you encounter issues that require significant refactoring:
   - ✅ Make the improvements you can make safely
   - ✅ Document remaining issues with clear explanations
   - ✅ Provide specific suggestions for future improvements
   - ✅ **STILL MAKE AS MANY CODE CHANGES AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of issues found during review
- **A detailed list of ALL code changes and improvements made (this proves you updated the code)**
- Any remaining issues that need attention (if applicable)

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing without updating is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the code files directly with your improvements.**
**You MUST show evidence of code changes in your summary.**
**This step is only complete when code has been updated.**`,
};

const securityReviewTemplate: PipelineStepTemplate = {
  id: 'security-review',
  name: 'Security Review',
  colorClass: 'bg-red-500/20',
  instructions: `## Security Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE TO FIX SECURITY ISSUES ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING FOR SECURITY ISSUES, YOU MUST FIX THEM IN THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the code for security vulnerabilities (identify issues)
2. **UPDATE** the code to fix vulnerabilities (secure the code)

**You cannot complete this step by only identifying security issues. You MUST modify the code to fix them.**

**Security vulnerabilities left unfixed are unacceptable. You must address them with code changes.**

---

### Phase 1: Review Phase
Perform a comprehensive security audit of the changes made in this feature. Check for vulnerabilities in the following areas:

#### Input Validation & Sanitization
- Verify all user inputs are properly validated and sanitized
- Check for SQL injection vulnerabilities
- Check for XSS (Cross-Site Scripting) vulnerabilities
- Ensure proper encoding of output data

#### Authentication & Authorization
- Verify authentication checks are in place where needed
- Ensure authorization logic correctly restricts access
- Check for privilege escalation vulnerabilities
- Verify session management is secure

#### Data Protection
- Ensure sensitive data is not logged or exposed
- Check that secrets/credentials are not hardcoded
- Verify proper encryption is used for sensitive data
- Check for secure transmission of data (HTTPS, etc.)

#### Common Vulnerabilities (OWASP Top 10)
- Injection flaws
- Broken authentication
- Sensitive data exposure
- XML External Entities (XXE)
- Broken access control
- Security misconfiguration
- Cross-Site Scripting (XSS)
- Insecure deserialization
- Using components with known vulnerabilities
- Insufficient logging & monitoring

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO FIX ALL SECURITY VULNERABILITIES.**

**This is not optional. Every security issue you identify must be fixed with code changes.**

**Security vulnerabilities cannot be left unfixed. You must address them immediately.**

#### Action Steps (You MUST complete these):

1. **Fix Vulnerabilities Immediately** - UPDATE THE CODE:
   - ✅ Add input validation and sanitization where missing
   - ✅ Fix SQL injection vulnerabilities by using parameterized queries
   - ✅ Fix XSS vulnerabilities by properly encoding output
   - ✅ Add authentication/authorization checks where needed
   - ✅ Remove hardcoded secrets and credentials
   - ✅ Implement proper encryption for sensitive data
   - ✅ Fix broken access control
   - ✅ Add security headers and configurations
   - ✅ Fix any other security vulnerabilities you find
   - ✅ **MODIFY THE SOURCE FILES DIRECTLY TO FIX SECURITY ISSUES**

2. **Apply Security Best Practices** - UPDATE THE CODE:
   - ✅ Implement proper input validation on all user inputs
   - ✅ Ensure all outputs are properly encoded
   - ✅ Add authentication checks to protected routes/endpoints
   - ✅ Implement proper authorization logic
   - ✅ Remove or secure any exposed sensitive data
   - ✅ Add security logging and monitoring
   - ✅ Update dependencies with known vulnerabilities
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

3. **For Complex Security Issues** - UPDATE THE CODE:
   - ✅ Fix what you can fix safely
   - ✅ Document critical security issues with severity levels
   - ✅ Provide specific remediation steps for complex issues
   - ✅ Add security-related comments explaining protections in place
   - ✅ **STILL MAKE AS MANY SECURITY FIXES AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A security assessment summary of vulnerabilities found
- **A detailed list of ALL security fixes applied to the code (this proves you updated the code)**
- Any remaining security concerns that need attention (if applicable)
- Severity levels for any unfixed issues

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing security without fixing vulnerabilities is INCOMPLETE, UNACCEPTABLE, and DANGEROUS.**

**You MUST modify the code files directly to fix security issues.**
**You MUST show evidence of security fixes in your summary.**
**This step is only complete when security vulnerabilities have been fixed in the code.**
**Security issues cannot be left as documentation - they must be fixed.**`,
};

const uxReviewTemplate: PipelineStepTemplate = {
  id: 'ux-reviewer',
  name: 'User Experience',
  colorClass: 'bg-purple-500/20',
  instructions: `## User Experience Review & Update

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE TO IMPROVE UX ⚠️

**THIS IS NOT OPTIONAL. AFTER REVIEWING THE USER EXPERIENCE, YOU MUST UPDATE THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the user experience (identify UX issues)
2. **UPDATE** the code to improve UX (fix the issues you found)

**You cannot complete this step by only reviewing UX. You MUST modify the code to improve the user experience.**

---

### Phase 1: Review Phase
Review the changes made in this feature from a user experience and design perspective. Focus on creating an exceptional user experience.

#### User-Centered Design
- **User Goals**: Does this feature solve a real user problem?
- **Clarity**: Is the interface clear and easy to understand?
- **Simplicity**: Can the feature be simplified without losing functionality?
- **Consistency**: Does it follow existing design patterns and conventions?

#### Visual Design & Hierarchy
- **Layout**: Is the visual hierarchy clear? Does important information stand out?
- **Spacing**: Is there appropriate whitespace and grouping?
- **Typography**: Is text readable with proper sizing and contrast?
- **Color**: Does color usage support functionality and meet accessibility standards?

#### Accessibility (WCAG 2.1)
- **Keyboard Navigation**: Can all functionality be accessed via keyboard?
- **Screen Readers**: Are ARIA labels and semantic HTML used appropriately?
- **Color Contrast**: Does text meet WCAG AA standards (4.5:1 for body, 3:1 for large)?
- **Focus Indicators**: Are focus states visible and clear?
- **Touch Targets**: Are interactive elements at least 44x44px on mobile?

#### Responsive Design
- **Mobile Experience**: Does it work well on small screens?
- **Touch Targets**: Are buttons and links easy to tap?
- **Content Adaptation**: Does content adapt appropriately to different screen sizes?
- **Navigation**: Is navigation accessible and intuitive on mobile?

#### User Feedback & States
- **Loading States**: Are loading indicators shown for async operations?
- **Error States**: Are error messages clear and actionable?
- **Empty States**: Do empty states guide users on what to do next?
- **Success States**: Are successful actions clearly confirmed?

#### Performance & Perceived Performance
- **Loading Speed**: Does the feature load quickly?
- **Skeleton Screens**: Are skeleton screens used for better perceived performance?
- **Optimistic Updates**: Can optimistic UI updates improve perceived speed?
- **Micro-interactions**: Do animations and transitions enhance the experience?

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO IMPROVE THE USER EXPERIENCE.**

**This is not optional. Every UX issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Fix UX Issues Immediately** - UPDATE THE CODE:
   - ✅ Improve visual hierarchy and layout
   - ✅ Fix spacing and typography issues
   - ✅ Add missing ARIA labels and semantic HTML
   - ✅ Fix color contrast issues
   - ✅ Add or improve focus indicators
   - ✅ Ensure touch targets meet size requirements
   - ✅ Add missing loading, error, empty, and success states
   - ✅ Improve responsive design for mobile
   - ✅ Add keyboard navigation support
   - ✅ Fix any accessibility issues
   - ✅ **MODIFY THE UI COMPONENT FILES DIRECTLY WITH UX IMPROVEMENTS**

2. **Apply UX Improvements** - UPDATE THE CODE:
   - ✅ Refactor components for better clarity and simplicity
   - ✅ Improve visual design and spacing
   - ✅ Enhance accessibility features
   - ✅ Add user feedback mechanisms (loading, error, success states)
   - ✅ Optimize for mobile and responsive design
   - ✅ Improve micro-interactions and animations
   - ✅ Ensure consistency with design system
   - ✅ **MAKE THE ACTUAL CODE CHANGES - DO NOT JUST DOCUMENT THEM**

3. **For Complex UX Issues** - UPDATE THE CODE:
   - ✅ Make the improvements you can make safely
   - ✅ Document UX considerations and recommendations
   - ✅ Provide specific suggestions for major UX improvements
   - ✅ **STILL MAKE AS MANY UX IMPROVEMENTS AS POSSIBLE**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of UX issues found during review
- **A detailed list of ALL UX improvements made to the code (this proves you updated the code)**
- Any remaining UX considerations that need attention (if applicable)
- Recommendations for future UX enhancements

---

# ⚠️ FINAL REMINDER ⚠️

**Reviewing UX without updating the code is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the UI component files directly with UX improvements.**
**You MUST show evidence of UX code changes in your summary.**
**This step is only complete when code has been updated to improve the user experience.**`,
};

const testingTemplate: PipelineStepTemplate = {
  id: 'testing',
  name: 'Testing',
  colorClass: 'bg-green-500/20',
  instructions: `## Testing Step

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODEBASE WITH TESTS ⚠️

**THIS IS NOT OPTIONAL. YOU MUST WRITE AND ADD TESTS TO THE CODEBASE.**

This step requires you to:
1. **REVIEW** what needs testing
2. **UPDATE** the codebase by writing and adding test files

**You cannot complete this step by only identifying what needs testing. You MUST create test files and write tests.**

---

### Phase 1: Review Phase
Identify what needs test coverage:

- Review new functions, methods, and classes
- Identify new API endpoints
- Check for edge cases that need testing
- Identify integration points that need testing

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW WRITE AND ADD TESTS TO THE CODEBASE.**

**This is not optional. You must create test files and write actual test code.**

#### Action Steps (You MUST complete these):

1. **Write Unit Tests** - CREATE TEST FILES:
   - ✅ Write unit tests for all new functions and methods
   - ✅ Ensure edge cases are covered
   - ✅ Test error handling paths
   - ✅ Aim for high code coverage on new code
   - ✅ **CREATE TEST FILES AND WRITE THE ACTUAL TEST CODE**

2. **Write Integration Tests** - CREATE TEST FILES:
   - ✅ Test interactions between components/modules
   - ✅ Verify API endpoints work correctly
   - ✅ Test database operations if applicable
   - ✅ **CREATE INTEGRATION TEST FILES AND WRITE THE ACTUAL TEST CODE**

3. **Ensure Test Quality** - WRITE QUALITY TESTS:
   - ✅ Tests should be readable and well-documented
   - ✅ Each test should have a clear purpose
   - ✅ Use descriptive test names that explain the scenario
   - ✅ Follow the Arrange-Act-Assert pattern
   - ✅ **WRITE COMPLETE, FUNCTIONAL TESTS**

4. **Run Tests** - VERIFY TESTS WORK:
   - ✅ Run the full test suite and ensure all new tests pass
   - ✅ Verify no existing tests are broken
   - ✅ Check that test coverage meets project standards
   - ✅ **FIX ANY FAILING TESTS**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of testing needs identified
- **A detailed list of ALL test files created and tests written (this proves you updated the codebase)**
- Test coverage metrics achieved
- Any issues found during testing and how they were resolved

---

# ⚠️ FINAL REMINDER ⚠️

**Identifying what needs testing without writing tests is INCOMPLETE and UNACCEPTABLE.**

**You MUST create test files and write actual test code.**
**You MUST show evidence of test files created in your summary.**
**This step is only complete when tests have been written and added to the codebase.**`,
};

const documentationTemplate: PipelineStepTemplate = {
  id: 'documentation',
  name: 'Documentation',
  colorClass: 'bg-amber-500/20',
  instructions: `## Documentation Step

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE WITH DOCUMENTATION ⚠️

**THIS IS NOT OPTIONAL. YOU MUST ADD/UPDATE DOCUMENTATION IN THE CODEBASE.**

This step requires you to:
1. **REVIEW** what needs documentation
2. **UPDATE** the code by adding/updating documentation files and code comments

**You cannot complete this step by only identifying what needs documentation. You MUST add the documentation directly to the codebase.**

---

### Phase 1: Review Phase
Identify what documentation is needed:

- Review new functions, classes, and modules
- Identify new or modified API endpoints
- Check for missing README updates
- Identify changelog entries needed

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW ADD/UPDATE DOCUMENTATION IN THE CODEBASE.**

**This is not optional. You must modify files to add documentation.**

#### Action Steps (You MUST complete these):

1. **Code Documentation** - UPDATE THE CODE FILES:
   - ✅ Add/update JSDoc or docstrings for new functions and classes
   - ✅ Document complex algorithms or business logic
   - ✅ Add inline comments for non-obvious code
   - ✅ **MODIFY THE SOURCE FILES DIRECTLY WITH DOCUMENTATION**

2. **API Documentation** - UPDATE API DOCUMENTATION FILES:
   - ✅ Document any new or modified API endpoints
   - ✅ Include request/response examples
   - ✅ Document error responses
   - ✅ **UPDATE THE API DOCUMENTATION FILES DIRECTLY**

3. **README Updates** - UPDATE THE README FILE:
   - ✅ Update README if new setup steps are required
   - ✅ Document any new environment variables
   - ✅ Update architecture diagrams if applicable
   - ✅ **MODIFY THE README FILE DIRECTLY**

4. **Changelog** - UPDATE THE CHANGELOG FILE:
   - ✅ Document notable changes for the changelog
   - ✅ Include breaking changes if any
   - ✅ **UPDATE THE CHANGELOG FILE DIRECTLY**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of documentation needs identified
- **A detailed list of ALL documentation files and code comments added/updated (this proves you updated the code)**
- Specific files modified with documentation

---

# ⚠️ FINAL REMINDER ⚠️

**Identifying documentation needs without adding documentation is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the code files directly to add documentation.**
**You MUST show evidence of documentation changes in your summary.**
**This step is only complete when documentation has been added to the codebase.**`,
};

const optimizationTemplate: PipelineStepTemplate = {
  id: 'optimization',
  name: 'Performance',
  colorClass: 'bg-cyan-500/20',
  instructions: `## Performance Optimization Step

# ⚠️ CRITICAL REQUIREMENT: YOU MUST UPDATE THE CODE WITH OPTIMIZATIONS ⚠️

**THIS IS NOT OPTIONAL. AFTER IDENTIFYING OPTIMIZATION OPPORTUNITIES, YOU MUST UPDATE THE CODE.**

This step has TWO mandatory phases:
1. **REVIEW** the code for performance issues (identify bottlenecks)
2. **UPDATE** the code with optimizations (fix the performance issues)

**You cannot complete this step by only identifying performance issues. You MUST modify the code to optimize it.**

---

### Phase 1: Review Phase
Identify performance bottlenecks and optimization opportunities:

#### Code Performance
- Identify slow algorithms (O(n\u00B2) \u2192 O(n log n), etc.)
- Find unnecessary computations or redundant operations
- Identify inefficient loops and iterations
- Check for inappropriate data structures

#### Memory Usage
- Check for memory leaks
- Identify memory-intensive operations
- Check for proper cleanup of resources

#### Database/API
- Identify slow database queries (N+1 queries, missing indexes)
- Find opportunities for caching
- Identify API calls that could be batched

#### Frontend (if applicable)
- Identify bundle size issues
- Find render performance problems
- Identify opportunities for lazy loading
- Find expensive computations that need memoization

---

### Phase 2: Update Phase - ⚠️ MANDATORY ACTION REQUIRED ⚠️

**YOU MUST NOW MODIFY THE CODE TO APPLY OPTIMIZATIONS.**

**This is not optional. Every performance issue you identify must be addressed with code changes.**

#### Action Steps (You MUST complete these):

1. **Optimize Code Performance** - UPDATE THE CODE:
   - ✅ Optimize slow algorithms (O(n\u00B2) \u2192 O(n log n), etc.)
   - ✅ Remove unnecessary computations or redundant operations
   - ✅ Optimize loops and iterations
   - ✅ Use appropriate data structures
   - ✅ **MODIFY THE SOURCE FILES DIRECTLY WITH OPTIMIZATIONS**

2. **Fix Memory Issues** - UPDATE THE CODE:
   - ✅ Fix memory leaks
   - ✅ Optimize memory-intensive operations
   - ✅ Ensure proper cleanup of resources
   - ✅ **MAKE THE ACTUAL CODE CHANGES**

3. **Optimize Database/API** - UPDATE THE CODE:
   - ✅ Optimize database queries (add indexes, reduce N+1 queries)
   - ✅ Implement caching where appropriate
   - ✅ Batch API calls when possible
   - ✅ **MODIFY THE DATABASE/API CODE DIRECTLY**

4. **Optimize Frontend** (if applicable) - UPDATE THE CODE:
   - ✅ Minimize bundle size
   - ✅ Optimize render performance
   - ✅ Implement lazy loading where appropriate
   - ✅ Use memoization for expensive computations
   - ✅ **MODIFY THE FRONTEND CODE DIRECTLY**

5. **Profile and Measure**:
   - ✅ Profile the code to verify bottlenecks are fixed
   - ✅ Measure improvements achieved
   - ✅ **DOCUMENT THE PERFORMANCE IMPROVEMENTS**

---

### Summary Required
After completing BOTH review AND update phases, provide:
- A summary of performance issues identified
- **A detailed list of ALL optimizations applied to the code (this proves you updated the code)**
- Performance improvements achieved (with metrics if possible)
- Any remaining optimization opportunities

---

# ⚠️ FINAL REMINDER ⚠️

**Identifying performance issues without optimizing the code is INCOMPLETE and UNACCEPTABLE.**

**You MUST modify the code files directly with optimizations.**
**You MUST show evidence of optimization changes in your summary.**
**This step is only complete when code has been optimized.**`,
};

export const STEP_TEMPLATES: PipelineStepTemplate[] = [
  codeReviewTemplate,
  securityReviewTemplate,
  uxReviewTemplate,
  testingTemplate,
  documentationTemplate,
  optimizationTemplate,
];

export const getTemplateColorClass = (templateId: string): string => {
  const template = STEP_TEMPLATES.find((t) => t.id === templateId);
  return template?.colorClass || 'bg-blue-500/20';
};
