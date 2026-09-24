import React, { useState } from 'react';
import { AppRoute } from '../../routes';
import { TopBar } from './TopBar';
import { SidebarNav } from './SidebarNav';
import { MobileNav } from './MobileNav';

export interface AppShellProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
  activeStoryTitle?: string;
  worldClockTime?: string;
  isEngineReady?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  onNavigate,
  children,
  activeStoryTitle,
  worldClockTime,
  isEngineReady = true,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsMobileMenuOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  const handleNavigate = (route: AppRoute) => {
    setIsMobileMenuOpen(false);
    onNavigate(route);
  };

  return (
    <div className="min-h-screen bg-[var(--db-bg-canvas)] text-[var(--db-text-primary)] flex flex-col selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Application Header */}
      <TopBar
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        onToggleSidebar={handleToggleSidebar}
        isSidebarCollapsed={isSidebarCollapsed}
        activeStoryTitle={activeStoryTitle}
        worldClockTime={worldClockTime}
        isEngineReady={isEngineReady}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Persistent Collapsible Sidebar (Desktop & Tablet) */}
        <SidebarNav
          currentRoute={currentRoute}
          onNavigate={handleNavigate}
          isCollapsed={isSidebarCollapsed}
          hasActiveStory={Boolean(activeStoryTitle)}
        />

        {/* Dynamic Viewport Container */}
        <main
          className="flex-1 overflow-y-auto pb-20 md:pb-8 p-4 sm:p-6 lg:p-8 dreambook-ambient-glow focus:outline-none"
          role="main"
          id="main-viewport"
          tabIndex={-1}
        >
          <div className="max-w-7xl mx-auto w-full animate-in fade-in duration-200">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar & Responsive Slide-Out Drawer */}
      <MobileNav
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        hasActiveStory={Boolean(activeStoryTitle)}
        isDrawerOpen={isMobileMenuOpen}
        onToggleDrawer={() => setIsMobileMenuOpen((prev) => !prev)}
        onCloseDrawer={() => setIsMobileMenuOpen(false)}
      />
    </div>
  );
};
