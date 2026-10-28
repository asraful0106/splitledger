import { useState, type InputHTMLAttributes } from "react";
import { currencyInfo, minorToMajorString, parseMajorToMinor } from "shared";

interface AmountFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  currency?: string;
  valueMinor: bigint;
  onChangeMinor: (minor: bigint) => void;
}

export function AmountField({
  label,
  error,
  hint,
  currency = "BDT",
  valueMinor,
  onChangeMinor,
  id,
  ...rest
}: AmountFieldProps) {
  const [text, setText] = useState(() => (valueMinor === 0n ? "" : minorToMajorString(valueMinor)));
  const fieldId = id ?? "amount";
  const errorId = `${fieldId}-error`;
  const symbol = currencyInfo(currency).symbol;

  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <div className="amount-wrap">
        <span className="amount-prefix" aria-hidden="true">
          {symbol}
        </span>
        <input
          id={fieldId}
          className="field-input amount-input"
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="0.00"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={text}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            onChangeMinor(parseMajorToMinor(next) ?? 0n);
          }}
          {...rest}
        />
      </div>
      {hint && !error ? <span className="field-hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
