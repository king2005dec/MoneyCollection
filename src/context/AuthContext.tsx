import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile } from '../types';
import { getProfiles } from '../services/databaseService';

interface AuthContextType {
  currentUser: Profile | null;
  setCurrentUser: (user: Profile | null) => void;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  availableProfiles: Profile[];
  refreshProfiles: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'col_jwt_token_v1';
const EXPIRY_KEY = 'col_token_expiry_v1';
const CURRENT_USER_ID_KEY = 'col_current_user_id_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshProfiles = async () => {
    try {
      const profiles = await getProfiles();
      setAvailableProfiles(profiles);

      const token = localStorage.getItem(TOKEN_KEY);
      const expiry = localStorage.getItem(EXPIRY_KEY);
      const savedUserId = localStorage.getItem(CURRENT_USER_ID_KEY);

      const now = Date.now();
      const isSessionValid = token && expiry && now < parseInt(expiry, 10);

      if (isSessionValid && savedUserId) {
        const found = profiles.find(p => p.id === savedUserId);
        if (found) {
          setCurrentUser(found);
          setIsLoading(false);
          return;
        }
      }

      setCurrentUser(null);
    } catch (err) {
      console.error('Failed to load user profiles:', err);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshProfiles();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    const profiles = await getProfiles();
    setAvailableProfiles(profiles);

    const matched = profiles.find(p => {
      const uMatch = (p.username && p.username.toLowerCase() === username.toLowerCase()) || 
                     (p.id.toLowerCase() === username.toLowerCase()) ||
                     (p.full_name.toLowerCase() === username.toLowerCase());
      const pMatch = p.password === password;
      return uMatch && pMatch;
    });

    if (matched) {
      setCurrentUser(matched);
      localStorage.setItem(CURRENT_USER_ID_KEY, matched.id);

      const tokenPayload = {
        sub: matched.id,
        username: matched.username || matched.full_name,
        role: matched.role,
        iat: Date.now(),
      };
      const mockJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(tokenPayload))}.signature`;
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

      localStorage.setItem(TOKEN_KEY, mockJwt);
      localStorage.setItem(EXPIRY_KEY, (Date.now() + fourteenDaysMs).toString());
      return true;
    }

    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(CURRENT_USER_ID_KEY);
  };

  const isOwner = currentUser?.role === 'owner';
  const isAdmin = currentUser?.role === 'collection_admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        login,
        logout,
        availableProfiles,
        refreshProfiles,
        isOwner,
        isAdmin,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
