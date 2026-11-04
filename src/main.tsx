import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AISettingsProvider } from './components/AISettings.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AISettingsProvider>
    <App />
  </AISettingsProvider>,
);
