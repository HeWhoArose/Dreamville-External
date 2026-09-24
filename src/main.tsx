import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

interface BootErrorBoundaryProps {
	children: ReactNode;
}

interface BootErrorBoundaryState {
	error: Error | null;
}

class BootErrorBoundary extends Component<BootErrorBoundaryProps, BootErrorBoundaryState> {
	public state: BootErrorBoundaryState = { error: null };

	public static getDerivedStateFromError(error: Error): BootErrorBoundaryState {
		return { error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error('[DreamBook] React render failure', error, errorInfo);
	}

	public render(): ReactNode {
		if (this.state.error) {
			return (
				<div
					style={{
						minHeight: '100vh',
						background: '#090807',
						color: '#f5f0e8',
						padding: '32px',
						fontFamily: 'system-ui, sans-serif',
						boxSizing: 'border-box',
					}}
				>
					<div style={{ maxWidth: '900px', margin: '0 auto' }}>
						<div style={{ fontSize: '14px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.65 }}>
							DreamBook Boot Error
						</div>
						<h1 style={{ fontSize: '30px', margin: '10px 0 14px' }}>
							The interface failed during startup.
						</h1>
						<p style={{ lineHeight: 1.6, opacity: 0.8 }}>
							The app is no longer allowed to fail into a blank white screen. The error below identifies the React-side failure.
						</p>
						<pre
							style={{
								marginTop: '24px',
								padding: '18px',
								overflow: 'auto',
								background: '#14110f',
								border: '1px solid #3a3028',
								borderRadius: '10px',
								whiteSpace: 'pre-wrap',
								wordBreak: 'break-word',
							}}
						>
							{this.state.error.stack || this.state.error.message}
						</pre>
						<button
							type='button'
							onClick={() => window.location.reload()}
							style={{
								marginTop: '20px',
								padding: '11px 16px',
								borderRadius: '8px',
								border: '1px solid #6f5a44',
								background: '#241d17',
								color: '#f5f0e8',
								cursor: 'pointer',
							}}
						>
							Reload DreamBook
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

const root = document.getElementById('root');

if (!root) {
	throw new Error('DreamBook boot failed: #root element was not found.');
}

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<BootErrorBoundary>
			<App />
		</BootErrorBoundary>
	</React.StrictMode>
);
