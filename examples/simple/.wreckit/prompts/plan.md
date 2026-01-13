# Planning Phase

## Task
Create an implementation plan and user stories for the following item.

## Item Details
- **ID:** {{id}}
- **Title:** {{title}}
- **Section:** {{section}}
- **Overview:** {{overview}}
- **Branch:** {{branch_name}}
- **Base Branch:** {{base_branch}}

## Research Summary
{{research}}

## Instructions
1. Break down the implementation into discrete user stories
2. Define clear acceptance criteria for each story
3. Prioritize stories (1 = highest priority)
4. Create a step-by-step implementation plan

## Output
Create these files at {{item_path}}:

1. **plan.md** - Detailed implementation plan with steps
2. **prd.json** - Structured user stories in this format:
```json
{
  "schema_version": 1,
  "id": "{{id}}",
  "branch_name": "{{branch_name}}",
  "user_stories": [
    {
      "id": "US-001",
      "title": "Story title",
      "acceptance_criteria": ["Criterion 1", "Criterion 2"],
      "priority": 1,
      "status": "pending",
      "notes": ""
    }
  ]
}
```

## Completion
When you have created both plan.md and prd.json, output the following signal:
{{completion_signal}}
