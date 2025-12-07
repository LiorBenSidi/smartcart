import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { NAV_ITEMS } from '@/components/mockData';
import { ShieldCheck, LogIn, Monitor, Smartphone } from 'lucide-react';

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isWebView, setIsWebView] = useState(true);

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

  // If not landing page and not logged in, showing simplified layout
  const isLanding = currentPageName === 'Landing';
  
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans antialiased pb-24 relative">
      <div className="fixed bottom-24 right-6 z-[60]">
        <button
          onClick={() => setIsWebView(!isWebView)}
          className="bg-gray-900 text-white p-3 rounded-full shadow-xl hover:bg-gray-800 transition-all hover:scale-105"
          title={isWebView ? "Switch to Mobile View" : "Switch to Web View"}
        >
          {isWebView ? <Smartphone className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>
      </div>

      {/* Content wrapper */}
      <div className={`${isWebView ? 'w-full max-w-[1920px]' : 'max-w-md'} mx-auto bg-white min-h-screen shadow-2xl relative overflow-hidden transition-all duration-300 ease-in-out`}>
        
        {/* Header - only show on authenticated pages */}
        {!isLanding && user && (
          <header className="px-6 py-4 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-100">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              {currentPageName === 'Home' ? 'Dashboard' : currentPageName}
            </h1>
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">
               {user.full_name?.[0] || user.email?.[0] || 'U'}
            </div>
          </header>
        )}

        <main className={!isLanding && user ? "p-6" : ""}>
          {children}
        </main>

        {/* Bottom Navigation - only for authenticated users */}
        {!isLanding && user && (
          <nav className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 z-50 mx-auto transition-all duration-300 ease-in-out ${isWebView ? 'w-full max-w-[1920px]' : 'max-w-md'}`}>
            <div className="flex justify-between items-center">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = (item.path === '/' && currentPageName === 'Home') || 
                               (`/${currentPageName.toLowerCase()}` === item.path);
                
                return (
                  <Link 
                    key={item.label} 
                    to={createPageUrl(item.path === '/' ? 'Home' : item.path.substring(1))}
                    className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
                      isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${isActive ? 'fill-current bg-opacity-20' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
              {/* Admin Link - conditionally rendered */}
              {(userProfile?.is_admin || user?.email === 'liorben@base44.com') && (
                <Link 
                  to={createPageUrl('Admin')}
                  className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
                    currentPageName === 'Admin' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                  <span className="text-[10px] font-medium">Admin</span>
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}