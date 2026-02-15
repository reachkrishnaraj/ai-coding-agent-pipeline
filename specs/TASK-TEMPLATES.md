# TASK TEMPLATES — Requirements Specification

**Version:** 1.0
**Date:** February 2026
**Status:** Draft
**Audience:** Product, Engineering, Design

---

## 1. Overview

### Problem Statement

Users of the AI Pipeline frequently create similar tasks repeatedly:
- "Fix a bug in the payment module" (similar structure each time)
- "Add unit tests to a new feature" (standard test task)
- "Refactor a service to use dependency injection" (refactor template)
- "Document an API endpoint" (docs template)

Currently, users must fill out the entire task form from scratch each time, leading to:
- **Repetitive data entry** — describing the same type of work multiple times
- **Inconsistent criteria** — acceptance criteria vary for similar task types
- **Wasted time** — no reusable task patterns
- **Lower velocity** — new team members lack guidance on what a good task looks like

### Solution

Task Templates allow users to:
1. **Create reusable task patterns** — Pre-populate task forms with common fields
2. **Use placeholders** — Define variables (e.g., `{{component_name}}`, `{{file_path}}`) that users fill in at task creation time
3. **Share templates** — Use pre-built templates (bug fix, feature, refactor, test, docs) or create custom templates
4. **Save time** — Jump from "New Task" → select template → fill in a few variables → submit, instead of filling out the entire form

### Benefits

- **50% faster task creation** for repetitive work (2 mins → 1 min)
- **Better task quality** — consistent acceptance criteria and file hints
- **Onboarding** — new team members learn task patterns from templates
- **Standardization** — organization can enforce best practices via templates

---

## 2. User Stories

### Epic: Task Templates

#### Story 1: Use a Pre-Built Template

**As a** developer
**I want to** select a pre-built template (e.g., "Bug Fix") when creating a task
**So that** I don't have to start from scratch for common task types

**Acceptance Criteria:**
- [ ] Task creation form has a "Template" dropdown or card selector
- [ ] Pre-built templates include: Bug Fix, Feature, Refactor, Test, Docs
- [ ] Selecting a template pre-populates the form with default values
- [ ] Template variables (e.g., `{{component_name}}`) appear as input fields
- [ ] User can override pre-filled values
- [ ] Creating a task from a template takes < 1 minute

---

#### Story 2: Create a Custom Template

**As a** developer
**I want to** save the current task I'm creating as a reusable custom template
**So that** I can use the same pattern for future tasks

**Acceptance Criteria:**
- [ ] Task form has a "Save as Template" button
- [ ] Dialog prompts for template name and description
- [ ] Template is saved to the user's private template library
- [ ] User can immediately use the saved template for new tasks
- [ ] Template appears in the dropdown/selector on the New Task form

---

#### Story 3: Manage My Templates

**As a** developer
**I want to** view, edit, and delete my custom templates
**So that** I can maintain and refine my task patterns

**Acceptance Criteria:**
- [ ] Dashboard has a "Templates" section or page
- [ ] Shows list of user's custom templates (not pre-built ones)
- [ ] Can click "Edit" to modify template name, description, or fields
- [ ] Can click "Delete" to remove a template (with confirmation)
- [ ] Can preview a template before using it
- [ ] Edit/delete operations require confirmation

---

#### Story 4: Share Team Templates

**As a** tech lead
**I want to** create organization-level templates that the whole team uses
**So that** everyone follows the same task patterns and best practices

**Acceptance Criteria:**
- [ ] Admins can create "Global Templates" visible to all users
- [ ] Global templates appear in the template selector for all users
- [ ] Users cannot delete global templates (only admins)
- [ ] Global templates can be marked as "read-only" or editable
- [ ] Global templates include documentation/examples

---

#### Story 5: Template Variables with Examples

**As a** developer
**I want to** see helpful examples and hints for template variables
**So that** I understand what to fill in for each placeholder

**Acceptance Criteria:**
- [ ] Each template variable shows a label, description, and example value
- [ ] Variables can be marked as required or optional
- [ ] Form validation prevents submission if required variables are missing
- [ ] Examples appear as placeholder text or tooltips
- [ ] Variables are replaced in the final task description

---

#### Story 6: Preview Template Before Using

**As a** developer
**I want to** preview how a template will look with my variable inputs
**So that** I can verify the task before submitting

**Acceptance Criteria:**
- [ ] Form shows a "Preview" button or live preview panel
- [ ] Preview displays the final task description with variables filled in
- [ ] Preview shows the formatted task for GitHub Issue body
- [ ] User can edit variables and see the preview update in real-time

---

#### Story 7: Repository-Specific Templates

**As a** a finance-service developer
**I want to** have templates specific to the finance-service repo
**So that** templates include relevant files, modules, and criteria for that service

**Acceptance Criteria:**
- [ ] Templates can specify a default repo (e.g., `mothership/finance-service`)
- [ ] When selecting a repo-specific template, the repo is pre-selected
- [ ] Templates can include repo-specific file hints (e.g., `src/modules/payment/`)
- [ ] Global templates can be repo-agnostic (work for any repo)
- [ ] Users can override the repo when using a template

---

---

## 3. Template Types

### 3.1 Pre-Built Templates

These ship with the system and cannot be deleted. Admins can customize them.

| Template Name | Description | Use Case | Variables |
|---------------|-------------|----------|-----------|
| **Bug Fix** | Fix a known bug or defect | Payment status not updating, API timeout handling | `component_name`, `bug_description`, `expected_behavior`, `actual_behavior` |
| **Feature** | Implement a new feature | Add refund workflow, Add export to CSV | `feature_name`, `user_story`, `acceptance_criteria`, `files` |
| **Refactor** | Improve existing code | Migrate to new pattern, Extract service | `current_component`, `target_pattern`, `acceptance_criteria` |
| **Test Coverage** | Add or improve tests | Add unit tests to Payment service | `component_name`, `test_type`, `coverage_goal` |
| **Documentation** | Write docs | Document API endpoint, Write runbook | `doc_type`, `topic`, `audience` |

### 3.2 Custom Templates

Users create these from existing tasks or via a template editor. Custom templates are private to the user by default.

**Examples:**
- "Fix Stripe Integration Bug"
- "Add E2E Test for Invoice Workflow"
- "Refactor Service to Use DI"

---

## 4. Template Schema

### 4.1 Core Template Document

MongoDB collection: `templates`

