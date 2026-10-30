/**
 * Razorpay Standard Checkout: loads checkout.js once and opens the payment
 * window for an order the server created. Resolves with what the server needs
 * to verify the payment, or null when the payer closes the window.
 */
const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export interface CheckoutOptions {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
}

export interface CheckoutResult {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Razorpay. Check your internet connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export async function openRazorpayCheckout(options: CheckoutOptions): Promise<CheckoutResult | null> {
  await loadScript();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Could not load Razorpay. Try again.');
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: options.keyId,
      order_id: options.orderId,
      amount: options.amount,
      currency: options.currency,
      name: options.name,
      description: options.description,
      prefill: options.prefill,
      handler: (res: RazorpaySuccess) =>
        resolve({ razorpayOrderId: res.razorpay_order_id, razorpayPaymentId: res.razorpay_payment_id, razorpaySignature: res.razorpay_signature }),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', (res) => reject(new Error(res.error?.description || 'The payment failed. No money was taken; try again.')));
    rzp.open();
  });
}
