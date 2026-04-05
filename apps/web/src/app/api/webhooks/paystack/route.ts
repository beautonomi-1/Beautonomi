/**
 * @deprecated Use /api/payments/webhook instead.
 * This legacy endpoint is kept to avoid breaking existing Paystack dashboard
 * configurations. New integrations must use /api/payments/webhook.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getPaystackSecretKey } from '@/lib/payments/paystack-server';
import { resolveTenantFromRequest } from '@/lib/tenant/resolve-tenant-from-db';
import { resolveTenantIdForFinanceLedger } from '@/lib/finance/resolve-tenant-id-for-ledger';
import { getTenantRegionConfig } from '@/lib/regions/config';
import { formatCurrency } from '@/lib/locale/currency';
import { LAST_RESORT_CURRENCY } from '@/lib/regions/last-resort-currency';
import { syncBookingAfterPaystackSuccess } from '@/lib/bookings/sync-booking-after-paystack-success';

/**
 * Paystack Webhook Handler (LEGACY)
 * 
 * Handles Paystack webhook events for payment confirmations
 * Reference: https://paystack.com/docs/payments/webhooks/
 * 
 * IMPORTANT: Paystack uses HMAC SHA512 for webhook signature verification
 */

/**
 * Verify Paystack webhook signature
 * 
 * Algorithm: HMAC SHA512
 * Header: x-paystack-signature
 */
function verifyPaystackWebhook(
  payload: string,
  signature: string,
  secretKey: string
): boolean {
  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(payload)
    .digest('hex');
  
  const sigBuf = Buffer.from(signature, 'hex');
  const hashBuf = Buffer.from(hash, 'hex');
  if (sigBuf.length !== hashBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, hashBuf);
}

