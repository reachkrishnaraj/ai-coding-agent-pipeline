import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface Template {
  id: string;
  name: string;
  description: string;
  templateType: string;
  icon?: string;
  category?: string;
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const [customResponse, globalResponse] = await Promise.all([
        api.templates.list({ type: 'custom' }),
        api.templates.list({ type: 'global' }),
      ]);
      setTemplates(customResponse.templates);
      setGlobalTemplates(globalResponse.templates);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      await api.templates.delete(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('Failed to delete template');
    }
  };

  const handleUse = (templateId: string) => {
    navigate(`/tasks/new?templateId=${templateId}`);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Templates</h1>
          <p className="text-gray-600 mt-2">
            Manage your task templates and view organization templates
          </p>
        </div>
        <button
          onClick={() => navigate('/tasks/new')}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create New Task
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading templates...</div>
      ) : (
        <>
          {/* My Templates */}
          <div>
            <h2 className="text-2xl font-bold mb-4">My Templates</h2>
            {templates.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                <p>You haven't created any custom templates yet.</p>
                <p className="mt-2">
                  Create a task and save it as a template for future use.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {template.icon && (
                            <span className="text-2xl">{template.icon}</span>
                          )}
                          <h3 className="text-xl font-bold">{template.name}</h3>
                        </div>
                        <p className="text-gray-600 mb-3">
                          {template.description}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Used {template.usageCount} times</span>
                          <span>Updated {formatDate(template.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUse(template.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="px-4 py-2 border border-red-600 text-red-600 rounded hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Organization Templates (Global) */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Organization Templates</h2>
            {globalTemplates.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                <p>No organization templates available.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {globalTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="border rounded-lg p-6 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {template.icon && (
                            <span className="text-2xl">{template.icon}</span>
                          )}
                          <h3 className="text-xl font-bold">{template.name}</h3>
                        </div>
                        <p className="text-gray-600 mb-3">
                          {template.description}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>Used {template.usageCount} times</span>
                          <span>Created by {template.createdBy}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUse(template.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => alert('Preview feature coming soon!')}
                          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