```typescript
interface TaskTemplate {
  _id: ObjectId;

  // Identity & metadata
  name: string;                    // "Bug Fix", "Add Feature"
  description: string;             // Longer explanation of when to use this template
  templateType: 'builtin' | 'custom' | 'global';  // Who owns this template

  // Template ownership
  ownerId?: string;                // Slack/GitHub ID if custom (null for pre-built)
  organizationId?: string;         // For global templates (future: RBAC)
  isReadOnly: boolean;             // True for pre-built and some global templates

  // Default values
  defaultRepo?: string;            // "mothership/finance-service"
  defaultTaskType?: string;        // "bug-fix", "feature", etc.
  defaultPriority?: 'normal' | 'urgent';

  // Template content with variables
  descriptionTemplate: string;     // "Fix {{bug_description}} in {{component_name}}"
  filesHintTemplate?: string[];    // ["src/modules/{{component_name}}/"]
  acceptanceCriteriaTemplate?: string[];  // ["[ ] {{component_name}} works correctly"]

  // Variable definitions
  variables: {
    [variableName: string]: {
      label: string;               // "Component Name"
      description: string;         // "The name of the service/module"
      example: string;             // "PaymentService"
      required: boolean;           // true/false
      type?: 'text' | 'select' | 'multiline' | 'array';  // Input type
      options?: string[];          // For select type: ["PaymentService", "InvoiceService"]
      defaultValue?: string;
      placeholder?: string;
      helpText?: string;          // Additional guidance
    };
  };

  // Visibility and permissions
  visibility: 'private' | 'organization' | 'public';  // Future: public templates marketplace
  allowedUsers?: string[];         // List of user IDs who can use this template (future: team templates)

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;               // GitHub username
  usageCount: number;              // How many times this template has been used
  favoriteCount: number;           // Star/favorite count

  // UI/UX hints
  icon?: string;                   // "🐛" for bug fix, "✨" for feature
  category?: string;               // "bug-fix", "feature", etc.
  tags?: string[];                 // ["payment", "stripe", "webhook"]
  estimatedTimeMinutes?: number;   // "This task typically takes 30 minutes"
}
```

### 4.2 Indexes

```typescript
TemplateSchema.index({ templateType: 1 });          // Filter by type
TemplateSchema.index({ ownerId: 1 });               // User's custom templates
TemplateSchema.index({ defaultRepo: 1 });           // Repo-specific templates
TemplateSchema.index({ name: 1, ownerId: 1 });      // Unique template name per user
TemplateSchema.index({ visibility: 1 });            // Global/public templates
TemplateSchema.index({ createdAt: -1 });            // Sorted by date
TemplateSchema.index({ usageCount: -1 });           // Popular templates
```

---

## 5. Template Variables

### 5.1 Placeholder Syntax

Variables are replaced using **Handlebars-style syntax**: `{{variable_name}}`

**Examples:**
- `{{component_name}}` → User enters "PaymentService" → "Fix bug in PaymentService"
- `{{file_path}}` → User enters "src/modules/payment" → `["src/modules/payment/..."]`
- `{{test_type}}` → User selects "unit" from dropdown → "Add unit tests"

### 5.2 Variable Types

| Type | Description | Example | Input UI |
|------|-------------|---------|----------|
| `text` | Short text | "PaymentService", "Bug title" | Single-line text input |
| `multiline` | Long text | Task description | Multi-line textarea |
| `select` | Choose from list | "unit" \| "integration" \| "e2e" | Dropdown or radio buttons |
| `array` | Multiple values | ["src/modules/payment", "src/lib/stripe"] | Tag input or multi-select |
| `url` | GitHub URL | "github.com/mothership/finance-service" | URL input with validation |

### 5.3 Variable Replacement Rules

1. **During task creation:** When user fills in variables, system replaces `{{variable_name}}` with their input
2. **Case sensitivity:** `{{Component_Name}}` and `{{component_name}}` are treated as different variables
3. **Escaping:** If user needs a literal `{{text}}`, they can use `\{{text}}`
4. **Nested variables:** Not supported initially (keep it simple)
5. **Validation:** Variables marked `required: true` must be filled before form submission

### 5.4 Examples

#### Template: "Bug Fix"

**Description Template:**
```
Fix {{bug_description}} in {{component_name}}.

Currently: {{actual_behavior}}
Expected: {{expected_behavior}}
```

**Variables:**
- `bug_description` (text, required) — "Payment status not updating"
- `component_name` (select, required) — Options: ["PaymentService", "InvoiceService", "RefundService"]
- `actual_behavior` (multiline, required) — "User describes what currently happens"
- `expected_behavior` (multiline, required) — "User describes desired behavior"

**User Input Example:**
- `bug_description`: "Stripe webhook not updating payment status"
- `component_name`: "PaymentService"
- `actual_behavior`: "Payment stays in 'Processing' state even after Stripe confirms success"
- `expected_behavior`: "Payment should move to 'Succeeded' within 1 second of webhook"

**Result (before LLM):**
```
Fix Stripe webhook not updating payment status in PaymentService.

Currently: Payment stays in 'Processing' state even after Stripe confirms success
Expected: Payment should move to 'Succeeded' within 1 second of webhook
```

---

#### Template: "Feature"

**Description Template:**
```
Add {{feature_name}} to {{component_name}}.

User story: {{user_story}}

Acceptance criteria:
{{acceptance_criteria}}
```

**Variables:**
- `feature_name` (text, required)
- `component_name` (text, required)
- `user_story` (multiline, required)
- `acceptance_criteria` (array, required) — Multiple text inputs for each criterion

---

#### Template: "Test Coverage"

**Description Template:**
```
Add {{test_type}} tests to {{component_name}}.

Coverage goal: {{coverage_goal}}%
```

**Variables:**
- `test_type` (select, required) — ["unit", "integration", "e2e"]
- `component_name` (text, required)
- `coverage_goal` (text, optional, default: "80") — User enters a number

---

## 6. UI/UX Design

### 6.1 Template Selector (New Task Form)

**Current Flow:**
```
[New Task] button → Fill in all fields manually
```

**New Flow:**
```
[New Task] button → Select Template (or "Custom") → Fill in variables → Preview → Submit
```

### 6.2 Wireframes

