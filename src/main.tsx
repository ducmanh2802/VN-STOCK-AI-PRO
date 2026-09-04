import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { QueryProvider } from './providers/QueryProvider';
import { GlobalErrorBoundary } from './components/ui/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <QueryProvider>
        <App />
      </QueryProvider>
    </GlobalErrorBoundary>
  </StrictMode>,
);

