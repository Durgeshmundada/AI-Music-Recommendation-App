import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../utils/apiClient.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'ai-music-auth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setLoading(false);
        return;
      }

      try {
        const parsed = JSON.parse(stored);
        setUser(parsed.user);
        setToken(parsed.token);

        if (parsed.token) {
          const profileRes = await apiClient.get('/auth/me');
          setUser(profileRes.data.user);
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ user: profileRes.data.user, token: parsed.token })
          );
        }
      } catch {
        setUser(null);
        setToken(null);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!token || !user) return;
    const payload = { user, token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [user, token]);

  const login = async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    setUser(res.data.user);
    setToken(res.data.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.data.user, token: res.data.token }));
    return res.data;
  };

  const register = async (payload) => {
    const res = await apiClient.post('/auth/register', payload);
    setUser(res.data.user);
    setToken(res.data.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.data.user, token: res.data.token }));
    return res.data;
  };

  const logout = () => {
    apiClient.post('/auth/logout').catch(() => {});
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const requestPasswordReset = async (email) => {
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res.data;
  };

  const resetPassword = async (tokenValue, newPassword) => {
    const res = await apiClient.post('/auth/reset-password', {
      token: tokenValue,
      newPassword,
    });
    return res.data;
  };

  const requestEmailVerification = async () => {
    const res = await apiClient.post('/auth/verify-email/request');
    return res.data;
  };

  const verifyEmailToken = async (tokenValue) => {
    const res = await apiClient.post('/auth/verify-email', { token: tokenValue });
    if (res.data?.user) {
      setUser(res.data.user);
      if (token) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.data.user, token }));
      }
    }
    return res.data;
  };

  const refreshProfile = async () => {
    const res = await apiClient.get('/auth/me');
    setUser(res.data.user);
    if (token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.data.user, token }));
    }
    return res.data.user;
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    requestPasswordReset,
    resetPassword,
    requestEmailVerification,
    verifyEmailToken,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
