import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    if (token) {
      // Verify token is still valid
      axios
        .get('/api/system/health', {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => {
          // Token is valid, fetch user info from token
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUser({
            id: payload.id,
            username: payload.username,
            role: payload.role,
          });
        })
        .catch(() => {
          // Token is invalid, clear it
          logout();
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password,
      });

      const { token: newToken, refreshToken: newRefreshToken, user: userData } = response.data;

      setToken(newToken);
      setRefreshToken(newRefreshToken);
      setUser(userData);

      localStorage.setItem('token', newToken);
      localStorage.setItem('refreshToken', newRefreshToken);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || 'Login failed',
      };
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await axios.post('/api/auth/logout', null, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      // Ignore errors during logout
    } finally {
      setToken(null);
      setRefreshToken(null);
      setUser(null);
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    }
  };

  const refreshAccessToken = async () => {
    try {
      const response = await axios.post('/api/auth/refresh', {
        refreshToken,
      });

      const { token: newToken } = response.data;
      setToken(newToken);
      localStorage.setItem('token', newToken);

      return newToken;
    } catch (error) {
      logout();
      throw error;
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    refreshAccessToken,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isOperator: user?.role === 'operator' || user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
