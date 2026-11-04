import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, KeyRound, ShieldCheck } from 'lucide-react';
import { DEFAULT_MODEL } from '../utils/aiConfig';
import { Modal } from './Modal';

interface AIState {
  model: string;
  hasServerKey: boolean;
  loading: boolean;
  error: string;
  sessionKey: string;
  setSessionKey: (key: string) => void;
  refresh: () => Promise<void>;
}
const AIContext = createContext<AIState | null>(null);
export function AISettingsProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [hasServerKey, setHasServerKey] = useState(false);
  const [sessionKey, setSessionKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setModel(typeof data.model === 'string' ? data.model : DEFAULT_MODEL);
      setHasServerKey(data.hasApiKey === true);
      setError('');
    } catch {
      setError(
        'Non riesco a verificare il servizio. Puoi riprovare o usare una chiave per questa sessione.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // Remove the key saved by older versions. Current overrides live only in memory.
    try {
      localStorage.removeItem('fresco_gemini_key');
    } catch {}
    void refresh();
  }, []);
  return (
    <AIContext.Provider
      value={{
        model,
        hasServerKey,
        loading,
        error,
        sessionKey,
        setSessionKey: (key) => setSessionKey(key.trim()),
        refresh,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}
export function useAISettings() {
  const state = useContext(AIContext);
  if (!state) throw new Error('AI settings provider missing');
  return state;
}
export function AISettings({ onClose }: { onClose: () => void }) {
  const ai = useAISettings();
  const [key, setKey] = useState('');
  return (
    <Modal title="Impostazioni AI" onClose={onClose}>
      <div className="ai-service-card">
        <ShieldCheck size={24} />
        <div>
          <strong>Google Gemini</strong>
          <p>{ai.model}</p>
        </div>
      </div>
      <p className="note" role="status">
        {ai.loading
          ? 'Verifico la configurazione…'
          : ai.sessionKey
            ? 'È attiva la tua chiave per questa sessione.'
            : ai.hasServerKey
              ? 'La chiave del sito è configurata. Puoi iniziare subito.'
              : 'Inserisci una chiave Google AI Studio per iniziare.'}
      </p>
      {ai.error && (
        <p className="error-message" role="alert">
          {ai.error}{' '}
          <button className="link-button" onClick={() => void ai.refresh()}>
            Riprova verifica
          </button>
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!key.trim()) return;
          ai.setSessionKey(key);
          setKey('');
          onClose();
        }}
      >
        <label className="form-field">
          Chiave Google per questa sessione
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder={
              ai.hasServerKey
                ? 'Facoltativa: usa una tua chiave'
                : 'Incolla la chiave Google AI Studio'
            }
          />
        </label>
        <p className="note-text">
          La chiave personale resta in memoria fino al ricaricamento della
          pagina. L’analisi invia l’immagine a Google. Le quote e l’eventuale
          fatturazione dipendono dal tuo progetto Google AI Studio.
        </p>
        {ai.sessionKey && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              ai.setSessionKey('');
              setKey('');
            }}
          >
            <KeyRound size={17} />
            {ai.hasServerKey
              ? 'Usa la chiave del sito'
              : 'Rimuovi chiave di sessione'}
          </button>
        )}
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Chiudi
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!key.trim()}
          >
            Usa questa chiave <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