#### A. Task Type Selection

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Pipeline - New Task                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Step 1: Choose a Template                                      │
│                                                                 │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│ │      🐛        │  │      ✨        │  │      🔄        │   │
│ │   Bug Fix      │  │   Feature      │  │  Refactor      │   │
│ │                │  │                │  │                │   │
│ │ [SELECT]       │  │ [SELECT]       │  │ [SELECT]       │   │
│ └────────────────┘  └────────────────┘  └────────────────┘   │
│                                                                 │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│ │      🧪        │  │      📝        │  │      ➕        │   │
│ │   Test         │  │   Docs         │  │ Custom / None  │   │
│ │                │  │                │  │                │   │
│ │ [SELECT]       │  │ [SELECT]       │  │ [SELECT]       │   │
│ └────────────────┘  └────────────────┘  └────────────────┘   │
│                                                                 │
│ ────────────────────────────────────────────────────────────   │
│ Or browse more templates...  [View All]                        │
└─────────────────────────────────────────────────────────────────┘
```

#### B. Variable Input Form

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Pipeline - New Bug Fix Task                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Step 2: Fill in Details (Bug Fix template)                    │
│                                                                 │
│ Component Name *                                               │
│ [Dropdown: PaymentService | InvoiceService | RefundService]   │
│                                                                 │
│ Bug Description *                                              │
│ [Text input]                                                   │
│ 📝 Example: "Stripe webhook not updating payment status"      │
│                                                                 │
│ Current Behavior *                                             │
│ [Textarea]                                                      │
│ 📝 Describe what currently happens                            │
│                                                                 │
│ Expected Behavior *                                            │
│ [Textarea]                                                      │
│ 📝 Describe what should happen instead                        │
│                                                                 │
│ Repository                                                     │
│ [Text: mothership/finance-service]  (pre-filled)             │
│                                                                 │
│ Priority                                                       │
│ ( ) Normal  (•) Urgent                                        │
│                                                                 │
│ ────────────────────────────────────────────────────────────   │
│ [← Back]  [Save as Template]  [Preview →]  [Submit Task]      │
└─────────────────────────────────────────────────────────────────┘
```

#### C. Preview Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ Preview - Bug Fix Task                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Title (for GitHub Issue):                                      │
│ "Fix Stripe webhook not updating payment status in             │
│ PaymentService"                                                │
│                                                                 │
│ Description:                                                   │
│ Fix Stripe webhook not updating payment status in              │
│ PaymentService.                                                │
│                                                                 │
│ Currently: Payment stays in 'Processing' state even after      │
│ Stripe confirms success                                        │
│ Expected: Payment should move to 'Succeeded' within 1 second   │
│ of webhook                                                     │
│                                                                 │
│ Repository: mothership/finance-service                         │
│ Priority: urgent                                               │
│                                                                 │
│ ────────────────────────────────────────────────────────────   │
│ [← Edit]  [Submit Task]                                        │
└─────────────────────────────────────────────────────────────────┘
```

#### D. Template Management Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Pipeline - Templates                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ My Templates                                                   │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Stripe Payment Bug Fix                                   │  │
│ │ Custom template for payment bugs in stripe integration   │  │
│ │ Used 3 times • Updated 2 days ago                       │  │
│ │ [Use]  [Edit]  [Delete]                                │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ Add E2E Test for Invoice Workflow                        │  │
│ │ Template for adding end-to-end tests to invoice module   │  │
│ │ Used 1 time • Created 1 week ago                         │  │
│ │ [Use]  [Edit]  [Delete]                                │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ────────────────────────────────────────────────────────────   │
│                                                                 │
│ Organization Templates (Global)                                │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ 🐛 Bug Fix                                              │  │
│ │ Standard template for fixing bugs                        │  │
│ │ Used 24 times • Created by @alice                        │  │
│ │ [Use]  [Preview]                                        │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ ✨ Feature                                              │  │
│ │ Standard template for implementing new features          │  │
│ │ Used 18 times • Created by @alice                        │  │
│ │ [Use]  [Preview]                                        │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│ [← Back]  [Create New Template]                               │
└─────────────────────────────────────────────────────────────────┘
```

#### E. Edit Template Dialog

```
┌──────────────────────────────────────────────────────────┐
│ Edit Template                                            │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ Template Name                                           │
│ [Stripe Payment Bug Fix]                               │
│                                                          │
│ Description                                             │
│ [Textarea: Use this template when fixing bugs related  │
│  to Stripe payment handling...]                        │
│                                                          │
│ Default Repository (optional)                           │
│ [mothership/finance-service]                           │
│                                                          │
│ Variables                                               │
│                                                          │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Variable Name     | Type    | Required | Default  │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ component_name   | select  | ✓        | -        │ │
│ │ bug_description  | text    | ✓        | -        │ │
│ │ expected_behavior| multiline| ✓       | -        │ │
│ └────────────────────────────────────────────────────┘ │
│                                                          │
│ [+ Add Variable]  [Edit Variable]  [Delete Variable]   │
│                                                          │
│ ────────────────────────────────────────────────────────│
│ [Cancel]  [Save Changes]                               │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Mobile Responsiveness

- Template selector uses horizontal scroll on mobile
- Variable input form stacks vertically
- Preview is full-width on mobile, side-by-side on desktop
- All buttons remain thumb-friendly (48px minimum)

---

## 7. Storage & Scope

### 7.1 Template Ownership & Visibility

| Template Type | Owner | Visibility | Scope | Use Case |
|---------------|-------|-----------|-------|----------|
| **Pre-built** | System | Global | All users | Bug Fix, Feature, Refactor, Test, Docs |
| **Custom** | Individual user | Private | Only creator | User's personal task patterns |
| **Global** | Admin or Team | Organization | All users | Team best practices, standardized patterns |
| **Repo-specific** | Team or Admin | Organization (repo-scoped) | Users working on repo | Finance-service specific patterns |

### 7.2 Access Control

| Action | Pre-Built | Custom (Own) | Custom (Others) | Global |
|--------|-----------|--------------|-----------------|--------|
| View | ✓ | ✓ | ✗ | ✓ |
| Use | ✓ | ✓ | ✗ | ✓ |
| Edit | Admins only | ✓ | ✗ | Admins only |
| Delete | ✗ | ✓ | ✗ | Admins only |
| Create | Admins only | ✓ | Admins create global | Admins only |

---

## 8. Database Changes

### 8.1 New Collection: `templates`

```typescript
// src/common/schemas/template.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TemplateDocument = TaskTemplate & Document;

interface TemplateVariable {
  label: string;
  description: string;
  example: string;
  required: boolean;
  type?: 'text' | 'select' | 'multiline' | 'array' | 'url';
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  helpText?: string;
}

