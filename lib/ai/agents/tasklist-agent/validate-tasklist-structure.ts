import type { TasklistValidationResult, TasklistStructure } from "./agent-state";

function parseTasklistStructure(draft: string, sourcePlanUri: string): TasklistStructure {
  const lines = draft.split("\n");
  
  let title = "";
  const steps: Array<{
    title: string;
    description?: string;
    acceptance?: string;
    verification?: string;
  }> = [];
  const checklistItems: string[] = [];
  const nonGoals: string[] = [];
  const risks: string[] = [];
  const pausePoints: string[] = [];
  
  let currentSection = "";
  let currentStep: {
    title: string;
    description?: string;
    acceptance?: string;
    verification?: string;
  } | null = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("# ")) {
      title = trimmed.slice(2).trim();
      continue;
    }
    
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).trim().toLowerCase();
      if (currentStep) {
        steps.push(currentStep);
        currentStep = null;
      }
      continue;
    }
    
    if (trimmed.startsWith("### ")) {
      if (currentStep) {
        steps.push(currentStep);
      }
      currentStep = { title: trimmed.slice(4).trim() };
      continue;
    }
    
    if (currentStep) {
      if (trimmed.startsWith("- 描述：") || trimmed.startsWith("描述：")) {
        currentStep.description = trimmed.replace(/^-?\s*描述：\s*/, "").trim();
      } else if (trimmed.startsWith("- 验收：") || trimmed.startsWith("验收：")) {
        currentStep.acceptance = trimmed.replace(/^-?\s*验收：\s*/, "").trim();
      } else if (trimmed.startsWith("- 验证：") || trimmed.startsWith("验证：")) {
        currentStep.verification = trimmed.replace(/^-?\s*验证：\s*/, "").trim();
      } else if (trimmed.startsWith("- ")) {
        if (!currentStep.description) {
          currentStep.description = trimmed.slice(2).trim();
        }
      }
      continue;
    }
    
    if (currentSection === "步骤" || currentSection === "主要步骤") {
      if (trimmed.match(/^\d+\.\s/)) {
        const stepTitle = trimmed.replace(/^\d+\.\s/, "").trim();
        if (stepTitle) {
          steps.push({ title: stepTitle });
        }
      } else if (trimmed.startsWith("- ")) {
        const stepTitle = trimmed.slice(2).trim();
        if (stepTitle) {
          steps.push({ title: stepTitle });
        }
      }
    }
    
    if (currentSection === "勾选项" || currentSection === "checklist" || currentSection === "清单") {
      if (trimmed.startsWith("- [ ] ") || trimmed.startsWith("- [x] ")) {
        checklistItems.push(trimmed.replace(/^-\s*[\[\]xX\s]*\s*/, "").trim());
      } else if (trimmed.startsWith("- ")) {
        checklistItems.push(trimmed.slice(2).trim());
      }
    }
    
    if (currentSection === "非目标") {
      if (trimmed.startsWith("- ")) {
        nonGoals.push(trimmed.slice(2).trim());
      }
    }
    
    if (currentSection === "风险" || currentSection === "风险与暂停点") {
      if (trimmed.startsWith("- ")) {
        risks.push(trimmed.slice(2).trim());
      }
    }
    
    if (currentSection === "暂停点" || currentSection === "风险与暂停点") {
      if (trimmed.includes("暂停") || trimmed.includes("确认")) {
        pausePoints.push(trimmed);
      }
    }
  }
  
  if (currentStep) {
    steps.push(currentStep);
  }
  
  const hasAnyVerificationContent = steps.some(s => s.verification) || 
    lines.some(l => 
      l.includes("验证") || 
      l.includes("测试计划") || 
      l.includes("test plan") || 
      l.includes("test cases") || 
      /测试[\s:]/.test(l) ||
      /verification[\s:]/.test(l.toLowerCase())
    );
  
  return {
    title,
    sourcePlanUri,
    steps,
    checklistItems,
    hasAnyVerificationContent,
    nonGoals,
    risks,
    pausePoints,
  };
}

function getBlockingIssues(structure: TasklistStructure): string[] {
  const issues: string[] = [];
  
  if (!structure.title || structure.title.length < 3) {
    issues.push("缺少标题或标题过短");
  }
  
  if (!structure.sourcePlanUri) {
    issues.push("缺少来源版本方案引用");
  }
  
  if (structure.steps.length === 0) {
    issues.push("缺少主要步骤");
  }
  
  if (structure.checklistItems.length === 0) {
    issues.push("缺少勾选项清单");
  }
  
  if (!structure.hasAnyVerificationContent) {
    issues.push("缺少验证内容");
  }
  
  return issues;
}

function getWarnings(structure: TasklistStructure): string[] {
  const warnings: string[] = [];
  
  if (structure.steps.length < 3) {
    warnings.push("步骤数量较少，建议至少3个步骤");
  }
  
  const stepsWithoutAcceptance = structure.steps.filter(s => !s.acceptance);
  if (stepsWithoutAcceptance.length > 0) {
    warnings.push(`${stepsWithoutAcceptance.length} 个步骤缺少验收标准`);
  }
  
  if (structure.nonGoals.length === 0) {
    warnings.push("建议添加非目标说明");
  }
  
  if (structure.risks.length === 0) {
    warnings.push("建议识别关键风险");
  }
  
  return warnings;
}

export function validateTasklistStructure(draft: string, sourcePlanUri: string): TasklistValidationResult {
  const structure = parseTasklistStructure(draft, sourcePlanUri);
  const blockingIssues = getBlockingIssues(structure);
  const warnings = getWarnings(structure);
  
  return {
    isValid: blockingIssues.length === 0,
    blockingIssues,
    warnings,
    structure,
  };
}