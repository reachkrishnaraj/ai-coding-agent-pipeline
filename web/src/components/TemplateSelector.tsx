import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Template {
  id: string;
  name: string;
  description: string;
  templateType: string;
  icon?: string;
  category?: string;
  usageCount: number;
  variables: Record<string, any>;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  selectedTemplateId?: string;
}

export function TemplateSelector({
  onSelect,
  selectedTemplateId,
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, [filter, search]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filter !== 'all') {
        params.type = filter;
      }
      if (search) {
        params.search = search;
      }
      const response = await api.templates.list(params);
      setTemplates(response.templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Choose a Template</h2>
        <p className="text-gray-600">
          Start with a pre-built template or create a custom task
        </p>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('builtin')}
            className={`px-4 py-2 rounded ${
              filter === 'builtin'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Built-in
          </button>
          <button
            onClick={() => setFilter('custom')}
            className={`px-4 py-2 rounded ${
              filter === 'custom'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            My Templates
          </button>
          <button
            onClick={() => setFilter('global')}
            className={`px-4 py-2 rounded ${
              filter === 'global'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Global
          </button>
        </div>

        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border rounded"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading templates...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              onClick={() => onSelect(template)}
              className={`p-6 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
                selectedTemplateId === template.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <div className="flex items-start gap-3">
                {template.icon && (
                  <span className="text-3xl">{template.icon}</span>
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1">{template.name}</h3>
                  <p className="text-gray-600 text-sm mb-3">
                    {template.description}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-200 rounded">
                      {template.templateType}
                    </span>
                    <span>Used {template.usageCount} times</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Custom / No Template Option */}
          <div
            onClick={() =>
              onSelect({
                id: 'custom',
                name: 'Custom Task',
                description: 'Start from scratch with no template',
                templateType: 'custom',
                icon: '➕',
                category: 'custom',
                usageCount: 0,
                variables: {},
              })
            }
            className={`p-6 border rounded-lg cursor-pointer transition-all hover:shadow-lg ${
              selectedTemplateId === 'custom'
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">➕</span>
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-1">Custom Task</h3>
                <p className="text-gray-600 text-sm">
                  Start from scratch with no template
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