@Schema({ timestamps: true, collection: 'templates' })
export class TaskTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    required: true,
    enum: ['builtin', 'custom', 'global'],
    index: true
  })
  templateType: string;

  @Prop()
  ownerId?: string;  // GitHub username or user ID

  @Prop()
  organizationId?: string;

  @Prop({ default: false })
  isReadOnly: boolean;

  @Prop()
  defaultRepo?: string;

  @Prop()
  defaultTaskType?: string;

  @Prop()
  defaultPriority?: string;

  @Prop({ required: true })
  descriptionTemplate: string;

  @Prop({ type: [String] })
  filesHintTemplate?: string[];

  @Prop({ type: [String] })
  acceptanceCriteriaTemplate?: string[];

  @Prop({ type: Object, required: true })
  variables: Record<string, TemplateVariable>;

  @Prop({
    default: 'private',
    enum: ['private', 'organization', 'public'],
    index: true
  })
  visibility: string;

  @Prop({ type: [String] })
  allowedUsers?: string[];

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ default: 0 })
  favoriteCount: number;

  @Prop()
  icon?: string;

  @Prop()
  category?: string;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop()
  estimatedTimeMinutes?: number;

  @Prop()
  createdBy: string;
}

export const TemplateSchema = SchemaFactory.createForClass(TaskTemplate);

