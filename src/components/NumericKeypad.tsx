import type { KeypadConfig } from '../types';

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  config: KeypadConfig;
  disabled?: boolean;
}

export function NumericKeypad({ value, onChange, onSubmit, config, disabled }: NumericKeypadProps) {
  const handleKey = (key: string) => {
    if (disabled) return;

    switch (key) {
      case 'backspace':
        onChange(value.slice(0, -1));
        break;
      case 'clear':
        onChange('');
        break;
      case 'submit':
        if (value.trim()) {
          onSubmit();
        }
        break;
      case '-':
        // Only allow negative at start
        if (value === '' && config.showNegative) {
          onChange('-');
        }
        break;
      case '.':
        // Only allow one decimal point
        if (!value.includes('.') && config.showDecimal) {
          onChange(value + '.');
        }
        break;
      case '/':
        // Only allow one fraction separator
        if (!value.includes('/') && config.showFraction) {
          onChange(value + '/');
        }
        break;
      default:
        onChange(value + key);
    }
  };

  const buttonClass = (variant: 'number' | 'action' | 'submit' | 'special' = 'number') => {
    const base = 'font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation';
    const sizes = 'text-2xl py-4 px-2';

    switch (variant) {
      case 'submit':
        return `${base} ${sizes} bg-green-500 hover:bg-green-600 text-white`;
      case 'action':
        return `${base} ${sizes} bg-gray-200 hover:bg-gray-300 text-gray-700`;
      case 'special':
        return `${base} ${sizes} bg-blue-100 hover:bg-blue-200 text-blue-700`;
      default:
        return `${base} ${sizes} bg-white hover:bg-gray-50 text-gray-800 border border-gray-200`;
    }
  };

  return (
    <div className="bg-gray-100 p-3 rounded-2xl">
      {/* Display */}
      <div className="bg-white rounded-xl p-4 mb-3 min-h-[60px] flex items-center justify-end">
        <span className={`text-3xl font-mono ${value ? 'text-gray-800' : 'text-gray-400'}`}>
          {value || 'Enter answer...'}
        </span>
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Row 1: 7 8 9 backspace */}
        <button onClick={() => handleKey('7')} className={buttonClass()} disabled={disabled}>7</button>
        <button onClick={() => handleKey('8')} className={buttonClass()} disabled={disabled}>8</button>
        <button onClick={() => handleKey('9')} className={buttonClass()} disabled={disabled}>9</button>
        <button onClick={() => handleKey('backspace')} className={buttonClass('action')} disabled={disabled}>
          ⌫
        </button>

        {/* Row 2: 4 5 6 clear */}
        <button onClick={() => handleKey('4')} className={buttonClass()} disabled={disabled}>4</button>
        <button onClick={() => handleKey('5')} className={buttonClass()} disabled={disabled}>5</button>
        <button onClick={() => handleKey('6')} className={buttonClass()} disabled={disabled}>6</button>
        <button onClick={() => handleKey('clear')} className={buttonClass('action')} disabled={disabled}>
          C
        </button>

        {/* Row 3: 1 2 3 special */}
        <button onClick={() => handleKey('1')} className={buttonClass()} disabled={disabled}>1</button>
        <button onClick={() => handleKey('2')} className={buttonClass()} disabled={disabled}>2</button>
        <button onClick={() => handleKey('3')} className={buttonClass()} disabled={disabled}>3</button>
        {config.showFraction ? (
          <button onClick={() => handleKey('/')} className={buttonClass('special')} disabled={disabled}>
            /
          </button>
        ) : (
          <div />
        )}

        {/* Row 4: negative 0 decimal submit */}
        {config.showNegative ? (
          <button onClick={() => handleKey('-')} className={buttonClass('special')} disabled={disabled}>
            −
          </button>
        ) : (
          <div />
        )}
        <button onClick={() => handleKey('0')} className={buttonClass()} disabled={disabled}>0</button>
        {config.showDecimal ? (
          <button onClick={() => handleKey('.')} className={buttonClass('special')} disabled={disabled}>
            .
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={() => handleKey('submit')}
          className={buttonClass('submit')}
          disabled={disabled || !value.trim()}
        >
          ✓
        </button>
      </div>
    </div>
  );
}
