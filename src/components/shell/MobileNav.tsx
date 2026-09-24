import React, { useState } from 'react';
import { AppRoute } from '../../routes';
import { CANONICAL_NAV_SECTION_ORDER, getMobilePrimaryNavigation, getNavigationItemsForSection, NavigationIconKey } from './navigationModel';

export interface MobileNavProps {
	currentRoute: AppRoute;
	onNavigate: (route: AppRoute) => void;
	hasActiveStory?: boolean;
	isDrawerOpen?: boolean;
	onToggleDrawer?: () => void;
	onCloseDrawer?: () => void;
}

const ICONS: Record<NavigationIconKey, (className?: string) => React.ReactElement> = {
	dashboard: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>,
	library: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path d="M6 6h10M6 10h10" /></svg>,
	world: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
	create: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>,
	compendium: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path d="M6 6h10M6 10h10" /></svg>,
	settings: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
	archive: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
	bible: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
	debug: (className) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>,
};

export const MobileNav: React.FC<MobileNavProps> = ({
	currentRoute,
	onNavigate,
	hasActiveStory: _hasActiveStory = true,
	isDrawerOpen: controlledDrawerOpen,
	onToggleDrawer,
	onCloseDrawer,
}) => {
	const [localDrawerOpen, setLocalDrawerOpen] = useState(false);
	const isDrawerOpen = controlledDrawerOpen !== undefined ? controlledDrawerOpen : localDrawerOpen;
	const setDrawerOpen = (open: boolean) => {
		if (open) {
			onToggleDrawer ? onToggleDrawer() : setLocalDrawerOpen(true);
		} else {
			onCloseDrawer ? onCloseDrawer() : setLocalDrawerOpen(false);
		}
	};

	const primary = getMobilePrimaryNavigation();
	const handleNav = (route: AppRoute) => {
		onNavigate(route);
		setDrawerOpen(false);
	};

	return (
		<>
			{/* Bottom Bar for Mobile Viewports */}
			<nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[var(--db-bg-canvas)]/95 backdrop-blur-lg border-t border-[var(--db-border-default)] px-1 flex items-center justify-around z-40 select-none" role="navigation" aria-label="Mobile Navigation" data-testid="mobile-navigation">
				{primary.map((item) => {
					const selected = currentRoute === item.route || (item.route === 'create' && currentRoute.startsWith('create'));
					return (
						<button key={item.route} type="button" onClick={() => handleNav(item.route)} className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[52px] min-h-[44px] cursor-pointer ${selected ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'}`} aria-current={selected ? 'page' : undefined}>
							<div className={item.route === 'create' ? 'w-8 h-8 rounded-full bg-[var(--db-gold-500)]/20 border border-[var(--db-gold-500)]/40 flex items-center justify-center text-[var(--db-gold-400)]' : undefined}>
								{ICONS[item.icon]('w-5 h-5')}
							</div>
							<span className="text-[9px] font-medium">{item.route === 'dashboard' ? 'Home' : item.label.replace(' Library', '')}</span>
						</button>
					);
				})}
				<button type="button" onClick={() => setDrawerOpen(!isDrawerOpen)} className={`flex flex-col items-center justify-center gap-1 p-1 min-w-[52px] min-h-[44px] cursor-pointer ${isDrawerOpen ? 'text-[var(--db-purple-400)]' : 'text-[var(--db-text-muted)]'}`} aria-label="More Navigation Options">
					<span className="text-lg leading-none">•••</span>
					<span className="text-[9px] font-medium">Menu</span>
				</button>
			</nav>

			{/* Responsive Navigation Drawer (Accessible on Mobile / Non-Full-Screen View) */}
			{isDrawerOpen && (
				<div className="md:hidden fixed inset-0 z-50 flex">
					<div className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDrawerOpen(false)} />
					<div className="relative ml-auto w-4/5 max-w-xs bg-[var(--db-bg-canvas)] border-l border-[var(--db-border-strong)] h-full p-5 flex flex-col justify-between overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-200">
						<div className="space-y-6">
							<div className="flex items-center justify-between pb-3 border-b border-[var(--db-border-default)]">
								<div className="flex items-center gap-2">
									<div className="w-6 h-6 rounded-md bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 flex items-center justify-center text-[var(--db-gold-400)]">
										<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /></svg>
									</div>
									<span className="font-serif font-semibold text-sm text-[var(--db-text-primary)]">DreamBook Menu</span>
								</div>
								<button type="button" onClick={() => setDrawerOpen(false)} className="p-1.5 rounded text-[var(--db-text-muted)] hover:text-[var(--db-text-primary)] hover:bg-[var(--db-bg-raised)] cursor-pointer" aria-label="Close menu">✕</button>
							</div>

							<div className="space-y-5">
								{CANONICAL_NAV_SECTION_ORDER.map((section) => {
									const items = getNavigationItemsForSection(section);
									if (!items.length) return null;
									return (
										<div key={section} className="space-y-1">
											<div className="px-2 py-0.5 text-[10px] font-semibold text-[var(--db-text-muted)] uppercase tracking-wider">{section}</div>
											{items.map((item) => {
												const selected = currentRoute === item.route || (item.route === 'create' && currentRoute.startsWith('create'));
												return (
													<button
														key={item.route}
														type="button"
														onClick={() => handleNav(item.route)}
														className={`w-full flex items-center gap-3 text-left px-3 py-2 rounded-[var(--db-radius-md)] text-xs font-medium cursor-pointer transition-all ${selected ? 'text-[var(--db-purple-300)] bg-[var(--db-surface-purple)] border border-[var(--db-purple-500)]/40 shadow-sm' : 'text-[var(--db-text-secondary)] hover:bg-[var(--db-bg-raised)] hover:text-[var(--db-text-primary)] border border-transparent'}`}
													>
														{ICONS[item.icon]?.(selected ? 'w-4 h-4 text-[var(--db-purple-400)]' : 'w-4 h-4 text-[var(--db-text-muted)]')}
														<span className="truncate">{item.label}</span>
													</button>
												);
											})}
										</div>
									);
								})}
							</div>
						</div>
						<div className="pt-4 border-t border-[var(--db-border-default)] text-[10px] text-[var(--db-text-muted)] text-center">DreamBook Personal AI Story Engine</div>
					</div>
				</div>
			)}
		</>
	);
};
