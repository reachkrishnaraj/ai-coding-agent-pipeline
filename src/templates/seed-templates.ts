import * as mongoose from 'mongoose';
import { TaskTemplate, TemplateSchema } from '../common/schemas/template.schema';

const defaultTemplates = [
  {
    name: 'Bug Fix',
    description: 'Fix a known bug or defect in the codebase',
    templateType: 'builtin',
    isReadOnly: true,
    icon: '🐛',
    category: 'bug-fix',
    defaultTaskType: 'bug-fix',
    defaultRepo: 'mothership/finance-service',
    defaultPriority: 'normal',
    visibility: 'organization',
    descriptionTemplate: `Fix {{bug_description}} in {{component_name}}.

**Current behavior:**
{{actual_behavior}}

**Expected behavior:**
{{expected_behavior}}`,
    filesHintTemplate: ['src/modules/{{component_name}}/'],
    acceptanceCriteriaTemplate: [
      '[ ] {{component_name}} correctly handles the scenario',
      '[ ] All existing tests still pass',
      '[ ] New test(s) added to prevent regression',
    ],
    variables: {
      component_name: {
        label: 'Component Name',
        description: 'Service, module, or file with the bug',
        type: 'select',
        required: true,
        options: ['PaymentService', 'InvoiceService', 'RefundService', 'WebhookService'],
        example: 'PaymentService',
        placeholder: '',
        helpText: '',
      },
      bug_description: {
        label: 'Bug Title',
        description: 'Short description of the bug',
        type: 'text',
        required: true,
        example: 'Stripe webhook handler fails silently',
        placeholder: 'e.g., "Stripe webhook not firing"',
        helpText: '',
      },
      actual_behavior: {
        label: 'Current Behavior',
        description: 'What currently happens (the bug)',
        type: 'multiline',
        required: true,
        example: 'Payment stays in Processing state indefinitely',
        placeholder: 'Describe what you observe...',
        helpText: '',
      },
      expected_behavior: {
        label: 'Expected Behavior',
        description: 'What should happen instead',
        type: 'multiline',
        required: true,
        example: 'Payment updates to Succeeded within 1 second of webhook',
        placeholder: 'Describe the desired state...',
        helpText: '',
      },
    },
    createdBy: 'system',
    usageCount: 0,
    favoriteCount: 0,
  },
  {
    name: 'Feature',
    description: 'Implement a new feature or enhancement',
    templateType: 'builtin',
    isReadOnly: true,
    icon: '✨',
    category: 'feature',
    defaultTaskType: 'feature',
    defaultRepo: 'mothership/finance-service',
    defaultPriority: 'normal',
    visibility: 'organization',
    descriptionTemplate: `Add {{feature_name}} to {{component_name}}.

**User story:**
{{user_story}}

**Acceptance criteria:**
{{acceptance_criteria}}`,
    filesHintTemplate: ['src/modules/{{component_name}}/'],
    variables: {
      feature_name: {
        label: 'Feature Name',
        description: 'Name of the new feature',
        type: 'text',
        required: true,
        example: 'Export invoices to CSV',
        placeholder: '',
        helpText: '',
      },
      component_name: {
        label: 'Component/Module',
        description: 'Which component or module to add this to',
        type: 'text',
        required: true,
        example: 'InvoiceService',
        placeholder: '',
        helpText: '',
      },
      user_story: {
        label: 'User Story',
        description: 'User story describing the feature',
        type: 'multiline',
        required: true,
        example: 'As a finance admin, I want to export invoices to CSV, so that I can analyze them in Excel',
        placeholder: 'As a..., I want to..., so that...',
        helpText: '',
      },
      acceptance_criteria: {
        label: 'Acceptance Criteria',
        description: 'List of criteria for completion',
        type: 'multiline',
        required: true,
        example: '- Export button appears on invoices page\n- CSV includes all invoice fields\n- Download completes within 5 seconds',
        placeholder: 'Add each criterion as a separate line',
        helpText: '',
      },
    },
    createdBy: 'system',
    usageCount: 0,
    favoriteCount: 0,
  },
  {
    name: 'Refactor',
    description: 'Improve code quality, performance, or architecture',
    templateType: 'builtin',
    isReadOnly: true,
    icon: '🔄',
    category: 'refactor',
    defaultTaskType: 'refactor',
    defaultPriority: 'normal',
    visibility: 'organization',
    descriptionTemplate: `Refactor {{component_name}} to {{refactor_goal}}.

**Current state:**
{{current_state}}

**Desired state:**
{{desired_state}}

**Success criteria:**
{{success_criteria}}`,
    variables: {
      component_name: {
        label: 'Component Name',
        description: 'Component or module to refactor',
        type: 'text',
        required: true,
        example: 'PaymentService',
        placeholder: '',
        helpText: '',
      },
      refactor_goal: {
        label: 'Refactoring Goal',
        description: 'What you want to achieve',
        type: 'text',
        required: true,
        example: 'Use dependency injection',
        placeholder: '',
        helpText: '',
      },
      current_state: {
        label: 'Current State',
        description: 'How the code works now',
        type: 'multiline',
        required: true,
        example: 'Service directly imports and instantiates dependencies',
        placeholder: '',
        helpText: '',
      },
      desired_state: {
        label: 'Desired State',
        description: 'How the code should work after refactoring',
        type: 'multiline',
        required: true,
        example: 'Dependencies are injected via constructor',
        placeholder: '',
        helpText: '',
      },
      success_criteria: {
        label: 'Success Criteria',
        description: 'How to verify the refactoring is complete',
        type: 'multiline',
        required: true,
        example: '- All tests still pass\n- Code coverage maintained\n- No runtime behavior changes',
        placeholder: '',
        helpText: '',
      },
    },
    createdBy: 'system',
    usageCount: 0,
    favoriteCount: 0,
  },
  {
    name: 'Test Coverage',
    description: 'Add or improve unit/integration/e2e tests',
    templateType: 'builtin',
    isReadOnly: true,
    icon: '🧪',
    category: 'test-coverage',
    defaultTaskType: 'test-coverage',
    defaultPriority: 'normal',
    visibility: 'organization',
    descriptionTemplate: `Add {{test_type}} tests to {{component_name}}.

**Coverage goal:** {{coverage_goal}}%

**Scenarios to cover:**
{{test_scenarios}}`,
    variables: {
      test_type: {
        label: 'Test Type',
        description: 'Type of tests to add',
        type: 'select',
        required: true,
        options: ['unit', 'integration', 'e2e'],
        example: 'unit',
        placeholder: '',
        helpText: '',
      },
      component_name: {
        label: 'Component Name',
        description: 'Component or module to test',
        type: 'text',
        required: true,
        example: 'PaymentService',
        placeholder: '',
        helpText: '',
      },
      coverage_goal: {
        label: 'Coverage Goal (%)',
        description: 'Target code coverage percentage',
        type: 'text',
        required: false,
        defaultValue: '80',
        example: '80',
        placeholder: '',
        helpText: '',
      },
      test_scenarios: {
        label: 'Test Scenarios',
        description: 'Scenarios to cover with tests',
        type: 'multiline',
        required: true,
        example: '- Happy path: payment succeeds\n- Error path: payment fails\n- Edge case: payment timeout',
        placeholder: 'List the scenarios to test',
        helpText: '',
      },
    },
    createdBy: 'system',
    usageCount: 0,
    favoriteCount: 0,
  },
  {
    name: 'Documentation',
    description: 'Write or update documentation',
    templateType: 'builtin',
    isReadOnly: true,
    icon: '📝',
    category: 'docs',
    defaultPriority: 'normal',
    visibility: 'organization',
    descriptionTemplate: `Document {{doc_type}}: {{topic}}

**Audience:** {{audience}}

**Key sections:**
{{sections}}`,
    variables: {
      doc_type: {
        label: 'Doc Type',
        description: 'Type of documentation',
        type: 'select',
        required: true,
        options: ['API Reference', 'Architecture Guide', 'Runbook', 'Tutorial', 'README'],
        example: 'API Reference',
        placeholder: '',
        helpText: '',
      },
      topic: {
        label: 'Topic/Title',
        description: 'Topic or title of the documentation',
        type: 'text',
        required: true,
        example: 'Payment API Endpoints',
        placeholder: '',
        helpText: '',
      },
      audience: {
        label: 'Target Audience',
        description: 'Who will read this documentation',
        type: 'text',
        required: false,
        example: 'Backend engineers, Integration partners',
        placeholder: '',
        helpText: '',
      },
      sections: {
        label: 'Key Sections',
        description: 'Main sections to include',
        type: 'multiline',
        required: true,
        example: '- Overview\n- Endpoints\n- Request/Response examples\n- Error handling',
        placeholder: 'List the main sections',
        helpText: '',
      },
    },
    createdBy: 'system',
    usageCount: 0,
    favoriteCount: 0,
  },
];

export async function seedTemplates(mongoUri: string) {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const TemplateModel = mongoose.model('TaskTemplate', TemplateSchema);

    // Delete existing builtin templates
    await TemplateModel.deleteMany({ templateType: 'builtin' });
    console.log('Deleted existing builtin templates');

    // Insert default templates
    await TemplateModel.insertMany(defaultTemplates);
    console.log(`Inserted ${defaultTemplates.length} default templates`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding templates:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-pipeline';
  seedTemplates(mongoUri)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
