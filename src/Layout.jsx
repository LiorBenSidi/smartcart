import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { NAV_ITEMS } from '@/components/mockData';
import { ShieldCheck, LogIn, Monitor, Smartphone, Moon, Sun, Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { storeManager } from "@/components/storeManager";
import { processManager } from "@/components/processManager";

export const ThemeContext = React.createContext();

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isWebView, setIsWebView] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const [storeState, setStoreState] = useState(storeManager.getState());
  const [processState, setProcessState] = useState(processManager.getState());

  useEffect(() => {
    const unsubscribeStore = storeManager.subscribe(setStoreState);
    const unsubscribeProcess = processManager.subscribe(setProcessState);
    return () => {
      unsubscribeStore();
      unsubscribeProcess();
    };
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) {
          const currentUser = await base44.auth.me();
          setUser(currentUser);

          // Fetch extended profile
          const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
          if (profiles.length > 0) {
            setUserProfile(profiles[0]);
          }
        }
      } catch (error) {
        console.error("Auth check failed", error);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(true)); //darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // If not landing page and not logged in, showing simplified layout
  const isLanding = currentPageName === 'Landing';

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
    <div className="bg-gray-50 text-gray-900 font-sans min-h-screen dark:bg-gray-900 dark:text-gray-100 antialiased relative transition-colors duration-200">


      {/* Content wrapper */}
      <div className={`${isWebView ? 'w-full max-w-[1920px]' : 'max-w-md'} mx-auto bg-white dark:bg-gray-800 min-h-screen shadow-2xl relative transition-all duration-300 ease-in-out`}>
        
        {/* Header - only show on authenticated pages */}
        {!isLanding && user &&
          <>
          <header className="px-6 py-4 flex justify-between items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100 dark:border-gray-700">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {currentPageName === 'Main' ? 'Main' : currentPageName}
              </h1>
              {storeState.loading && (
                <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Updating stores... {Math.round(storeState.progress)}%</span>
                </div>
              )}
              {processState.loading && (
                <div className="flex flex-col gap-1 w-full max-w-xs mt-1">
                   <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400">
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {processState.status}
                      </span>
                      <span>{Math.round(processState.progress)}%</span>
                   </div>
                   <Progress value={processState.progress} className="h-1" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {user.display_name && (
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300 hidden sm:inline-block">
                      Hi, {user.display_name}
                  </span>
              )}
              <Link to={createPageUrl('Profile')}>
                  {userProfile?.profile_picture ?
                  <img src={userProfile.profile_picture} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-indigo-100 dark:border-indigo-700" /> :

                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-sm hover:ring-2 hover:ring-indigo-300 transition-all">
                      {user.display_name?.[0] || user.full_name?.[0] || user.email?.[0] || 'U'}
                  </div>
                  }
              </Link>
            </div>
          </header>
          </>
          }

        <main className="pt-6 pr-6 pb-32 pl-6">
          {children}
        </main>

        {/* Bottom Navigation - only for authenticated users */}
        {!isLanding && user &&
          <nav className={`fixed bottom-6 left-4 right-4 backdrop-blur-md border rounded-2xl shadow-2xl px-2 py-3 z-50 mx-auto transition-all duration-300 ease-in-out max-w-md ${
          darkMode ?
          'bg-white/95 border-gray-200/50' :
          'bg-gray-900/95 border-gray-700/50'}`
          }>
            <div className="flex justify-around items-center">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.path === '/' && currentPageName === 'Home' ||
                `/${currentPageName.toLowerCase()}` === item.path;

                return (
                  <Link
                    key={item.label}
                    to={createPageUrl(item.path === '/' ? 'Home' : item.path.substring(1))}
                    className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
                    isActive ?
                    darkMode ? 'text-indigo-600' : 'text-indigo-400' :
                    darkMode ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'}`
                    }>

                    <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </Link>);

              })}
              {/* Admin Link - conditionally rendered */}
              {(userProfile?.is_admin || user?.role === 'admin') &&
              <Link
                to={createPageUrl('Admin')}
                className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
                currentPageName === 'Admin' ?
                darkMode ? 'text-indigo-600' : 'text-indigo-400' :
                darkMode ? 'text-gray-500 hover:text-gray-700' : 'text-gray-400 hover:text-gray-200'}`
                }>

                  <ShieldCheck className="w-6 h-6" />
                  <span className="text-[10px] font-medium">Admin</span>
                </Link>
              }
            </div>
          </nav>
          }
      </div>
    </div>
    </ThemeContext.Provider>);

}