import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getPaystackSecretKey } from '@/lib/payments/paystack-server';

/**
 * Paystack Webhook Handler
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
  
  return hash === signature;
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
    
    // Get Paystack secret key for signature verification
    const secretKey = await getPaystackSecretKey();
    
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
          amount: amount / 100, // Convert from kobo to ZAR
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
          .select('id, customer_id, total_amount, ref_number')
          .eq('id', bookingId)
          .single();
        
        if (bookingError || !booking) {
          console.error('Paystack webhook: Booking not found', { bookingId, error: bookingError });
          return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
        }
        
        // Record payment in database
        const { data: payment, error: paymentError } = await supabase
          .from('booking_payments')
          .insert({
            booking_id: bookingId,
            amount: amount / 100, // Convert from kobo to ZAR
            payment_method: 'card', // Paystack supports multiple methods, default to card
            payment_provider: 'paystack',
            payment_provider_id: id, // Paystack transaction ID
            status: 'completed',
            notes: `Payment processed via Paystack. Ref: ${reference}`,
            metadata: {
              paystack_reference: reference,
              paystack_customer: customer,
              paystack_metadata: metadata,
            },
          })
          .select()
          .single();
        
        if (paymentError || !payment) {
          console.error('Paystack webhook: Failed to record payment', { 
            bookingId, 
            error: paymentError 
          });
          return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
        }
        
        console.log('Payment recorded successfully:', payment.id);

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
          await sendToUser(booking.customer_id, {
            title: 'Payment Confirmed',
            message: `Your payment of R${(amount / 100).toFixed(2)} has been received and confirmed.`,
            type: 'payment_received',
            bookingId: bookingId,
            url: `/account-settings/bookings/${bookingId}`,
            data: {
              type: 'payment_received',
              booking_id: bookingId,
              payment_id: payment.id,
              amount: amount / 100,
            },
          }, ['push']);
          
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
          .select('id, booking_id, booking:bookings(customer_id)')
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
            
            // Send refund notification
            try {
              const { sendToUser } = await import('@/lib/notifications/onesignal');
              const customerId = (originalPayment.booking as any)?.customer_id;
              
              if (customerId) {
                await sendToUser(customerId, {
                  title: 'Refund Processed',
                  message: `A refund of R${(amount / 100).toFixed(2)} has been processed to your original payment method.`,
                  type: 'refund_processed',
                  bookingId: originalPayment.booking_id,
                  url: `/account-settings/bookings/${originalPayment.booking_id}`,
                  data: {
                    type: 'refund_processed',
                    booking_id: originalPayment.booking_id,
                    refund_id: refund.id,
                    amount: amount / 100,
                  },
                }, ['push']);
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
    
    // Return 200 even on error to prevent Paystack from retrying
    // (we've already logged the error)
    return NextResponse.json(
      { received: true, error: error.message },
      { status: 200 }
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