/**
 * POST /api/webhooks/paystack
 * 
 * Webhook endpoint for Paystack events
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body (important: must use raw body for signature verification)
    const body = await request.text();
    const signature = request.headers.get('x-paystack-signature');
    
    if (!signature) {
      console.error('Paystack webhook: Missing signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }
    
    // Host → tenant for webhook signing secret (must match the Paystack account used at init).
    const hostTenant = await resolveTenantFromRequest(request);
    const secretKey = await getPaystackSecretKey({ tenantId: hostTenant?.id ?? null });
    
    // Verify webhook signature
    const isValid = verifyPaystackWebhook(body, signature, secretKey);
    
    if (!isValid) {
      console.error('Paystack webhook: Invalid signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }
    
    // Parse event
    const event = JSON.parse(body);
    const supabase = getSupabaseAdmin();
    
    console.log('Paystack webhook event received:', event.event);
    
    // Handle different event types
    switch (event.event) {
      case 'charge.success': {
        // Payment successful
        const { reference, amount, customer, metadata, id } = event.data;
        
        console.log('Processing successful payment:', {
          reference,
          amount: amount / 100, // Paystack minor units → major (e.g. kobo → main currency)
          transactionId: id,
        });
        
        // Extract booking ID from reference or metadata
        const bookingId = reference.startsWith('booking_')
          ? reference.split('_')[1]
          : metadata?.booking_id;
        
        if (!bookingId) {
          console.error('Paystack webhook: No booking ID found in payment', { reference, metadata });
          return NextResponse.json({ error: 'No booking ID' }, { status: 400 });
        }
        
        // Get booking details
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('id, customer_id, total_amount, ref_number, tenant_id, status, cancelled_at')
          .eq('id', bookingId)
          .single();
        
        if (bookingError || !booking) {
          console.error('Paystack webhook: Booking not found', { bookingId, error: bookingError });
          return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }

        const bookingTenantId = (booking as { tenant_id?: string | null }).tenant_id ?? null;
        if (
          hostTenant?.id &&
          bookingTenantId &&
          hostTenant.id !== bookingTenantId
        ) {
          console.error('Paystack webhook: Host tenant does not match booking market', {
            bookingId,
            hostTenantId: hostTenant.id,
            bookingTenantId,
          });
          return NextResponse.json(
            { error: 'Tenant mismatch', code: 'TENANT_MISMATCH' },
            { status: 403 },
          );
        }

        const paystackTxId =
          id !== undefined && id !== null ? String(id) : null;
        if (paystackTxId) {
          const { data: existingPayment } = await supabase
            .from('booking_payments')
            .select('id')
            .eq('payment_provider', 'paystack')
            .eq('payment_provider_id', paystackTxId)
            .maybeSingle();
          if (existingPayment) {
            console.log('Paystack legacy webhook: duplicate charge.success, already recorded', {
              paystackTxId,
              bookingId,
            });
            return NextResponse.json({
              received: true,
              duplicate: true,
              event: event.event,
            });
          }
        }
        
        // Record payment in database
        const { data: payment, error: paymentError } = await supabase
          .from('booking_payments')
          .insert({
            booking_id: bookingId,
            ...(bookingTenantId ? { tenant_id: bookingTenantId } : {}),
            amount: amount / 100,
            payment_method: 'card', // Paystack supports multiple methods, default to card
            payment_provider: 'paystack',
            payment_provider_id: paystackTxId ?? String(id),
            status: 'completed',
            notes: `Payment processed via Paystack. Ref: ${reference}`,
            payment_provider_data: {
              paystack_reference: reference,
              paystack_customer: customer,
              paystack_metadata: metadata,
            },
          })
          .select()
          .single();
        
        if (paymentError) {
          if (paymentError.code === '23505') {
            console.log('Paystack legacy webhook: duplicate insert (unique index / race)', {
              paystackTxId,
              bookingId,
            });
            return NextResponse.json({
              received: true,
              duplicate: true,
              event: event.event,
            });
          }
          console.error('Paystack webhook: Failed to record payment', {
            bookingId,
            error: paymentError,
          });
          return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
        }
        if (!payment) {
          return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
        }
        
        console.log('Payment recorded successfully:', payment.id);

        if (!(booking as { cancelled_at?: string | null }).cancelled_at && (booking as { status?: string }).status !== 'cancelled') {
          await syncBookingAfterPaystackSuccess(supabase, bookingId, {
            paymentReference: reference,
            paymentProvider: "paystack",
          });
        }

        // If payment was from hold flow, mark hold as consumed (idempotent)
        const holdId = metadata?.hold_id;
        if (holdId) {
          const { error: holdUpdateError } = await supabase
            .from('booking_holds')
            .update({
              hold_status: 'consumed',
            })
            .eq('id', holdId)
            .eq('hold_status', 'active');
          if (holdUpdateError) {
            console.warn('Failed to update hold status (may already be consumed):', holdUpdateError);
          }
        }
        
        // Send confirmation notification via OneSignal
        try {
          const { sendToUser } = await import('@/lib/notifications/onesignal');
          const payCurrency =
            (bookingTenantId
              ? (await getTenantRegionConfig(bookingTenantId))?.defaultCurrency
              : null) ?? LAST_RESORT_CURRENCY;
          const amountMajor = amount / 100;
          await sendToUser(
            booking.customer_id,
            {
              title: 'Payment Confirmed',
              message: `Your payment of ${formatCurrency(amountMajor, payCurrency)} has been received and confirmed.`,
              type: 'payment_received',
              bookingId: bookingId,
              url: `/account-settings/bookings/${bookingId}`,
              data: {
                type: 'payment_received',
                booking_id: bookingId,
                payment_id: payment.id,
                amount: amount / 100,
              },
            },
            ['push'],
            { appType: 'customer' }
          );
          
          console.log('OneSignal notification sent to customer:', booking.customer_id);
        } catch (notifError) {
          console.warn('Failed to send OneSignal notification:', notifError);
          // Don't fail the webhook if notification fails
        }
        
        break;
      }
      
      case 'transfer.success': {
        // Transfer successful (for refunds or payouts)
        console.log('Transfer successful:', event.data);
        // Handle transfer success if needed
        break;
      }
      
      case 'transfer.failed': {
        // Transfer failed
        console.error('Transfer failed:', event.data);
        // Handle transfer failure if needed
        break;
      }
      
      case 'refund.processed': {
        // Refund processed
        const { transaction, amount, id } = event.data;
        
        console.log('Processing refund:', {
          transaction,
          amount: amount / 100,
          refundId: id,
        });
        
        // Find the original payment by Paystack transaction ID
        const { data: originalPayment } = await supabase
          .from('booking_payments')
          .select('id, booking_id, booking:bookings(customer_id, tenant_id, provider_id)')
          .eq('payment_provider_id', transaction)
          .single();
        
        if (originalPayment) {
          // Record refund
          const { data: refund, error: refundError } = await supabase
            .from('booking_refunds')
            .insert({
              booking_id: originalPayment.booking_id,
              payment_id: originalPayment.id,
              amount: amount / 100,
              reason: 'Processed via Paystack',
              refund_method: 'original',
              refund_provider: 'paystack',
              refund_provider_id: id,
              status: 'completed',
              notes: `Refund processed by Paystack. Transaction: ${transaction}`,
            })
            .select()
            .single();
          
          if (!refundError && refund) {
            console.log('Refund recorded successfully:', refund.id);

            const bookingForRefund = originalPayment.booking as {
              tenant_id?: string | null;
              provider_id?: string | null;
              customer_id?: string | null;
            } | null;

            try {
              const refundAmt = amount / 100;
              const psRefundTenantId = await resolveTenantIdForFinanceLedger(supabase, {
                tenant_id: bookingForRefund?.tenant_id,
                provider_id: bookingForRefund?.provider_id ?? null,
              });
              const { error: psFinanceErr } = await supabase.from('finance_transactions').insert({
                tenant_id: psRefundTenantId,
                booking_id: originalPayment.booking_id,
                provider_id: bookingForRefund?.provider_id ?? null,
                transaction_type: 'refund',
                amount: -refundAmt,
                fees: 0,
                commission: 0,
                net: -refundAmt,
                description: `Paystack refund (${id})`,
                created_at: new Date().toISOString(),
              });
              if (psFinanceErr) {
                console.error('Paystack webhook: finance ledger insert after booking_refund:', psFinanceErr);
              }
            } catch (ledgerErr) {
              console.error('Paystack webhook: finance ledger resolution failed:', ledgerErr);
            }
            
            // Send refund notification
            try {
              const { sendToUser } = await import('@/lib/notifications/onesignal');
              const customerId = bookingForRefund?.customer_id ?? null;

              if (customerId) {
                const refundTenantId = bookingForRefund?.tenant_id ?? null;
                const refundCurrency =
                  (refundTenantId
                    ? (await getTenantRegionConfig(refundTenantId))?.defaultCurrency
                    : null) ?? LAST_RESORT_CURRENCY;
                const refundMajor = amount / 100;
                await sendToUser(
                  customerId,
                  {
                    title: 'Refund Processed',
                    message: `A refund of ${formatCurrency(refundMajor, refundCurrency)} has been processed to your original payment method.`,
                    type: 'refund_processed',
                    bookingId: originalPayment.booking_id,
                    url: `/account-settings/bookings/${originalPayment.booking_id}`,
                    data: {
                      type: 'refund_processed',
                      booking_id: originalPayment.booking_id,
                      refund_id: refund.id,
                      amount: amount / 100,
                    },
                  },
                  ['push'],
                  { appType: 'customer' }
                );
              }
            } catch (notifError) {
              console.warn('Failed to send refund notification:', notifError);
            }
          } else {
            console.error('Failed to record refund:', refundError);
          }
        }
        
        break;
      }
      
      default:
        console.log('Unhandled Paystack event:', event.event);
    }
    
    // Always return 200 OK to acknowledge webhook receipt
    // Paystack retries webhooks if not acknowledged
    return NextResponse.json({ received: true, event: event.event });
    
  } catch (error: any) {
    console.error('Paystack webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/paystack
 * 
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    service: 'Paystack Webhook Handler',
    status: 'online',
    timestamp: new Date().toISOString(),
  });
}
