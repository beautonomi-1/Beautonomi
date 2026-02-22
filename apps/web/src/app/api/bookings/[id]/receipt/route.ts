import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/auth-server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getSupabaseServer();
    const { user } = await requireRole(["customer", "provider_owner", "provider_staff"]);

    // Get booking with all related data
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:users!bookings_customer_id_fkey(id, email, full_name, phone),
        provider:providers!bookings_provider_id_fkey(
          id,
          business_name,
          owner_email,
          phone,
          address
        ),
        booking_services:booking_services(
          id,
          offering_id,
          duration_minutes,
          price,
          currency,
          offerings:offerings!booking_services_offering_id_fkey(id, title, price, duration_minutes)
        ),
        booking_products:booking_products(
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products:products!booking_products_product_id_fkey(
            id,
            name,
            retail_price
          )
        ),
        payment_transactions:payment_transactions(
          id,
          amount,
          transaction_type,
          status,
          created_at
        )
      `)
      .eq("id", params.id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Verify access
    const isCustomer = user.role === "customer" && booking.customer_id === user.id;
    const isProvider =
      (user.role === "provider_owner" || user.role === "provider_staff") &&
      booking.provider_id === user.id;

    if (!isCustomer && !isProvider) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Calculate totals (booking_services stores price per service line, no quantity)
    const servicesTotal =
      booking.booking_services?.reduce(
        (sum: number, bs: any) => sum + Number(bs.price || 0),
        0
      ) || 0;

    const productsTotal =
      booking.booking_products?.reduce(
        (sum: number, bp: any) => sum + Number(bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1)),
        0
      ) || 0;

    const subtotal = servicesTotal + productsTotal;
    const tax = booking.tax_amount || 0;
    const fees = booking.service_fee_amount || 0;
    const discount = booking.discount_amount || 0;
    const total = subtotal + tax + fees - discount;

    const receipt = {
      booking_number: booking.booking_number,
      booking_date: booking.created_at,
      service_date: booking.scheduled_at,
      customer: booking.customer,
      provider: booking.provider,
      services: booking.booking_services?.map((bs: any) => ({
        name: bs.offerings?.title || "Service",
        quantity: 1,
        price: bs.price || bs.offerings?.price || 0,
        total: bs.price || bs.offerings?.price || 0,
      })) || [],
      products: booking.booking_products?.map((bp: any) => ({
        name: bp.products?.name || "Product",
        quantity: bp.quantity || 1,
        price: bp.unit_price || bp.products?.retail_price || 0,
        total: bp.total_price || (bp.unit_price || bp.products?.retail_price || 0) * (bp.quantity || 1),
      })) || [],
      subtotal,
      tax,
      fees,
      discount,
      total,
      payment_status: booking.payment_status,
      transactions: booking.payment_transactions || [],
    };

    return NextResponse.json({ receipt });
  } catch (error: any) {
    console.error("Error generating receipt:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate receipt" },
      { status: 500 }
    );
  }
}
