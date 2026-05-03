/**
 * Safely evaluates a math expression with basic operators: +, -, *, /, %
 * Only allows digits, decimals, and operators.
 * Returns the calculated number or null if invalid.
 */
export function safeEvaluate(expression: string): number | null {
  // Only allow numbers, dots, and +, -, *, /, %, (, )
  const regex = /^[0-9.+\-*/%()\s]+$/;
  if (!regex.test(expression)) return null;

  try {
    // We can use Function constructor as a safer alternative to eval, 
    // although still cautious. Since we've strictly regex-checked, it's safer.
    // However, to be even safer, we can do a basic recursive descent or use a library, 
    // but for simple arithmetic, a well-regexed Function is standard.
    // Replace % with /100* for percentage or leave as modulo? 
    // User examples: 50%10 -> 5. This implies modulo.
    
    // Convert expression to a valid JS evaluation
    // Remove any trailing operators that might cause syntax error during typing
    const cleanExpr = expression.trim().replace(/[+\-*/%]$/, '');
    if (!cleanExpr) return 0;
    
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${cleanExpr})`)();
    
    if (typeof result === 'number' && isFinite(result)) {
      // Limit to 3 decimal places as requested
      return Math.round(result * 1000) / 1000;
    }
    return null;
  } catch {
    return null;
  }
}
