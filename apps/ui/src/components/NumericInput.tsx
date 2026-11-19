import React from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  allowDecimals?: boolean;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  className = '',
  allowDecimals = true,
  ...props
}) => {
  // Convert Arabic-Indic digits ٠-٩ to English digits 0-9
  const normalizeDigits = (str: string) => {
    return str.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = normalizeDigits(e.target.value.trim());

    // Filter out invalid characters
    if (allowDecimals) {
      raw = raw.replace(/[^0-9.]/g, '');
      const parts = raw.split('.');
      if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
    } else {
      raw = raw.replace(/[^0-9]/g, '');
    }

    // Remove leading zeroes before non-decimal numbers (e.g. "044" -> "44", "00" -> "0")
    if (raw.length > 1 && raw.startsWith('0') && raw[1] !== '.') {
      raw = raw.replace(/^0+/, '');
      if (raw === '') raw = '0';
    }

    if (raw === '' || raw === '.') {
      onChange(0);
      return;
    }

    const num = parseFloat(raw);
    onChange(isNaN(num) ? 0 : num);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Auto-select text on focus so user can immediately replace default 0
    e.target.select();
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={value === 0 ? '0' : value.toString()}
      onChange={handleChange}
      onFocus={handleFocus}
      className={`border rounded-xl p-2.5 text-sm outline-none transition-colors ${className}`}
      {...props}
    />
  );
};
