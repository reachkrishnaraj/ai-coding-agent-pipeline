import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function Pending() {
  const navigate = useNavigate();

  useEffect(() => {
    // Check auth status periodically
    const checkAuth = async () => {
      try {
        const response = await api.auth.getMe();
        if (response.authenticated && response.user?.status === 'active') {
          navigate('/');
        }
      } catch {
        navigate('/login');
      }
    };

    checkAuth();
    const interval = setInterval(checkAuth, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-8 w-8 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Awaiting Approval
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Your account is pending approval by an administrator.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            This page will automatically redirect once your account is approved.
          </p>
        </div>

        <div className="mt-8">
          <button
            onClick={handleLogout}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
