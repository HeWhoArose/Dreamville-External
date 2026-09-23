import React, { useEffect, useMemo, useState } from 'react';
import {
	Activity,
	AlertTriangle,
	Brain,
	Building2,
	ChevronRight,
	GitBranch,
	HeartHandshake,
	MapPin,
	RefreshCw,
	Save,
	Search,
	ShieldCheck,
	Target,
	Users,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';

type Phase8Tab = 'situations' | 'facility' | 'npcs' | 'knowledge' | 'causality' | 'relationships' | 'laws';

interface Phase8WorldWorkbenchProps {
	storyId: string;
}

const starterRule = {
	id: 'world_rule_example',
	name: 'Example World Law',
	version: 1,
	enabled: true,
	priority: 10,
	scope: 'WORLD',
	trigger: { event: 'CUSTOM', eventType: 'TECHNIQUE_EXPLAINED' },
	conditions: [],
	effects: [{ type: 'SET_RULE_STATE', key: 'example', value: true }],
	provenance: 'WORLD_CANON',
	description: 'Replace this example with an authored world mechanic.',
};

export const Phase8WorldWorkbench: React.FC<Phase8WorldWorkbenchProps> = ({ storyId }) => {
	const [projection, setProjection] = useState<any | null>(null);
	const [rules, setRules] = useState<any[]>([]);
	const [activeTab, setActiveTab] = useState<Phase8Tab>('situations');
	const [searchText, setSearchText] = useState('');
	const [ruleDraft, setRuleDraft] = useState(JSON.stringify(starterRule, null, 2));
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	const refresh = async () => {
		setLoading(true);
		setError(null);
		try {
			const nextProjection = await apiClient.getPhase8Projection(storyId);
			setProjection(nextProjection);
			if (nextProjection.worldId) {
				setRules(await apiClient.getWorldCustomRules(nextProjection.worldId, storyId));
			} else {
				setRules([]);
			}
		} catch (err: any) {
			setError(err?.message || 'Failed to load Phase 8 world systems.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void refresh();
	}, [storyId]);

	const facts = useMemo(() => {
		const allFacts = projection?.knowledge?.facts || [];
		const query = searchText.trim().toLowerCase();
		if (!query) return allFacts;
		return allFacts.filter((fact: any) =>
			[fact.id, fact.subjectEntityId, fact.predicate, fact.objectValue, fact.status]
				.some((value) => String(value || '').toLowerCase().includes(query))
		);
	}, [projection, searchText]);

	const saveRule = async () => {
		setError(null);
		setStatus(null);
		try {
			if (!projection?.worldId) throw new Error('No active world is available for world-law authoring.');
			const rule = JSON.parse(ruleDraft);
			const validation = await apiClient.validateWorldCustomRule(projection.worldId, rule, storyId);
			if (!validation.success) {
				setError((validation.errors || []).join(' ') || 'Rule validation failed.');
				return;
			}
			await apiClient.saveWorldCustomRule(projection.worldId, rule, storyId);
			setRules(await apiClient.getWorldCustomRules(projection.worldId, storyId));
			setStatus('World law validated and saved.');
		} catch (err: any) {
			setError(err?.message || 'World law JSON is invalid.');
		}
	};

	return (
		<div className="min-h-full rounded-2xl border border-stone-800 bg-stone-950 text-stone-100 shadow-xl">
			<div className="flex items-center justify-between border-b border-stone-800 px-5 py-4">
				<div>
					<div className="flex items-center gap-2">
						<Activity className="h-4 w-4 text-amber-400" />
						<h2 className="font-serif text-xl font-semibold">World Systems</h2>
					</div>
					<p className="mt-1 text-[11px] font-mono text-stone-500">
						Phase 8.6–8.12 • server-authoritative, player-safe projection
					</p>
				</div>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={loading}
					className="rounded-lg border border-stone-700 bg-stone-900 p-2 text-stone-300 hover:text-stone-100 disabled:opacity-50"
					aria-label="Refresh world systems"
				>
					<RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
				</button>
			</div>

			<div className="flex gap-1 overflow-x-auto border-b border-stone-800 bg-stone-900/60 px-3 py-2">
				{([
					['situations', 'Situations', Target],
					['facility', 'Facility', Building2],
					['npcs', 'NPCs', Users],
					['knowledge', 'Knowledge', Brain],
					['causality', 'Causality', GitBranch],
					['relationships', 'Relations', HeartHandshake],
					['laws', 'World Laws', ShieldCheck],
				] as const).map(([id, label, Icon]) => (
					<button
						key={id}
						type="button"
						onClick={() => setActiveTab(id)}
						className={activeTab === id
							? 'flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300'
							: 'flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-xs text-stone-400 hover:bg-stone-800 hover:text-stone-200'}
					>
						<Icon className="h-3.5 w-3.5" />
						{label}
					</button>
				))}
			</div>

			<div className="p-5">
				{error && (
					<div className="mb-4 flex gap-2 rounded-xl border border-rose-900/60 bg-rose-950/30 p-3 text-xs text-rose-300">
						<AlertTriangle className="h-4 w-4 shrink-0" />
						<span>{error}</span>
					</div>
				)}
				{status && (
					<div className="mb-4 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-xs text-emerald-300">
						{status}
					</div>
				)}

				{activeTab === 'situations' && (
					<div className="space-y-4">
						<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
							<Metric label="Active situations" value={projection?.summary?.activeSituations ?? 0} />
							<Metric label="Transformed" value={projection?.summary?.transformedSituations ?? 0} />
							<Metric label="Known facts" value={projection?.summary?.knownFacts ?? 0} />
						</div>
						{(projection?.situations || []).length === 0 ? (
							<Empty text="No player-visible dynamic situations are active." />
						) : projection.situations.map((situation: any) => (
							<div key={situation.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
								<div className="flex items-start justify-between gap-3">
									<div>
										<h3 className="font-serif font-semibold">{situation.title}</h3>
										<p className="text-[10px] font-mono uppercase text-amber-400">{situation.status}</p>
									</div>
									<span className="text-[10px] text-stone-500">{situation.participants?.length || 0} participants</span>
								</div>
								<div className="mt-3 space-y-2">
									{(situation.objectives || []).map((objective: any) => (
										<div key={objective.id} className="rounded-lg bg-stone-950/80 p-2.5 text-xs">
											<span className={objective.failed ? 'text-rose-300 line-through' : objective.completed ? 'text-emerald-300' : 'text-stone-300'}>
												{objective.description}
											</span>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}

				{activeTab === 'facility' && (
					<div className="space-y-4">
						<div className="rounded-xl border border-cyan-900/40 bg-cyan-950/10 p-3 text-xs text-cyan-200">
							Only discovered facility state is projected here. Hidden devices remain outside the player projection until discovered.
						</div>
						{(projection?.facilities || []).length === 0 ? (
							<Empty text="No player-visible facility state exists at the current location." />
						) : projection.facilities.map((facility: any) => (
							<div key={facility.facilityId} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4 space-y-3">
								<h3 className="flex items-center gap-2 font-serif font-semibold">
									<Building2 className="h-4 w-4 text-amber-400" />
									{facility.facilityId}
								</h3>
								<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
									<Metric label="Known nodes" value={facility.nodes?.length || 0} />
									<Metric label="Known devices" value={facility.devices?.length || 0} />
									<Metric label="Security zones" value={facility.securityZones?.length || 0} />
									<Metric label="Power circuits" value={Object.keys(facility.power || {}).length} />
								</div>
								<div className="space-y-2">
									{(facility.devices || []).map((device: any) => (
										<div key={device.id} className="flex items-center justify-between rounded-lg border border-stone-800 bg-stone-950/70 p-3">
											<span className="text-xs text-stone-200">{device.id}</span>
											<span className={device.active ? 'text-[10px] font-mono text-emerald-400' : 'text-[10px] font-mono text-stone-500'}>
												{device.active ? 'ACTIVE' : 'OFFLINE'}
											</span>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}

				{activeTab === 'npcs' && (
					<div className="space-y-4">
						<div className="rounded-xl border border-blue-900/40 bg-blue-950/10 p-3 text-xs text-blue-200">
							Only public NPC goals are shown. Private goals, secrets, beliefs, plans, and deception state remain server-authoritative.
						</div>
						{(projection?.npcs || []).length === 0 ? (
							<Empty text="No player-visible NPC autonomy state is currently available." />
						) : projection.npcs.map((npc: any) => (
							<div key={npc.actorId} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
								<div className="flex items-center gap-2">
									<Users className="h-4 w-4 text-blue-400" />
									<h3 className="font-serif font-semibold">{npc.actorId}</h3>
								</div>
								<div className="mt-3 space-y-2">
									{(npc.goals || []).length === 0 ? (
										<p className="text-xs text-stone-500">No public goals have been disclosed.</p>
									) : npc.goals.map((goal: any) => (
										<div key={goal.id} className="rounded-lg border border-stone-800 bg-stone-950/70 p-3">
											<div className="flex items-center justify-between gap-3">
												<span className="text-xs text-stone-200">{goal.description}</span>
												<span className="text-[10px] font-mono text-stone-500">priority {goal.priority}</span>
											</div>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}

				{activeTab === 'knowledge' && (
					<div className="space-y-4">
						<div className="flex items-center gap-2 rounded-xl border border-stone-800 bg-stone-900/60 p-3">
							<Search className="h-4 w-4 text-cyan-400" />
							<input
								value={searchText}
								onChange={(event) => setSearchText(event.target.value)}
								placeholder="Search your known facts…"
								className="w-full bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-600"
							/>
						</div>
						{facts.length === 0 ? (
							<Empty text="No matching player knowledge is available." />
						) : facts.map((fact: any) => (
							<div key={fact.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
								<div className="flex items-center justify-between gap-2">
									<span className="text-[10px] font-mono uppercase text-cyan-400">{fact.status}</span>
									<span className="text-[10px] text-stone-500">{Math.round((Number(fact.confidence) || 0) * 100)}% confidence</span>
								</div>
								<p className="mt-2 text-sm text-stone-200">{fact.subjectEntityId} {fact.predicate} {fact.objectValue}</p>
								<p className="mt-1 text-[10px] text-stone-500">Evidence: {(fact.sourceEvidenceIds || []).join(', ') || 'none'}</p>
							</div>
						))}
					</div>
				)}

				{activeTab === 'causality' && (
					<div className="space-y-3">
						<div className="rounded-xl border border-purple-900/40 bg-purple-950/10 p-3 text-xs text-purple-200">
							Causal edges shown here are restricted to nodes visible through the player's epistemic state.
						</div>
						{(projection?.causality?.edges || []).length === 0 ? (
							<Empty text="No player-visible causal chain is currently established." />
						) : projection.causality.edges.map((edge: any) => (
							<div key={edge.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
								<div className="flex items-center gap-2">
									<GitBranch className="h-3.5 w-3.5 text-purple-400" />
									<span className="font-mono text-xs">{edge.relation}</span>
								</div>
								<p className="mt-2 flex items-center gap-1 text-xs text-stone-400">
									{edge.fromId}
									<ChevronRight className="h-3 w-3" />
									{edge.toId}
								</p>
								<p className="mt-1 text-[10px] text-stone-600">Confidence {Math.round((Number(edge.confidence) || 0) * 100)}%</p>
							</div>
						))}
					</div>
				)}

				{activeTab === 'relationships' && (
					<div className="space-y-3">
						{(projection?.relationships || []).length === 0 ? (
							<Empty text="No authoritative relationship state is currently visible." />
						) : projection.relationships.map((relationship: any) => (
							<div key={relationship.sourceId + ':' + relationship.targetId} className="grid grid-cols-2 gap-3 rounded-xl border border-stone-800 bg-stone-900/60 p-4 md:grid-cols-5">
								<RelationshipMetric label="Trust" value={relationship.trust} />
								<RelationshipMetric label="Affinity" value={relationship.affinity} />
								<RelationshipMetric label="Fear" value={relationship.fear} />
								<RelationshipMetric label="Respect" value={relationship.respect} />
								<RelationshipMetric label="Hostility" value={relationship.hostility} />
							</div>
						))}
					</div>
				)}

				{activeTab === 'laws' && (
					<div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<h3 className="font-serif text-base font-semibold">World Laws</h3>
								<span className="text-[10px] font-mono text-stone-500">{rules.length} rules</span>
							</div>
							{rules.map((rule: any) => (
								<div key={rule.id} className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
									<div className="flex items-center justify-between">
										<div>
											<h4 className="text-sm font-medium">{rule.name}</h4>
											<p className="text-[10px] font-mono text-stone-500">{rule.id} • priority {rule.priority}</p>
										</div>
										<span className={rule.enabled ? 'text-[10px] font-mono text-emerald-400' : 'text-[10px] font-mono text-stone-500'}>
											{rule.enabled ? 'ENABLED' : 'DISABLED'}
										</span>
									</div>
									<p className="mt-2 text-xs text-stone-400">{rule.description || 'No description.'}</p>
								</div>
							))}
							{rules.length === 0 && <Empty text="No custom world laws have been authored." />}
						</div>

						<div className="space-y-3 rounded-xl border border-stone-800 bg-stone-900/60 p-4">
							<div>
								<h3 className="font-serif text-base font-semibold">Author a World Law</h3>
								<p className="mt-1 text-[11px] text-stone-500">Server validation runs before persistence.</p>
							</div>
							<textarea
								value={ruleDraft}
								onChange={(event) => setRuleDraft(event.target.value)}
								className="min-h-[360px] w-full rounded-xl border border-stone-800 bg-stone-950 p-3 font-mono text-[11px] text-stone-200 outline-none"
								spellCheck={false}
							/>
							<button
								type="button"
								onClick={() => void saveRule()}
								disabled={loading}
								className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
							>
								<Save className="h-3.5 w-3.5" />
								Validate & Save
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
	<div className="rounded-xl border border-stone-800 bg-stone-950/70 p-3">
		<p className="text-[9px] font-mono uppercase tracking-wider text-stone-500">{label}</p>
		<p className="mt-1 text-lg font-semibold text-stone-100">{value}</p>
	</div>
);

const RelationshipMetric: React.FC<{ label: string; value: number }> = ({ label, value }) => (
	<div>
		<p className="text-[9px] font-mono uppercase text-stone-500">{label}</p>
		<p className={value >= 0 ? 'mt-1 font-semibold text-emerald-300' : 'mt-1 font-semibold text-rose-300'}>{value}</p>
	</div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
	<div className="rounded-2xl border border-dashed border-stone-800 bg-stone-950/50 p-8 text-center text-xs text-stone-500">
		<MapPin className="mx-auto mb-2 h-4 w-4 text-stone-700" />
		{text}
	</div>
);