// Indexes
TemplateSchema.index({ templateType: 1 });
TemplateSchema.index({ ownerId: 1 });
TemplateSchema.index({ defaultRepo: 1 });
TemplateSchema.index({ name: 1, ownerId: 1 });
TemplateSchema.index({ visibility: 1 });
TemplateSchema.index({ createdAt: -1 });
TemplateSchema.index({ usageCount: -1 });
```

### 8.2 Update Task Schema

Add field to track which template was used:

```typescript
@Prop()
templateId?: string;  // Reference to the template used (for analytics)
```

---

## 9. API Endpoints

### 9.1 Template CRUD

#### GET /api/templates

List available templates (pre-built, custom, global).

**Query Parameters:**
- `type` — 'builtin' | 'custom' | 'global' (optional, default: all)
- `repo` — Filter by repo (e.g., 'mothership/finance-service', optional)
- `page` — Pagination (default: 1)
- `limit` — Results per page (default: 20)
- `search` — Search by name (optional)
- `sort` — Sort by 'name' | 'usageCount' | 'createdAt' (optional)

**Response (200):**
```json
{
  "templates": [
    {
      "id": "507f1f77bcf86cd799439011",
      "name": "Bug Fix",
      "description": "Template for fixing bugs",
      "templateType": "builtin",
      "icon": "🐛",
      "usageCount": 24,
      "variables": [
        {
          "name": "component_name",
          "label": "Component Name",
          "type": "select",
          "required": true,
          "options": ["PaymentService", "InvoiceService"]
        }
      ],
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 20
}
```

---

#### GET /api/templates/:id

Get a specific template with full details.

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Bug Fix",
  "description": "...",
  "templateType": "builtin",
  "descriptionTemplate": "Fix {{bug_description}} in {{component_name}}.",
  "variables": {
    "component_name": {
      "label": "Component Name",
      "description": "The service or module to fix",
      "example": "PaymentService",
      "required": true,
      "type": "select",
      "options": ["PaymentService", "InvoiceService", "RefundService"]
    },
    "bug_description": {
      "label": "Bug Description",
      "type": "text",
      "required": true,
      "example": "Stripe webhook not firing"
    }
  },
  "defaultRepo": "mothership/finance-service",
  "createdBy": "alice",
  "usageCount": 24
}
```

---

#### POST /api/templates

Create a new custom template.

**Request (authenticated, user must be logged in):**
```json
{
  "name": "Stripe Payment Bug Fix",
  "description": "For bugs in Stripe payment handling",
  "descriptionTemplate": "Fix {{bug_description}} in {{component_name}}.\n\nCurrently: {{actual_behavior}}\nExpected: {{expected_behavior}}",
  "defaultRepo": "mothership/finance-service",
  "variables": {
    "component_name": {
      "label": "Component Name",
      "type": "select",
      "required": true,
      "options": ["PaymentService", "WebhookService"],
      "example": "PaymentService"
    },
    "bug_description": {
      "label": "Bug Title",
      "type": "text",
      "required": true,
      "placeholder": "e.g., Webhook not firing"
    },
    "actual_behavior": {
      "label": "Current Behavior",
      "type": "multiline",
      "required": true
    },
    "expected_behavior": {
      "label": "Expected Behavior",
      "type": "multiline",
      "required": true
    }
  }
}
```

**Response (201):**
```json
{
  "id": "new_template_id",
  "name": "Stripe Payment Bug Fix",
  "templateType": "custom",
  "ownerId": "krishna",
  "createdAt": "2026-02-15T12:30:00Z"
}
```

---

#### PUT /api/templates/:id

Update a template (owner or admin only).

**Request:**
```json
{
  "name": "Stripe Payment Bug Fix v2",
  "description": "Updated description",
  "variables": {
    "component_name": { ... }
  }
}
```

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Stripe Payment Bug Fix v2",
  "updatedAt": "2026-02-15T12:35:00Z"
}
```

---

#### DELETE /api/templates/:id

Delete a custom template (owner only).

**Response (204):** No content

---

### 9.2 Template Application

#### POST /api/templates/:id/apply

Apply a template and get a pre-filled task form data.

**Request:**
```json
{
  "variables": {
    "component_name": "PaymentService",
    "bug_description": "Stripe webhook not firing",
    "actual_behavior": "Payment stays pending",
    "expected_behavior": "Payment should update to succeeded"
  }
}
```

**Response (200):**
```json
{
  "templateId": "507f1f77bcf86cd799439011",
  "description": "Fix Stripe webhook not firing in PaymentService.\n\nCurrently: Payment stays pending\nExpected: Payment should update to succeeded",
  "repo": "mothership/finance-service",
  "taskType": "bug-fix",
  "priority": "normal",
  "filesHint": ["src/modules/payment/"],
  "acceptanceCriteria": [
    "[ ] PaymentService correctly handles webhook",
    "[ ] Payment updates to succeeded within 1 second"
  ]
}
```

---

### 9.3 Template Favorites

#### POST /api/templates/:id/favorite

Mark a template as favorite.

**Response (200):**
```json
{ "favorited": true, "favoriteCount": 5 }
```

#### DELETE /api/templates/:id/favorite

Unfavorite a template.

**Response (200):**
```json
{ "favorited": false, "favoriteCount": 4 }
```

---

### 9.4 Usage Analytics

#### GET /api/templates/analytics/usage

Get usage statistics (admin only).

**Response (200):**
```json
{
  "totalTemplates": 8,
  "customTemplates": 12,
  "globalTemplates": 5,
  "mostUsedTemplate": {
    "id": "bug-fix-template",
    "name": "Bug Fix",
    "usageCount": 24
  },
  "usageByType": {
    "builtin": 48,
    "custom": 18,
    "global": 32
  }
}
```

---

## 10. Frontend Changes

### 10.1 New Components

All components go in `/web/src/components/`:

| Component | Purpose | Props |
|-----------|---------|-------|
| `TemplateSelector` | Grid/card view of available templates | `onSelect`, `selectedTemplate`, `filter` |
| `TemplateVariableForm` | Dynamic form for entering template variables | `template`, `onSubmit`, `initialValues` |
| `TemplatePreview` | Show final task with variables filled in | `template`, `variables`, `onEdit` |
| `TemplateManagement` | Dashboard for managing custom templates | `userId`, `onEdit`, `onDelete` |
| `EditTemplateModal` | Modal dialog for editing templates | `template`, `onSave`, `onCancel` |
| `TemplateCard` | Single template card in list/grid | `template`, `onUse`, `onEdit` |
| `VariableInput` | Single variable input field | `variable`, `value`, `onChange`, `error` |

### 10.2 Updated Pages

#### `/web/src/pages/tasks/new.tsx`

Current: Direct form with all fields
Updated: Template selection → Variable form → Preview → Submit

```typescript
// Pseudo-code for the flow
function NewTaskPage() {
  const [step, setStep] = useState<'select-template' | 'fill-variables' | 'preview'>('select-template');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [variables, setVariables] = useState({});

  return (
    <div>
      {step === 'select-template' && (
        <TemplateSelector
          onSelect={(template) => {
            setSelectedTemplate(template);
            setStep('fill-variables');
          }}
        />
      )}

      {step === 'fill-variables' && (
        <TemplateVariableForm
          template={selectedTemplate}
          onSubmit={(vars) => {
            setVariables(vars);
            setStep('preview');
          }}
        />
      )}

      {step === 'preview' && (
        <TemplatePreview
          template={selectedTemplate}
          variables={variables}
          onEdit={() => setStep('fill-variables')}
          onSubmit={(taskData) => createTask(taskData)}
        />
      )}
    </div>
  );
}
```

#### `/web/src/pages/templates/index.tsx` (NEW)

Template management dashboard (list, edit, delete, create).

#### `/web/src/pages/templates/[id].tsx` (NEW)

Template detail/preview page.

---

### 10.3 Updated Task Form Logic

In `CreateTaskDto` and `TaskForm` component, add:
- `templateId` — Track which template was used (for analytics)
- `templateVariables` — Store the raw variable inputs for reference

---

## 11. Default Templates

### 11.1 Pre-Built Templates (Ship with System)

#### Template 1: Bug Fix

```yaml
Name: Bug Fix
Icon: 🐛
Description: Fix a known bug or defect in the codebase
Category: bug-fix
DefaultTaskType: bug-fix
DefaultRepo: mothership/finance-service

DescriptionTemplate: |
  Fix {{bug_description}} in {{component_name}}.

  **Current behavior:**
  {{actual_behavior}}

  **Expected behavior:**
  {{expected_behavior}}

FilesHintTemplate:
  - src/modules/{{component_name_slug}}/

AcceptanceCriteriaTemplate:
  - "[ ] {{component_name}} correctly handles the scenario"
  - "[ ] All existing tests still pass"
  - "[ ] New test(s) added to prevent regression"

Variables:
  component_name:
    label: Component Name
    description: Service, module, or file with the bug
    type: select
    required: true
    options:
      - PaymentService
      - InvoiceService
      - RefundService
      - WebhookService
    example: PaymentService

  bug_description:
    label: Bug Title
    description: Short description of the bug
    type: text
    required: true
    placeholder: e.g., "Stripe webhook not firing"
    example: Stripe webhook handler fails silently

  actual_behavior:
    label: Current Behavior
    description: What currently happens (the bug)
    type: multiline
    required: true
    placeholder: "Describe what you observe..."
    example: Payment stays in 'Processing' state indefinitely

  expected_behavior:
    label: Expected Behavior
    description: What should happen instead
    type: multiline
    required: true
    placeholder: "Describe the desired state..."
    example: Payment updates to 'Succeeded' within 1 second of webhook
```

---

#### Template 2: Feature

```yaml
Name: Feature
Icon: ✨
Description: Implement a new feature or enhancement
Category: feature
DefaultTaskType: feature
DefaultRepo: mothership/finance-service

DescriptionTemplate: |
  Add {{feature_name}} to {{component_name}}.

  **User story:**
  {{user_story}}

  **Acceptance criteria:**
  {{acceptance_criteria_list}}

FilesHintTemplate:
  - src/modules/{{component_name_slug}}/

Variables:
  feature_name:
    label: Feature Name
    type: text
    required: true
    example: Export invoices to CSV

  component_name:
    label: Component/Module
    type: text
    required: true
    example: InvoiceService

  user_story:
    label: User Story
    type: multiline
    required: true
    placeholder: "As a..., I want to..., so that..."

  acceptance_criteria:
    label: Acceptance Criteria
    type: array
    required: true
    placeholder: Add each criterion as a separate item
```

---

#### Template 3: Refactor

```yaml
Name: Refactor
Icon: 🔄
Description: Improve code quality, performance, or architecture
Category: refactor
DefaultTaskType: refactor

DescriptionTemplate: |
  Refactor {{component_name}} to {{refactor_goal}}.

  **Current state:**
  {{current_state}}

  **Desired state:**
  {{desired_state}}

  **Success criteria:**
  {{success_criteria_list}}

Variables:
  component_name:
    label: Component Name
    required: true

  refactor_goal:
    label: Refactoring Goal
    type: text
    required: true
    example: Use dependency injection

  current_state:
    label: Current State
    type: multiline
    required: true

  desired_state:
    label: Desired State
    type: multiline
    required: true

  success_criteria:
    label: Success Criteria
    type: array
    required: true
```

---

#### Template 4: Test Coverage

```yaml
Name: Test Coverage
Icon: 🧪
Description: Add or improve unit/integration/e2e tests
Category: test-coverage
DefaultTaskType: test-coverage

DescriptionTemplate: |
  Add {{test_type}} tests to {{component_name}}.

  **Coverage goal:** {{coverage_goal}}%

  **Scenarios to cover:**
  {{test_scenarios_list}}

Variables:
  test_type:
    label: Test Type
    type: select
    required: true
    options:
      - unit
      - integration
      - e2e
    example: unit

  component_name:
    label: Component Name
    required: true

  coverage_goal:
    label: Coverage Goal (%)
    type: text
    required: false
    defaultValue: "80"

  test_scenarios:
    label: Test Scenarios
    type: array
    required: true
```

---

#### Template 5: Documentation

```yaml
Name: Documentation
Icon: 📝
Description: Write or update documentation
Category: docs

DescriptionTemplate: |
  Document {{doc_type}}: {{topic}}

  **Audience:** {{audience}}

  **Key sections:**
  {{sections_list}}

Variables:
  doc_type:
    label: Doc Type
    type: select
    required: true
    options:
      - API Reference
      - Architecture Guide
      - Runbook
      - Tutorial
      - README

  topic:
    label: Topic/Title
    required: true

  audience:
    label: Target Audience
    example: Backend engineers, Integration partners

  sections:
    label: Key Sections
    type: array
    required: true
```

---

### 11.2 Initial Global Templates

After MVP, org admins can create these:
- "Stripe Integration Fix" (finance-service specific)
- "Database Migration" (devops-scoped)
- "API Integration" (backend teams)

---

## 12. Implementation Tasks

### Phase 1: Database & Backend (Week 1)

1. **Create Template Schema** (2h)
   - [ ] Add `TemplateSchema` to `src/common/schemas/template.schema.ts`
   - [ ] Define Mongoose indexes
   - [ ] Add type definitions

2. **Create Template Service** (3h)
   - [ ] `src/templates/templates.service.ts`
   - [ ] Implement CRUD: create, findAll, findOne, update, delete
   - [ ] Add filtering (by type, repo, owner)
   - [ ] Add variable replacement logic (Handlebars parsing)
   - [ ] Add usage tracking (increment usageCount on apply)

3. **Create Template Controller** (2h)
   - [ ] `src/templates/templates.controller.ts`
   - [ ] Implement all 9 API endpoints (GET, POST, PUT, DELETE, apply, favorite, etc.)
   - [ ] Add proper HTTP status codes and error handling
   - [ ] Add authorization checks (owner vs. global, etc.)

4. **Create DTOs** (1h)
   - [ ] `CreateTemplateDto`
   - [ ] `UpdateTemplateDto`
   - [ ] `ApplyTemplateDto`
   - [ ] `TemplateQueryDto` (for filtering)
   - [ ] `TemplateVariableDto`

5. **Seed Pre-Built Templates** (1h)
   - [ ] Create MongoDB migration/seed script
   - [ ] Insert 5 pre-built templates into `templates` collection
   - [ ] Make sure they're marked as `templateType: 'builtin'`

6. **Update Task Schema** (30m)
   - [ ] Add `templateId` field to Task schema
   - [ ] Update `CreateTaskDto` to accept `templateId`

7. **Variable Replacement Logic** (2h)
   - [ ] Create utility function: `replaceVariables(template, variables)`
   - [ ] Handle Handlebars syntax: `{{variable_name}}`
   - [ ] Support nested templates (files, criteria arrays)
   - [ ] Add validation (required variables, type checking)
   - [ ] Unit tests for variable replacement

**Complexity:** Medium

---

### Phase 2: Frontend - Template Selector (Week 2)

1. **Create TemplateSelector Component** (3h)
   - [ ] Grid/card view of available templates
   - [ ] Show icon, name, description, usage count
   - [ ] Filter by type (all, builtin, custom, global)
   - [ ] Search by name
   - [ ] Sort by usage/date
   - [ ] Responsive design (mobile-first)

2. **Create TemplateCard Component** (1h)
   - [ ] Single card layout
   - [ ] Click handler to select template
   - [ ] Show/hide preview button

3. **Update NewTaskPage** (2h)
   - [ ] Add step 1: Template selector (replaces inline template dropdown if exists)
   - [ ] Wire up state management (selectedTemplate, variables, step)
   - [ ] Add navigation between steps (back/next)

4. **Add Template Selector to Task Form** (1h)
   - [ ] If no template selected, show a message "No template selected — use default form"
   - [ ] Allow user to switch templates at any point

5. **Frontend Tests** (2h)
   - [ ] Test TemplateSelector component (rendering, filtering, search)
   - [ ] Test TemplateCard click handler
   - [ ] Test navigation between steps

**Complexity:** Medium

---

### Phase 3: Frontend - Variable Input Form (Week 2)

1. **Create VariableInput Component** (2h)
   - [ ] Generic component for a single variable
   - [ ] Support types: text, multiline, select, array, url
   - [ ] Show label, description, example, placeholder
   - [ ] Validation (required vs. optional)
   - [ ] Error messages

2. **Create TemplateVariableForm Component** (3h)
   - [ ] Render all variables from template
   - [ ] Dynamic form generation based on `template.variables`
   - [ ] Handle form submission and validation
   - [ ] Show errors for missing required fields
   - [ ] Render "Help Text" and examples
   - [ ] Responsive layout

3. **Integrate with NewTaskPage** (1h)
   - [ ] Add TemplateVariableForm component to step 2
   - [ ] Wire up onSubmit to store variables in state
   - [ ] Add back/next navigation

4. **Frontend Tests** (2h)
   - [ ] Test VariableInput rendering and validation
   - [ ] Test TemplateVariableForm submission
   - [ ] Test required field validation
   - [ ] Test array input (multi-value)

**Complexity:** Medium

---

### Phase 4: Frontend - Preview & Submit (Week 2)

1. **Create TemplatePreview Component** (2h)
   - [ ] Display final task description with variables filled in
   - [ ] Show repo, priority, files, acceptance criteria
   - [ ] Live preview as user edits variables (if time)
   - [ ] "Edit" button to go back to step 2
   - [ ] "Submit" button to create task

2. **Integrate Task Creation** (1h)
   - [ ] When submitting, call `/api/tasks` with:
     - `description` (post-replacement)
     - `repo` (from template or user override)
     - `templateId` (for analytics)
     - `priority` (from template or user override)
     - `filesHint` (post-replacement)
     - `acceptanceCriteria` (post-replacement)

3. **Add "Save as Template" Feature** (2h)
   - [ ] Button on preview page or task form: "Save as Template"
   - [ ] Modal dialog for template name & description
   - [ ] POST to `/api/templates` to create custom template
   - [ ] Success message + option to view new template

4. **Frontend Tests** (1h)
   - [ ] Test TemplatePreview rendering
   - [ ] Test variable replacement in preview
   - [ ] Test form submission
   - [ ] Test error handling

**Complexity:** Medium

---

### Phase 5: Frontend - Template Management (Week 3)

1. **Create TemplateManagement Page** (3h)
   - [ ] `/templates` route
   - [ ] Two sections: "My Templates" and "Organization Templates"
   - [ ] List view with name, description, usage count, date
   - [ ] Use/Edit/Delete actions for each
   - [ ] Confirmation dialog for delete

2. **Create EditTemplateModal** (3h)
   - [ ] Modal dialog for editing template details
   - [ ] Edit fields: name, description, defaultRepo, variables
   - [ ] Add/edit/delete variables dynamically
   - [ ] Form validation
   - [ ] POST to `/api/templates/:id` on save

3. **Create TemplateDetail Page** (optional) (1h)
   - [ ] Show full template preview (for viewing before using)
   - [ ] Useful for organization templates

4. **Add Navigation Link** (30m)
   - [ ] Dashboard navbar: "Templates" link
   - [ ] Link to `/templates` page

5. **Frontend Tests** (2h)
   - [ ] Test template list rendering
   - [ ] Test CRUD operations (create, edit, delete)
   - [ ] Test confirmation dialogs
   - [ ] Test navigation

**Complexity:** Medium-High

---

### Phase 6: Integration & Testing (Week 3)

1. **E2E Tests** (3h)
   - [ ] Create task with template (full flow)
   - [ ] Edit and delete template
   - [ ] Apply template and submit task
   - [ ] Verify task is created with correct fields

2. **Backend Unit Tests** (2h)
   - [ ] Test TemplatesService CRUD
   - [ ] Test variable replacement
   - [ ] Test filtering and search
   - [ ] Test ownership/authorization

3. **Integration Tests** (2h)
   - [ ] Test TemplateController endpoints
   - [ ] Test authorization (owner vs. admin)
   - [ ] Test error cases

4. **Manual Testing** (2h)
   - [ ] Create custom template, use it, edit it, delete it
   - [ ] Verify pre-built templates work
   - [ ] Test mobile responsiveness
   - [ ] Test all variable types (text, select, array, etc.)

**Complexity:** Medium

---

### Phase 7: Analytics & Polish (Week 4 - Optional)

1. **Usage Tracking** (1h)
   - [ ] Increment `usageCount` when template is applied
   - [ ] Track analytics in dashboard

2. **Favorites** (1h)
   - [ ] Add star icon to template cards
   - [ ] POST/DELETE `/api/templates/:id/favorite`
   - [ ] Filter templates by "favorites" in UI

3. **Search & Filtering** (1h)
   - [ ] Full-text search on template name/description
   - [ ] Filter by repo, type, category
   - [ ] Sort by popularity, date, name

4. **Admin Dashboard for Templates** (optional) (2h)
   - [ ] Admins see all templates (builtin, custom, global)
   - [ ] Can edit/delete any template
   - [ ] Can create global templates
   - [ ] Analytics: most used templates, new users' templates, etc.

**Complexity:** Low-Medium

---

## 13. Estimated Complexity & Timeline

### Complexity Breakdown

| Component | Complexity | Effort | Est. Days |
|-----------|-----------|--------|-----------|
| **Backend** | | | |
| Template Schema + Service | Medium | 3h | 0.4 |
| Template Controller + DTOs | Medium | 3h | 0.4 |
| Variable Replacement Logic | Medium | 2h | 0.3 |
| Seed Pre-Built Templates | Low | 1h | 0.1 |
| Unit/Integration Tests | Medium | 4h | 0.5 |
| **Frontend** | | | |
| TemplateSelector Component | Medium | 3h | 0.4 |
| TemplateVariableForm Component | Medium-High | 3h | 0.4 |
| TemplatePreview Component | Medium | 2h | 0.3 |
| TemplateManagement Page | Medium-High | 3h | 0.4 |
| EditTemplateModal | Medium | 3h | 0.4 |
| Save as Template Feature | Medium | 2h | 0.3 |
| Frontend Tests (unit + E2E) | Medium | 5h | 0.6 |
| Integration & Manual Testing | Medium | 4h | 0.5 |
| **Optional Enhancements** | | | |
| Favorites & Analytics | Low | 2h | 0.3 |
| Admin Template Dashboard | Medium | 2h | 0.3 |
| Full-Text Search | Low | 1h | 0.1 |
| **TOTAL** | **Medium-High** | **45h** | **5-6 days** |

### Timeline

- **Week 1:** Backend (Phase 1) — 2 days
- **Week 2:** Frontend Core (Phases 2-4) — 2.5 days
- **Week 3:** Frontend Mgmt + Integration (Phases 5-6) — 1.5 days
- **Week 4+:** Polish & Analytics (Phase 7) — 0.5 days

**Total: 5-6 developer-days (assuming 1 FTE)**

---

## 14. Dependencies & Constraints

### 14.1 Dependencies

1. **Backend:**
   - NestJS 11 (already in use)
   - Mongoose 8 (already configured)
   - MongoDB 7 (already deployed)

2. **Frontend:**
   - React + Vite + Tailwind CSS (already in use)
   - React Query or similar for API calls (likely already in use)
   - Form validation library (already using class-validator on backend)

3. **External:**
   - None (templates are fully internal)

### 14.2 Constraints

1. **Scope:** MVP focuses on pre-built + custom templates. Global templates (admin-managed) deferred to v2.
2. **Variable Support:** Handlebars syntax only (no complex expressions or loops).
3. **Template Sharing:** Only private (user) and global (org) scopes. Team templates deferred.
4. **Performance:** Template list should load in < 500ms. Variable replacement should be instant.

---

## 15. Security & Validation

### 15.1 Security Rules

1. **Ownership:** Only the template owner can edit/delete custom templates
2. **Authorization:** Non-admins cannot edit pre-built or global templates
3. **Data Validation:** All user input validated against schema (template names, descriptions, variables)
4. **Variable Injection:** Variables are replaced in template strings, never executed as code
5. **Audit Logging:** Track template creation, modification, usage (for compliance)

### 15.2 Input Validation

- Template name: 1-100 chars, alphanumeric + spaces/hyphens
- Template description: 1-500 chars
- Variable names: Must be valid identifiers (alphanumeric + underscore)
- Variable values: Escaped to prevent XSS or injection
- File paths: Must start with `src/` or similar (no `../` traversal)

---

## 16. Monitoring & Metrics

### 16.1 Key Metrics

1. **Template Usage:** How many tasks are created from templates vs. without
2. **Template Popularity:** Most-used templates (usageCount)
3. **Time Saved:** Estimate time saved per template usage (~1 min per task)
4. **Custom Template Creation:** How many users create custom templates
5. **Template Error Rate:** Variable replacement failures, validation errors

### 16.2 Logging

- Log every template creation, edit, delete, and apply event
- Include user, timestamp, template ID, variables used
- Track errors during variable replacement

---

## 17. Future Enhancements (v2+)

1. **Template Marketplace:** Public templates that can be shared across orgs
2. **Advanced Variables:** Conditional variables, date/time picks, computed values
3. **Team Templates:** Team-scoped templates (for each team in the org)
4. **Template Versioning:** Track changes, rollback to old versions
5. **Template AI Enhancement:** LLM suggests templates based on task description
6. **Template Cloning:** Create a template from an existing template (template inheritance)
7. **Bulk Template Operations:** Export/import templates to/from YAML
8. **Template Suggestions:** "You might want to use 'Bug Fix' template for this task"
9. **Advanced Analytics:** Usage trends, template effectiveness, team metrics
10. **Template Permissions:** Fine-grained access control (per-team, per-repo)

---

## 18. Questions for Product/Design

1. Should custom templates be shareable with the team (before global templates)?
2. Do we need template categories/tags for better organization?
3. Should users be able to rate templates (5-star system)?
4. Should we have a "Quick Create" button that bypasses template selection?
5. Should template variables support conditionals (e.g., "if test_type is unit, show additional fields")?
6. Should we auto-suggest templates based on task description using LLM?
7. Do we need audit logging for template changes (for compliance)?
8. Should templates have expiration dates or versioning?

---

## 19. Rollout Plan

### 19.1 Beta Phase (Internal Only)

1. Deploy to staging environment
2. Invite 3-5 power users to test
3. Gather feedback on UX and usability
4. Iterate on variable naming, examples, default values

### 19.2 General Availability

1. Deploy to production with feature flag (`TEMPLATES_ENABLED`)
2. Create onboarding docs and tutorial
3. Send announcement to team
4. Monitor metrics (adoption, errors, feedback)
5. Refine based on usage patterns

### 19.3 Success Criteria

- [ ] 50%+ of new tasks created use a template (within 2 weeks)
- [ ] 20%+ of users create custom templates (within 4 weeks)
- [ ] Average task creation time drops to < 1 minute (from 2-3 minutes)
- [ ] Zero template-related errors in production (after week 1)
- [ ] Positive user feedback (NPS > 7/10)

---

## Appendix A: Example Custom Template

**Name:** Stripe Webhook Debugging

**Created by:** alice
**Usage Count:** 5
**Description:** Standard workflow for debugging Stripe webhook issues in payment module

**Description Template:**
```
Debug Stripe webhook issue: {{webhook_event_type}} not firing correctly in {{component_name}}.

**Setup:**
- Stripe event: {{webhook_event_type}}
- Component: {{component_name}}

**Current behavior:**
{{current_behavior}}

**Expected behavior:**
{{expected_behavior}}

**Investigation required:**
- [ ] Verify webhook endpoint is registered in Stripe Dashboard
- [ ] Check logs for webhook delivery attempts
- [ ] Verify request signature validation is correct
- [ ] Test with Stripe CLI: `stripe listen --forward-to localhost:3000/webhooks/stripe`

**Acceptance Criteria:**
- [ ] Webhook handler correctly processes {{webhook_event_type}} event
- [ ] Payment state updates correctly
- [ ] All existing tests pass
- [ ] New test added for {{webhook_event_type}} scenario
```

**Variables:**
```
webhook_event_type:
  label: Webhook Event Type
  type: select
  required: true
  options: ["charge.succeeded", "charge.failed", "payment_intent.succeeded", "payment_intent.canceled"]
  example: "charge.succeeded"

component_name:
  label: Component Name
  type: select
  required: true
  options: ["PaymentService", "StripeWebhookHandler", "InvoiceService"]
  example: "PaymentService"

current_behavior:
  label: Current Behavior
  type: multiline
  required: true
  placeholder: "Describe what currently happens..."

expected_behavior:
  label: Expected Behavior
  type: multiline
  required: true
  placeholder: "Describe what should happen..."
```

---

## Appendix B: Variable Types - Implementation Details

### Text Type
```json
{
  "type": "text",
  "label": "Component Name",
  "required": true,
  "placeholder": "e.g., PaymentService",
  "maxLength": 100,
  "minLength": 1
}
```

**Frontend:** `<input type="text" />`
**Validation:** Required if `required: true`, max length 100

---

### Multiline Type
```json
{
  "type": "multiline",
  "label": "Description",
  "required": true,
  "rows": 5,
  "maxLength": 1000
}
```

**Frontend:** `<textarea rows="5" />`
**Validation:** Required, max 1000 chars

---

### Select Type
```json
{
  "type": "select",
  "label": "Test Type",
  "required": true,
  "options": ["unit", "integration", "e2e"],
  "defaultValue": "unit"
}
```

**Frontend:** `<select><option>...</option></select>`
**Validation:** Must be one of options

---

### Array Type
```json
{
  "type": "array",
  "label": "Test Scenarios",
  "required": true,
  "itemLabel": "Scenario",
  "minItems": 1,
  "maxItems": 10,
  "itemMaxLength": 200
}
```

**Frontend:** Multiple text inputs with "Add" / "Remove" buttons
**Validation:** At least 1 item, max 10 items, each ≤ 200 chars

---

### URL Type
```json
{
  "type": "url",
  "label": "Repository URL",
  "required": false,
  "defaultValue": "https://github.com/mothership/finance-service"
}
```

**Frontend:** `<input type="url" />`
**Validation:** Must be valid URL (https://)

---

End of Specification Document
