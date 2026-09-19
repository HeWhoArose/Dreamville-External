/**
 * DreamBook Visual Screen Manifests
 * Declarative specifications for core viewports adhering to Visual Specification Compiler (v10.8.35).
 */

export interface ScreenManifest {
  screenId: string;
  screenName: string;
  category: 'BOOT' | 'HOME' | 'WORLDS' | 'CREATE' | 'PLAY' | 'ENGINE' | 'OPERATIONS';
  viewport: {
    minWidth: number;
    recommendedWidth: string;
    aspectRatio?: string;
  };
  background: {
    surfaceToken: string;
    ambientGlow?: string;
  };
  typography: {
    displayFont: string;
    bodyFont: string;
  };
  hierarchy: {
    primaryActions: string[];
    secondaryActions: string[];
    landmarks: string[];
  };
  states: {
    supportedStates: ('LOADING' | 'READY' | 'EMPTY' | 'NO_RESULTS' | 'ERROR' | 'OFFLINE')[];
  };
  motion: {
    entryTransition: string;
    reducedMotionAlternative: string;
  };
  accessibility: {
    ariaRole: string;
    headingLevel: number;
    announcedOnMount?: string;
  };
}

export const SCREEN_SPLASH: ScreenManifest = {
  screenId: 'dreambook.boot.splash',
  screenName: 'DreamBook Boot & Splash',
  category: 'BOOT',
  viewport: {
    minWidth: 320,
    recommendedWidth: '100vw',
  },
  background: {
    surfaceToken: 'var(--db-bg-canvas)',
    ambientGlow: 'radial-gradient(circle at 50% 50%, rgba(217, 154, 43, 0.08) 0%, transparent 65%)',
  },
  typography: {
    displayFont: 'Serif / Display',
    bodyFont: 'Sans-serif',
  },
  hierarchy: {
    primaryActions: ['Retry Connection'],
    secondaryActions: [],
    landmarks: ['main', 'status'],
  },
  states: {
    supportedStates: ['LOADING', 'READY', 'ERROR'],
  },
  motion: {
    entryTransition: 'fade-in 400ms cubic-bezier(0.16, 1, 0.3, 1)',
    reducedMotionAlternative: 'opacity 1',
  },
  accessibility: {
    ariaRole: 'status',
    headingLevel: 1,
    announcedOnMount: 'Loading DreamBook Story Engine...',
  },
};

export const SCREEN_ONBOARDING: ScreenManifest = {
  screenId: 'dreambook.onboarding.wizard',
  screenName: 'DreamBook First-Run Onboarding',
  category: 'BOOT',
  viewport: {
    minWidth: 320,
    recommendedWidth: 'max-w-2xl',
  },
  background: {
    surfaceToken: 'var(--db-bg-canvas)',
    ambientGlow: 'radial-gradient(circle at 50% 30%, rgba(217, 154, 43, 0.06) 0%, transparent 60%)',
  },
  typography: {
    displayFont: 'Serif / Display',
    bodyFont: 'Sans-serif',
  },
  hierarchy: {
    primaryActions: ['Next Step', 'Complete Setup', 'Skip to Dashboard'],
    secondaryActions: ['Back'],
    landmarks: ['main', 'form', 'navigation'],
  },
  states: {
    supportedStates: ['READY', 'LOADING'],
  },
  motion: {
    entryTransition: 'slide-up-fade 300ms cubic-bezier(0.16, 1, 0.3, 1)',
    reducedMotionAlternative: 'instant-step',
  },
  accessibility: {
    ariaRole: 'main',
    headingLevel: 1,
  },
};

export const SCREEN_DASHBOARD: ScreenManifest = {
  screenId: 'dreambook.home.dashboard',
  screenName: 'DreamBook Command Center Dashboard',
  category: 'HOME',
  viewport: {
    minWidth: 320,
    recommendedWidth: 'w-full max-w-7xl',
  },
  background: {
    surfaceToken: 'var(--db-bg-canvas)',
    ambientGlow: 'radial-gradient(circle at 50% 0%, rgba(217, 154, 43, 0.05) 0%, transparent 70%)',
  },
  typography: {
    displayFont: 'Serif / Display',
    bodyFont: 'Sans-serif',
  },
  hierarchy: {
    primaryActions: ['Resume Active Story', 'Create New Story', 'Explore Worlds'],
    secondaryActions: ['Open Story Library', 'View Settings'],
    landmarks: ['main', 'banner', 'navigation', 'complementary'],
  },
  states: {
    supportedStates: ['LOADING', 'READY', 'EMPTY', 'ERROR'],
  },
  motion: {
    entryTransition: 'fade-in 250ms ease-out',
    reducedMotionAlternative: 'instant',
  },
  accessibility: {
    ariaRole: 'main',
    headingLevel: 1,
  },
};

export const SCREEN_STORY_LIBRARY: ScreenManifest = {
  screenId: 'dreambook.home.library',
  screenName: 'DreamBook Story Library',
  category: 'HOME',
  viewport: {
    minWidth: 320,
    recommendedWidth: 'w-full max-w-7xl',
  },
  background: {
    surfaceToken: 'var(--db-bg-canvas)',
  },
  typography: {
    displayFont: 'Display',
    bodyFont: 'Sans-serif',
  },
  hierarchy: {
    primaryActions: ['Resume Story', 'Search Stories', 'Filter by Genre'],
    secondaryActions: ['Branch Timeline', 'Export Archive'],
    landmarks: ['main', 'search', 'region'],
  },
  states: {
    supportedStates: ['LOADING', 'READY', 'EMPTY', 'NO_RESULTS', 'ERROR'],
  },
  motion: {
    entryTransition: 'fade-in 250ms ease-out',
    reducedMotionAlternative: 'instant',
  },
  accessibility: {
    ariaRole: 'main',
    headingLevel: 1,
  },
};
