import { useEffect, useState, createContext, useContext } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { api } from './lib/api';
import type { User } from './types';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Pending } from './pages/Pending';
import { Dashboard } from './pages/Dashboard';
import { NewTask } from './pages/NewTask';
import { TaskDetail } from './pages/TaskDetail';
import { AdminUsers } from './pages/AdminUsers';
import { Templates } from './pages/Templates';
import { WebSocketProvider } from './context/WebSocketContext';
import { ConnectionStatus } from './components/ConnectionStatus';

// User context for global user state
interface UserContextType {
  user: User | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  refetch: async () => {},
});

export const useUser = () => useContext(UserContext);

function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect pending users
  if (user.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  // Check admin requirement
  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <div className="fixed top-4 right-4 z-50 bg-white px-3 py-2 rounded-md shadow-sm border border-gray-200">
        <ConnectionStatus />
      </div>
      {children}
    </div>
  );
}

function AppRoutes() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.auth.getMe();
      if (response.authenticated && response.user) {
        setUser(response.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refetch: fetchUser }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<Pending />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks/new"
          element={
            <ProtectedRoute>
              <NewTask />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedRoute>
              <TaskDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <Templates />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requireAdmin>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
      </Routes>
    </UserContext.Provider>
  );
}

function App() {
  return (
    <Router>
      <WebSocketProvider>
        <AppRoutes />
      </WebSocketProvider>
    </Router>
  );
}

export default App;
