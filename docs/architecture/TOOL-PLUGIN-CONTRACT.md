# Tool / Plugin Contract

**Status:** PROPOSED IMPLEMENTATION CONTRACT

## Internal tool descriptor

Conceptual:

~~~ts
type ToolDescriptor = {
  id: string;
  version: string;
  source: "builtin" | "mcp" | "plugin";
  capabilities: string[];
  riskClass: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  permissions: {
    filesystem?: string[];
    network?: string[];
    secrets?: string[];
    mutation: boolean;
  };
};
~~~

## Invocation pipeline

~~~text
Role requests tool
  ↓
Workflow node allows?
  ↓
Tool registered?
  ↓
Sandbox/data policy allows?
  ↓
Human approval required?
  ↓
Invoke adapter
  ↓
Normalize result
  ↓
Redact/persist evidence
~~~

## MCP mapping

MCP tools/resources/prompts are discovered through an MCP adapter but normalized into internal descriptors before use.

Protocol capability does not automatically grant:
- write authority
- secret access
- network authority
- human approval bypass

## External tool installation

Future UI/CLI should show:
- source
- version/ref
- requested capabilities
- secrets
- network destinations
- filesystem scope
- signature/provenance if available

before enablement.
