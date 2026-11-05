import { useEffect, useState } from 'react';
import { Save, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Server } from '../../shared/types';
import { api } from '../lib/api';
import { readProperty, updateProperties } from '../lib/minecraft-properties';
import { Button, ErrorState, Loading, Panel, PanelHeading } from './ui';

type Setting = {
  key: string;
  label: string;
  hint: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  min?: number;
  max?: number;
  fallback: string;
};
const settings: Setting[] = [
  {
    key: 'pvp',
    label: 'Player versus player',
    hint: 'Allow players to damage each other.',
    type: 'select',
    options: ['true', 'false'],
    fallback: 'true',
  },
  {
    key: 'allow-flight',
    label: 'Allow flight',
    hint: 'Allow flight on survival servers.',
    type: 'select',
    options: ['false', 'true'],
    fallback: 'false',
  },
  {
    key: 'enable-command-block',
    label: 'Command blocks',
    hint: 'Enable command blocks in the world.',
    type: 'select',
    options: ['false', 'true'],
    fallback: 'false',
  },
  {
    key: 'view-distance',
    label: 'View distance',
    hint: 'Chunks sent to players (2–32).',
    type: 'number',
    min: 2,
    max: 32,
    fallback: '10',
  },
  {
    key: 'simulation-distance',
    label: 'Simulation distance',
    hint: 'Chunks simulated around players (3–32).',
    type: 'number',
    min: 3,
    max: 32,
    fallback: '10',
  },
];

export default function MinecraftProperties({ server }: { server: Server }) {
  const [original, setOriginal] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = `/servers/${server.id}/files/read?path=server.properties`;
  async function load() {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { content } = await api<{ content: string }>(path);
      const parsed = Object.fromEntries(
        settings.map((item) => [item.key, readProperty(content, item.key) ?? item.fallback]),
      );
      setOriginal(content);
      setValues(parsed);
      setInitial(parsed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [server.id]);
  const changed = settings.filter((item) => values[item.key] !== initial[item.key]);
  async function save() {
    setError('');
    setNotice('');
    for (const item of changed) {
      const value = values[item.key];
      if (
        /[\r\n]/.test(value) ||
        (item.type === 'number' &&
          (!/^\d+$/.test(value) || Number(value) < item.min! || Number(value) > item.max!))
      ) {
        setError(
          `Please enter a valid ${item.label.toLowerCase()}${item.type === 'number' ? ` (${item.min}–${item.max})` : ''}.`,
        );
        return;
      }
    }
    setBusy(true);
    try {
      const latest = await api<{ content: string }>(path);
      if (latest.content !== original)
        throw new Error(
          'server.properties changed since you opened it. Reload to avoid overwriting other changes.',
        );
      const content = updateProperties(
        original,
        Object.fromEntries(changed.map((item) => [item.key, values[item.key]])),
      );
      await api(`/servers/${server.id}/files/write`, {
        method: 'PUT',
        body: { path: 'server.properties', content },
      });
      setOriginal(content);
      setInitial({ ...values });
      setNotice('Saved to server.properties. Start the server to apply your changes.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading text="Loading Minecraft properties…" />;
  if (!Object.keys(initial).length)
    return <ErrorState message={error || 'Could not load server.properties.'} retry={() => void load()} />;
  return (
    <Panel className="minecraft-properties">
      <PanelHeading
        title="Minecraft properties"
        subtitle="Configure your world without editing the file by hand."
      >
        <SlidersHorizontal size={20} />
      </PanelHeading>
      <div className="properties-body">
        <div className="inline-alert info">
          Stop your server before saving. Changes take effect on the next start. Message of the day, player
          slots, difficulty and game mode are controlled by{' '}
          <Link to={`/servers/${server.id}/settings`}>Startup settings</Link>.
        </div>
        {error && (
          <div className="inline-alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="inline-alert info" role="status">
            {notice}
          </div>
        )}
        <div className="properties-grid">
          {settings.map((item) => (
            <label className="property-field" key={item.key}>
              <span>{item.label}</span>
              <small>{item.hint}</small>
              {item.type === 'select' ? (
                <select
                  value={values[item.key]}
                  onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
                >
                  {!item.options!.includes(values[item.key]) && (
                    <option value={values[item.key]}>{values[item.key]} (current)</option>
                  )}
                  {item.options!.map((option) => (
                    <option key={option} value={option}>
                      {option === 'true' ? 'Enabled' : option === 'false' ? 'Disabled' : option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={item.type}
                  min={item.min}
                  max={item.max}
                  value={values[item.key]}
                  onChange={(e) => setValues({ ...values, [item.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        <div className="properties-actions">
          <span>
            {changed.length
              ? `${changed.length} unsaved ${changed.length === 1 ? 'change' : 'changes'}`
              : 'No unsaved changes'}
          </span>
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            <RotateCcw size={15} /> Reload
          </Button>
          <Button
            disabled={!changed.length || server.status !== 'offline'}
            loading={busy}
            onClick={() => void save()}
          >
            <Save size={15} /> Save properties
          </Button>
        </div>
        {server.status !== 'offline' && (
          <p className="properties-note">Saving is available when the deployment is offline.</p>
        )}
      </div>
    </Panel>
  );
}
