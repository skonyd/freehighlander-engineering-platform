# Role / Model Router

## Ana ilke

```text
ROLE ≠ MODEL
```

Logical role sabit, model/provider binding değişkendir.

Örnek:

```text
Role: test-reviewer
Primary: opus-medium
Fallback: gpt56-high
```

Kota değişince model değişebilir; role contract ve authority değişmez.

## Binding metadata

Her binding:

- provider
- model
- effort
- quota_group
- independence_group
- capability set
- context limit
- optional cost metadata

## Fallback kuralı

Fallback yalnız availability sınıfında:

- quota exhausted
- rate limit
- auth/provider unavailable
- CLI/service unavailable

Fallback YOK:

- semantic FAIL
- BLOCKED
- INSUFFICIENT
- gerçek finding
- malformed semantic output (varsayılan fail-closed)

Bu, model shopping'i engeller.

## Role package

Rol yalnız prompt değildir:

```text
Role =
  prompt
+ input contract
+ output schema
+ tools
+ permissions
+ evidence rules
+ authority
+ model bindings
+ evaluation policy
+ sandbox
```

Yeni role core orchestrator değiştirilmeden eklenebilmelidir.

Örnek roller:

- secure-code-reviewer
- cve-dependency-analyst
- pentest-reviewer
- threat-modeler
- kubernetes-security-reviewer
- database-reviewer
- performance-reviewer
- architecture-reviewer
- ddd-reviewer
- sre-reviewer
- privacy-reviewer

## UI hedefi

Role Manager ekranından:

- role create/delete/version
- input/output contract
- tools/permissions
- authority
- primary/fallback model
- timeout/retry
- risk scope
- workflow'a ekleme
