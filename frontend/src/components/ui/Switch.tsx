/** An On/Off switch: a button with role="switch", so it reads and tabs like a checkbox. */
interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  /** Text inside the knob track; defaults to On / Off. */
  onText?: string;
  offText?: string;
  small?: boolean;
}

export function Switch({ checked, onChange, label, disabled, onText = 'On', offText = 'Off', small }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'is-on' : ''} ${small ? 'is-small' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" aria-hidden="true" />
      <span className="switch-text">{checked ? onText : offText}</span>
    </button>
  );
}
