import { Link } from 'react-router-dom';
import type { User } from '../types';
import { api } from '../lib/api';

interface NavbarProps {
  user?: User;
}

export function Navbar({ user }: NavbarProps) {
  const handleLogout = async () => {
    try {
      await api.auth.logout();
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center">
              <span className="text-xl font-bold text-gray-900">
                AI Pipeline
              </span>
            </Link>
            <Link
              to="/stats"
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Stats
            </Link>
            <Link
              to="/settings/notifications"
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Notifications
            </Link>
            {user?.role === 'admin' && (
              <Link
                to="/admin/users"
                className="text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Users
              </Link>
            )}
          </div>

          {user && (
            <div className="flex items-center space-x-4">
              <Link
                to="/tasks/new"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                New Task
              </Link>
              <div className="flex items-center space-x-3">
                <img
                  src={user.avatarUrl || 'https://github.com/github.png'}
                  alt={user.username}
                  className="h-8 w-8 rounded-full"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-700">
                    {user.username}
                  </span>
                  <span
                    className={`text-xs ${
                      user.role === 'admin'
                        ? 'text-purple-600'
                        : 'text-blue-600'
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
