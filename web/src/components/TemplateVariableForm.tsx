import { useState } from 'react';

interface VariableDefinition {
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

interface Template {
  id: string;
  name: string;
  description: string;
  variables: Record<string, VariableDefinition>;
}

interface TemplateVariableFormProps {
  template: Template;
  onSubmit: (variables: Record<string, any>) => void;
  onBack: () => void;
  initialValues?: Record<string, any>;
}

export function TemplateVariableForm({
  template,
  onSubmit,
  onBack,
  initialValues = {},
}: TemplateVariableFormProps) {
  const [variables, setVariables] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (key: string, value: any) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const [key, varDef] of Object.entries(template.variables)) {
      if (varDef.required && !variables[key]) {
        newErrors[key] = `${varDef.label} is required`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(variables);
    }
  };

  const renderInput = (key: string, varDef: VariableDefinition) => {
    const value = variables[key] || varDef.defaultValue || '';
    const error = errors[key];

    switch (varDef.type) {
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            className={`w-full px-4 py-2 border rounded ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select {varDef.label}</option>
            {varDef.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'multiline':
        return (
          <textarea
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={varDef.placeholder || varDef.example}
            rows={5}
            className={`w-full px-4 py-2 border rounded ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );

      case 'array':
        return (
          <textarea
            value={Array.isArray(value) ? value.join('\n') : value}
            onChange={(e) =>
              handleChange(
                key,
                e.target.value.split('\n').filter((line) => line.trim()),
              )
            }
            placeholder={varDef.placeholder || 'One item per line'}
            rows={4}
            className={`w-full px-4 py-2 border rounded ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );

      case 'url':
        return (
          <input
            type="url"
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={varDef.placeholder || varDef.example}
            className={`w-full px-4 py-2 border rounded ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={varDef.placeholder || varDef.example}
            className={`w-full px-4 py-2 border rounded ${
              error ? 'border-red-500' : 'border-gray-300'
            }`}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Fill in Template Details</h2>
        <p className="text-gray-600">{template.description}</p>
      </div>

      <div className="space-y-4">
        {Object.entries(template.variables).map(([key, varDef]) => (
          <div key={key}>
            <label className="block mb-2">
              <span className="font-medium">
                {varDef.label}
                {varDef.required && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </span>
              {varDef.description && (
                <span className="block text-sm text-gray-500 mt-1">
                  {varDef.description}
                </span>
              )}
            </label>

            {renderInput(key, varDef)}

            {errors[key] && (
              <p className="text-red-500 text-sm mt-1">{errors[key]}</p>
            )}

            {varDef.example && !errors[key] && (
              <p className="text-gray-500 text-sm mt-1">
                Example: {varDef.example}
              </p>
            )}

            {varDef.helpText && (
              <p className="text-blue-600 text-sm mt-1">{varDef.helpText}</p>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-4 pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-100"
        >
          Back
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Preview & Submit
        </button>
      </div>
    </form>
  );
}
