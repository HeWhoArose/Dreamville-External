import { AppRoute } from '../../routes';

export type CanonicalNavigationSection =
	| 'HOME'
	| 'WORLDS'
	| 'CREATE'
	| 'COMPENDIUM'
	| 'SETTINGS'
	| 'OPERATIONS';

export type NavigationIconKey =
	| 'dashboard'
	| 'library'
	| 'world'
	| 'create'
	| 'compendium'
	| 'settings'
	| 'archive'
	| 'bible'
	| 'debug';

export interface CanonicalNavigationItem {
	route: AppRoute;
	label: string;
	section: CanonicalNavigationSection;
	icon: NavigationIconKey;
	mobilePrimary: boolean;
	mobileDrawer: boolean;
	desktop: boolean;
}

export const CANONICAL_NAV_ITEMS: CanonicalNavigationItem[] = [
	{
		route: 'dashboard',
		label: 'Dashboard',
		section: 'HOME',
		icon: 'dashboard',
		mobilePrimary: true,
		mobileDrawer: false,
		desktop: true,
	},
	{
		route: 'story-library',
		label: 'Story Library',
		section: 'HOME',
		icon: 'library',
		mobilePrimary: true,
		mobileDrawer: false,
		desktop: true,
	},
	{
		route: 'worlds',
		label: 'World Library',
		section: 'WORLDS',
		icon: 'world',
		mobilePrimary: true,
		mobileDrawer: false,
		desktop: true,
	},
	{
		route: 'create',
		label: 'Create World / Story',
		section: 'CREATE',
		icon: 'create',
		mobilePrimary: true,
		mobileDrawer: false,
		desktop: true,
	},
	{
		route: 'compendium',
		label: 'Compendium',
		section: 'COMPENDIUM',
		icon: 'compendium',
		mobilePrimary: true,
		mobileDrawer: false,
		desktop: true,
	},
	{
		route: 'settings',
		label: 'Settings',
		section: 'SETTINGS',
		icon: 'settings',
		mobilePrimary: false,
		mobileDrawer: true,
		desktop: true,
	},
	{
		route: 'ops.archive',
		label: 'Archive & Export',
		section: 'OPERATIONS',
		icon: 'archive',
		mobilePrimary: false,
		mobileDrawer: true,
		desktop: true,
	},
	{
		route: 'ops.bible',
		label: 'Living Bible',
		section: 'OPERATIONS',
		icon: 'bible',
		mobilePrimary: false,
		mobileDrawer: true,
		desktop: true,
	},
	{
		route: 'ops.debug',
		label: 'Debug & Context',
		section: 'OPERATIONS',
		icon: 'debug',
		mobilePrimary: false,
		mobileDrawer: true,
		desktop: true,
	},
];

export const CANONICAL_NAV_SECTION_ORDER: CanonicalNavigationSection[] = [
	'HOME',
	'WORLDS',
	'CREATE',
	'COMPENDIUM',
	'SETTINGS',
	'OPERATIONS',
];

export function getNavigationItemsForSection(
	section: CanonicalNavigationSection
): CanonicalNavigationItem[] {
	return CANONICAL_NAV_ITEMS.filter((item) => item.section === section);
}

export function getMobilePrimaryNavigation(): CanonicalNavigationItem[] {
	return CANONICAL_NAV_ITEMS.filter((item) => item.mobilePrimary);
}

export function getMobileDrawerNavigation(): CanonicalNavigationItem[] {
	return CANONICAL_NAV_ITEMS.filter((item) => item.mobileDrawer);
}
