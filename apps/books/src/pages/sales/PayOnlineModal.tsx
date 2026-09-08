import { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

import { razorpayApi } from '@/api/razorpay';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, parseNumber, round2 } from '@/utils/format';

interface PayOnlineModalProps {
  open: boolean;
  onClose: () => void;
  invoice: {
    id: string;
    invoiceNumber: string;
    customerName: string;
    total: number;
    balanceDue: number;
  };
  onPaymentSuccess: () => void;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PayOnlineModal({ open, onClose, invoice, onPaymentSuccess }: PayOnlineModalProps) {
  const toast = useToast();
  const { organization } = useAuth();
  const [amount, setAmount] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(String(invoice.balanceDue));
      setErrorMessage(null);
      setSubmitting(false);
    }
  }, [open, invoice.balanceDue]);

  const handlePay = async () => {
    setErrorMessage(null);
    const numAmount = round2(parseNumber(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Please enter a valid payment amount greater than zero.');
      return;
    }
    if (numAmount > invoice.balanceDue) {
      setErrorMessage(`Amount cannot exceed the remaining balance due (${formatCurrency(invoice.balanceDue)}).`);
      return;
    }

    setSubmitting(true);

    try {
      // 1. Ensure Razorpay checkout.js is available
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay checkout SDK. Please check your internet connection.');
      }

      // 2. Create Razorpay order via backend
      const order = await razorpayApi.createOrder(invoice.id, numAmount);

      // 3. Configure Razorpay Standard Checkout options
      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: organization?.name ?? 'Rooman Books',
        description: `Payment for Invoice ${invoice.invoiceNumber}`,
        order_id: order.order_id,
        prefill: {
          name: order.customer_name,
          email: order.customer_email,
          contact: order.customer_phone,
        },
        theme: {
          color: '#2563eb',
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            toast.notify('Verifying payment signature with server...');
            const verification = await razorpayApi.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              invoice_id: invoice.id,
              amount: numAmount,
            });

            if (verification.success) {
              toast.success(`Payment of ${formatCurrency(numAmount)} received successfully!`);
              onPaymentSuccess();
              onClose();
            } else {
              toast.error(verification.message || 'Payment verification failed.');
            }
          } catch (err: unknown) {
            const msg = (err as Error)?.message ?? 'Verification error occurred';
            toast.error(`Verification error: ${msg}`);
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
            toast.notify('Payment checkout dismissed');
          },
        },
      };

      const razorpayInstance = new (window as unknown as {
        Razorpay: new (opts: typeof options) => {
          open: () => void;
          on: (event: string, handler: (resp: unknown) => void) => void;
        };
      }).Razorpay(options);

      razorpayInstance.on('payment.failed', (resp: unknown) => {
        setSubmitting(false);
        const description = (resp as { error?: { description?: string } })?.error?.description;
        toast.error(`Payment failed: ${description || 'Transaction declined.'}`);
      });

      razorpayInstance.open();
    } catch (err: unknown) {
      setSubmitting(false);
      setErrorMessage((err as Error)?.message ?? 'Failed to initiate payment.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Pay Online via Razorpay"
      subtitle={`Secure online payment gateway for Invoice ${invoice.invoiceNumber}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Lock size={14} />} onClick={handlePay} disabled={submitting}>
            {submitting ? 'Connecting...' : `Pay ${amount ? formatCurrency(parseNumber(amount) || 0) : ''}`}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: '1.25rem' }}>
        <FormError message={errorMessage} />

        <div
          style={{
            background: 'var(--bg-subtle, #f8fafc)',
            border: '1px solid var(--border-color, #e2e8f0)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.75rem',
          }}
        >
          <div>
            <span className="text-muted small" style={{ display: 'block' }}>
              Invoice Total
            </span>
            <span className="strong" style={{ fontSize: '1.1rem' }}>
              {formatCurrency(invoice.total)}
            </span>
          </div>
          <div>
            <span className="text-muted small" style={{ display: 'block' }}>
              Balance Due
            </span>
            <span className="strong" style={{ fontSize: '1.1rem', color: '#dc2626' }}>
              {formatCurrency(invoice.balanceDue)}
            </span>
          </div>
          <div>
            <span className="text-muted small" style={{ display: 'block' }}>
              Customer
            </span>
            <span>{invoice.customerName}</span>
          </div>
          <div>
            <span className="text-muted small" style={{ display: 'block' }}>
              Accepted Methods
            </span>
            <span className="small text-muted">UPI, Cards, NetBanking, Wallets</span>
          </div>
        </div>

        <TextField
          label="Payment Amount (INR)"
          type="number"
          step="0.01"
          min="1"
          max={invoice.balanceDue}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={`Defaults to remaining balance (${formatCurrency(invoice.balanceDue)}). Partial payments supported.`}
          required
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.825rem',
            color: 'var(--text-muted, #64748b)',
            background: 'rgba(37, 99, 235, 0.05)',
            padding: '0.625rem 0.875rem',
            borderRadius: '6px',
            border: '1px solid rgba(37, 99, 235, 0.15)',
          }}
        >
          <ShieldCheck size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
          <span>Protected by 256-bit SSL encryption. All transactions verified via HMAC-SHA256 signature.</span>
        </div>
      </div>
    </Modal>
  );
}
