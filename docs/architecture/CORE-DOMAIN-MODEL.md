# Core Domain Model

**Status:** DRAFT

## Workspace
Organization(future), Workspace, Project, Repository.

## Planning
Idea, Requirement, NFR, Assumption, Risk, Decision/ADR, WorkItem.

## Orchestration
Workflow, WorkflowVersion, WorkflowRun, Node, NodeRun, Role, RoleVersion, Binding, Provider, Model, Tool.

## Evidence
Artifact, ArtifactRelation, Evidence, Finding, Adjudication, Approval.

## Quality
TestEvidence, VerificationRun, BenchmarkSample, BenchmarkVerdict, PromotionDecision.

## Delivery/runtime
Release, Deployment, Environment, MetricReference, Alert, Incident, Postmortem.

## Lineage
```text
Requirement → WorkItem → Code/PR → TestEvidence → Release → Deployment → Metric/Incident
```

İlk implementation relational olabilir; graph database zorunlu değildir.
