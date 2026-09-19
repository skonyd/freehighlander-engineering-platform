# Prompt Contract and Versioning

**Status:** PROPOSED

## Goal

Prompts are executable behavior and must be versioned like code.

## Prompt package

A logical role prompt should be split into:

- role identity / objective
- authority boundaries
- input contract
- evidence requirements
- output schema
- prohibited behavior
- task-specific content

## Stable vs dynamic

Keep stable contract content separate from volatile task input.

This improves:
- auditability
- prompt caching
- reproducibility
- targeted prompt changes

## Versioning

A prompt contract change should update a semantic version/hash.

Examples:

~~~text
repo-analyst@1
test-reviewer@3
final-reviewer@2
~~~

Artifacts should record the exact prompt/contract version.

## Review rule

Changes to prompts controlling:
- authority
- adjudication
- security review
- final review

should be treated as behavior changes, not documentation-only edits.

## Testing

Prompt contracts should have:
- schema tests
- required-section tests
- golden/adversarial examples where useful
- benchmark checks for significant changes

## No hidden authority

A prompt cannot grant itself more authority than policy allows.

Policy validation occurs outside the model.
