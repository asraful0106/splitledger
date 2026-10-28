import { forwardRef, useState, type InputHTMLAttributes } from "react";

interface PasswordFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ label, error, hint, id, name, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const fieldId = id ?? name ?? "password";
    const errorId = `${fieldId}-error`;

    return (
      <div className="field">
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
        <div className="field-input-wrap">
          <input
            ref={ref}
            id={fieldId}
            name={name}
            type={visible ? "text" : "password"}
            className="field-input"
            style={{ paddingRight: "4.25rem" }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            {...rest}
          />
          <button
            type="button"
            className="field-toggle"
            onClick={() => setVisible((value) => !value)}
            aria-pressed={visible}
          >
            {visible ? "Hide" : "Show"}
          </button>
        </div>
        {hint && !error ? <span className="field-hint">{hint}</span> : null}
        {error ? (
          <span className="field-error" id={errorId} role="alert">
            {error}
          </span>
        ) : null}
      </div>
    );
  },
);
