# Research — Agent-friendly Repository Continuity

**Date:** 2026-09-19  
**Status:** RESEARCH INPUT

Bu çalışma repository'nin farklı makineler, IDE'ler ve modeller arasında taşınabilir context sunması için güncel GitHub agent customization yaklaşımını değerlendirdi.

## Bulgular

GitHub repository-wide instructions için `.github/copilot-instructions.md` destekliyor; path-specific talimatlar `.github/instructions/*.instructions.md` ile verilebiliyor. Ayrıca `AGENTS.md`, `CLAUDE.md` ve `GEMINI.md` agent talimatı olarak desteklenebiliyor.

GitHub ayrıca:
- reusable prompt files: `.github/prompts/*.prompt.md`
- repository custom agents: `.github/agents/*.agent.md`
- PR/issue templates
- CODEOWNERS / branch protections / rulesets

gibi mekanizmaları sağlıyor.

## FreeHighlander'a uygulanan sonuçlar

1. Root `AGENTS.md` vendor-neutral kanonik giriş olarak kalır.
2. Vendor-specific files yalnız root contract'a yönlendirir.
3. Path-specific instructions global context'i şişirmeden ilgili alana özel kurallar verir.
4. Resume/checkpoint reusable prompt olarak tanımlanır.
5. Custom agents logical role yardımcısıdır; platform authority değildir.
6. PR template her değişiklikte work item, risk, evidence ve handoff bilgisini ister.
7. CODEOWNERS hassas control-plane/policy/state alanlarını explicit human owner'a yönlendirir.
8. Context profiles token kullanımını sınırlar.

## Kaynaklar

- GitHub repository instructions:
  https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions
- Custom instruction support matrix:
  https://docs.github.com/en/copilot/reference/custom-instructions-support
- Copilot customization cheat sheet:
  https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- Custom agents:
  https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents
- Custom agent configuration:
  https://docs.github.com/en/copilot/reference/custom-agents-configuration
- PR standardization:
  https://docs.github.com/en/pull-requests/reference/managing-and-standardizing-pull-requests

## Bilinçli olarak etkinleştirilmemiş

GitHub Agentic Workflows güçlü bir seçenek olsa da FreeHighlander kendi workflow/authority modelini geliştiriyor. Bu nedenle şimdilik ayrı bir GitHub agentic workflow authority katmanı eklenmiyor; ileride adapter olarak değerlendirilebilir.
