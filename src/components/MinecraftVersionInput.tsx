import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';

/** Suggestions are provider-specific; manual entry remains available if lookup fails. */
export default function MinecraftVersionInput({
  software,
  value,
  onChange,
  disabled = false,
}: {
  software: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [versions, setVersions] = useState<string[]>([]);
  const [message, setMessage] = useState('Loading available versions…');
  useEffect(() => {
    let active = true;
    setVersions([]);
    setMessage('Loading available versions…');
    api<{ versions: string[] }>(`/minecraft/versions/${encodeURIComponent(software)}`)
      .then(({ versions }) => {
        if (active) {
          setVersions(versions);
          setMessage(
            `${versions.length} versions from the ${software} provider. You can also enter a version manually.`,
          );
        }
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [software]);
  return (
    <>
      <input
        list={id}
        aria-label="Minecraft version"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={32}
        autoComplete="off"
      />
      <datalist id={id}>
        {versions.map((version) => (
          <option value={version} key={version} />
        ))}
      </datalist>
      <small className="field-hint" role="status">
        {message}
      </small>
    </>
  );
}
