import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { User } from '../types';

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

const ROLE_BADGES: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'bg-purple-100', text: 'text-purple-800' },
  developer: { bg: 'bg-blue-100', text: 'text-blue-800' },
};

export function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      const params: { status?: string; role?: string } = {};
      if (statusFilter) params.status = statusFilter;
      if (roleFilter) params.role = roleFilter;

      const response = await api.users.list(params);
      setUsers(response.users);
    } catch (error) {
      console.error('Failed to load users:', error);
      if (error instanceof Error && error.message === 'Forbidden') {
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [statusFilter, roleFilter]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      await api.users.approve(userId);
      await loadUsers();
    } catch (error) {
      console.error('Failed to approve user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return;
    setActionLoading(userId);
    try {
      await api.users.deactivate(userId);
      await loadUsers();
    } catch (error) {
      console.error('Failed to deactivate user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    if (!confirm('Are you sure you want to make this user an admin?')) return;
    setActionLoading(userId);
    try {
      await api.users.makeAdmin(userId);
      await loadUsers();
    } catch (error) {
      console.error('Failed to make admin:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMakeDeveloper = async (userId: string) => {
    setActionLoading(userId);
    try {
      await api.users.makeDeveloper(userId);
      await loadUsers();
    } catch (error) {
      console.error('Failed to make developer:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = users.filter((u) => u.status === 'pending').length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-500">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-indigo-600 hover:text-indigo-900"
        >
          &larr; Back to Dashboard
        </button>
      </div>

      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage user access and roles
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
            {pendingCount} pending approval
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role
          </label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="block w-40 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">All</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const statusStyle = STATUS_BADGES[user.status] || STATUS_BADGES.pending;
                const roleStyle = ROLE_BADGES[user.role] || ROLE_BADGES.developer;
                const isLoading = actionLoading === user.id;

                return (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <img
                          className="h-10 w-10 rounded-full"
                          src={user.avatarUrl || 'https://github.com/github.png'}
                          alt=""
                        />
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName || user.username}
                          </div>
                          <div className="text-sm text-gray-500">
                            @{user.username}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        {user.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(user.id)}
                            disabled={isLoading}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        {user.status === 'active' && (
                          <button
                            onClick={() => handleDeactivate(user.id)}
                            disabled={isLoading}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            Deactivate
                          </button>
                        )}
                        {user.status === 'inactive' && (
                          <button
                            onClick={() => handleApprove(user.id)}
                            disabled={isLoading}
                            className="text-green-600 hover:text-green-900 disabled:opacity-50"
                          >
                            Reactivate
                          </button>
                        )}
                        {user.role === 'developer' && user.status === 'active' && (
                          <button
                            onClick={() => handleMakeAdmin(user.id)}
                            disabled={isLoading}
                            className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                          >
                            Make Admin
                          </button>
                        )}
                        {user.role === 'admin' && user.status === 'active' && (
                          <button
                            onClick={() => handleMakeDeveloper(user.id)}
                            disabled={isLoading}
                            className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                          >
                            Make Developer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
