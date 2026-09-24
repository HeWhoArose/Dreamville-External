import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Database, GitBranch, HelpCircle, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../services/apiClient';

interface DeveloperDiagnosticsModalProps {
	isOpen: boolean;
	onClose: () => void;
	storyId: string;
}

type Tab = 'timeline' | 'rules' | 'runtime' | 'validation' | 'persistence' | 'acceptance';

export const DeveloperDiagnosticsModal: React.FC<DeveloperDiagnosticsModalProps> = ({
	isOpen,
	onClose,
	storyId,
}) => {
	const [tab, setTab] = useState<Tab>('timeline');
	const [timeline, setTimeline] = useState<any>(null);
	const [rules, setRules] = useState<any>(null);
	const [runtime, setRuntime] = useState<any>(null);
	const [validation, setValidation] = useState<any>(null);
	const [persistence, setPersistence] = useState<any>(null);
	const [why, setWhy] = useState<any>(null);
	const [acceptance, setAcceptance] = useState<any>(null);
	const [offset, setOffset] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		setLoading(true);
		setError(null);
		try {
			if (tab === 'timeline') setTimeline(await apiClient.getDiagnosticsTimeline(storyId, 50, offset));
			if (tab === 'rules') setRules(await apiClient.getDiagnosticsRules(storyId));
			if (tab === 'runtime') setRuntime(await apiClient.getDiagnosticsRuntime(storyId));
			if (tab === 'validation') setValidation(await apiClient.getDiagnosticsValidation(storyId));
			if (tab === 'persistence') setPersistence(await apiClient.getPersistenceStatus());
			if (tab === 'acceptance') setAcceptance(await apiClient.getPhase15AcceptanceMatrix());
		} catch (err: any) {
			setError(err?.message || 'Developer diagnostics request failed.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (isOpen) void load();
	}, [isOpen, tab, storyId, offset]);

	if (!isOpen) return null;

	const explain = async (event: any) => {
		try {
			setError(null);
			setWhy(await apiClient.explainDiagnosticEvent(storyId, event.eventId, event.commandId));
		} catch (err: any) {
			setError(err?.message || 'Could not explain this canonical event.');
		}
	};

	const pretty = (value: unknown) => JSON.stringify(value, null, 2);

	return (
		<div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-stone-950/85 backdrop-blur-md">
			<div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
				<header className="flex items-center justify-between p-5 border-b border-stone-800">
					<div>
						<div className="flex items-center gap-2">
							<Activity className="w-5 h-5 text-amber-400" />
							<h2 className="font-serif font-bold text-stone-100">Developer Diagnostics</h2>
							<span className="text-[9px] uppercase tracking-wider rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
								Read-only
							</span>
						</div>
						<p className="text-[11px] text-stone-500 font-mono mt-1">Canonical evidence inspector • {storyId}</p>
					</div>
					<button onClick={onClose} className="p-2 rounded-lg hover:bg-stone-800 text-stone-400">
						<X className="w-5 h-5" />
					</button>
				</header>

				<nav className="flex gap-1 overflow-x-auto p-3 border-b border-stone-800 bg-stone-950/40">
					{([
						['timeline', 'Chronicle Timeline', GitBranch],
						['rules', 'Rule Inspector', ShieldCheck],
						['runtime', 'Runtime State', Database],
						['validation', 'Validation', CheckCircle2],
						['persistence', 'Save Diagnostics', AlertTriangle],
						['acceptance', 'Final Acceptance', CheckCircle2],
					] as const).map(([id, label, Icon]) => (
						<button
							key={id}
							onClick={() => { setTab(id); setOffset(0); setWhy(null); }}
							className={`px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${tab === id ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-stone-400 border border-stone-800 hover:text-stone-200'}`}
						>
							<Icon className="inline w-3.5 h-3.5 mr-1.5" />{label}
						</button>
					))}
				</nav>

				<div className="flex-1 overflow-y-auto p-5">
					{loading && <div className="text-xs text-stone-500 font-mono mb-3">Reading canonical diagnostics…</div>}
					{error && <div className="mb-4 rounded-lg border border-rose-900/60 bg-rose-950/20 p-3 text-xs text-rose-300">{error}</div>}

					{tab === 'timeline' && (
						<div className="space-y-3">
							{(timeline?.items || []).map((event: any) => (
								<div key={event.eventId} className="rounded-xl border border-stone-800 bg-stone-950/40 p-4">
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div>
											<p className="text-xs font-mono font-bold text-stone-200">{event.commandType} • {event.summary}</p>
											<p className="text-[10px] font-mono text-stone-500 mt-1">{event.eventId} • seq {event.replay?.canonicalSequence ?? '—'}</p>
										</div>
										<button onClick={() => void explain(event)} className="px-2 py-1 rounded border border-amber-500/30 text-[10px] text-amber-300 hover:bg-amber-500/10">
											<HelpCircle className="inline w-3 h-3 mr-1" />Why did this happen?
										</button>
									</div>
									<div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px] font-mono text-stone-400">
										<div>Actor: {event.actorId || 'SYSTEM'}</div>
										<div>Source: {event.source}</div>
										<div>Mutations: {event.mutationCount}</div>
									</div>
									<div className="mt-2 text-[10px] font-mono text-stone-500 break-all">Paths: {(event.mutationPaths || []).join(', ') || 'none'}</div>
								</div>
							))}
							{timeline?.total === 0 && <p className="text-xs text-stone-500">No canonical events recorded.</p>}
							<div className="flex justify-between items-center pt-3">
								<button disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))} className="px-3 py-1.5 rounded border border-stone-700 text-xs text-stone-300 disabled:opacity-40"><ChevronLeft className="inline w-3.5 h-3.5" /> Previous</button>
								<span className="text-[10px] font-mono text-stone-500">{offset + 1}–{Math.min(offset + 50, timeline?.total || 0)} / {timeline?.total || 0}</span>
								<button disabled={!timeline?.hasMore || loading} onClick={() => setOffset(offset + 50)} className="px-3 py-1.5 rounded border border-stone-700 text-xs text-stone-300 disabled:opacity-40">Next <ChevronRight className="inline w-3.5 h-3.5" /></button>
							</div>
						</div>
					)}

					{tab === 'rules' && <pre className="text-[10px] leading-relaxed font-mono text-stone-300 whitespace-pre-wrap">{pretty(rules?.diagnostics || {})}</pre>}
					{tab === 'runtime' && <pre className="text-[10px] leading-relaxed font-mono text-stone-300 whitespace-pre-wrap">{pretty(runtime?.diagnostics || {})}</pre>}
					{tab === 'validation' && <div className="space-y-4">
						{(['world', 'character'] as const).map((kind) => {
							const result = validation?.[kind];
							return <div key={kind} className="rounded-xl border border-stone-800 bg-stone-950/40 p-4">
								<div className="flex items-center gap-2 mb-2">
									{result?.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
									<h3 className="text-xs font-bold uppercase text-stone-200">{kind} validation</h3>
								</div>
								<pre className="text-[10px] leading-relaxed font-mono text-stone-400 whitespace-pre-wrap">{pretty(result || {})}</pre>
							</div>;
						})}
					</div>}
					{tab === 'persistence' && <pre className="text-[10px] leading-relaxed font-mono text-stone-300 whitespace-pre-wrap">{pretty(persistence?.persistence || {})}</pre>}

					{tab === 'acceptance' && (
						<div className="space-y-4">
							<div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
								<div className="flex items-center justify-between gap-3">
									<div>
										<h3 className="text-sm font-serif font-bold text-amber-300">Phase 15 — Final Acceptance Matrix</h3>
										<p className="text-[10px] font-mono text-stone-500 mt-1">
											{acceptance?.coverage?.totalScenarios || 0} scenarios • {acceptance?.coverage?.totalGates || 0} gates
										</p>
									</div>
									<span className="text-[9px] font-mono uppercase rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">
										{acceptance?.status || 'LOADING'}
									</span>
								</div>
								<p className="text-xs text-stone-400 mt-3">
									This screen is a read-only coverage matrix. Runtime completion remains pending until the final full repository npm test, lint, and build gate is executed.
								</p>
							</div>

							<div className="overflow-x-auto rounded-xl border border-stone-800">
								<table className="w-full text-left text-[10px] font-mono">
									<thead className="bg-stone-950/80 text-stone-500 uppercase">
										<tr>
											<th className="px-3 py-2">Scenario</th>
											<th className="px-3 py-2">Rules</th>
											<th className="px-3 py-2">Narrative</th>
											<th className="px-3 py-2">Boundaries</th>
										</tr>
									</thead>
									<tbody>
										{(acceptance?.scenarios || []).map((scenario: any) => (
											<tr key={scenario.id} className="border-t border-stone-800">
												<td className="px-3 py-2 text-stone-200">{scenario.id}</td>
												<td className="px-3 py-2 text-amber-300">{scenario.rulesMode}</td>
												<td className="px-3 py-2 text-purple-300">{scenario.narrativeMode}</td>
												<td className="px-3 py-2 text-stone-500">{scenario.criticalBoundaries.join(', ')}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{(acceptance?.gates || []).map((gate: any) => (
									<div key={gate.id} className="rounded-xl border border-stone-800 bg-stone-950/40 p-3">
										<div className="flex items-center gap-2">
											<CheckCircle2 className="w-3.5 h-3.5 text-stone-500" />
											<span className="text-xs text-stone-200">{gate.title}</span>
										</div>
										<p className="mt-1 text-[9px] font-mono text-stone-600">{gate.source}</p>
									</div>
								))}
							</div>
						</div>
					)}

					{why && (
						<div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
							<div className="flex items-center justify-between">
								<h3 className="text-xs font-bold text-amber-300">{why.explanation?.title}</h3>
								<span className="text-[9px] font-mono text-emerald-300">Canonical evidence • AI not used</span>
							</div>
							<p className="text-xs text-stone-300 mt-2">{why.explanation?.summary}</p>
							<div className="mt-3 space-y-2">
								{(why.explanation?.evidence || []).map((item: any) => (
									<div key={item.id} className="rounded-lg border border-stone-800 bg-stone-950/50 p-2.5">
										<div className="text-[9px] uppercase font-mono text-stone-500">{item.source} • {item.id}</div>
										<div className="text-[11px] text-stone-300 mt-1">{item.description}</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
