import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/provider/sales
 * 
 * List sales for provider
 */
export async function GET(request: NextRequest) {
  try {
    // Check permission to view sales
    const permissionCheck = await requirePermission('view_sales', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const locationId = searchParams.get('location_id');

    // Build query (simplified to avoid nested join issues)
    let salesQuery = supabaseAdmin
      .from('sales')
      .select(`
        id,
        sale_number,
        ref_number,
        sale_date,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_method,
        payment_status,
        notes,
        created_at,
        customer_id,
        staff_id,
        location_id
      `, { count: 'exact' })
      .eq('provider_id', providerId)
      .order('sale_date', { ascending: false });

    // Apply location filter
    if (locationId) {
      salesQuery = salesQuery.eq('location_id', locationId);
    }
    
    // Apply date filters
    if (dateFrom) {
      salesQuery = salesQuery.gte('sale_date', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      salesQuery = salesQuery.lte('sale_date', `${dateTo}T23:59:59`);
    }

    // Apply pagination
    salesQuery = salesQuery.range(offset, offset + limit - 1);

    const { data: sales, error: salesError, count } = await salesQuery;

    if (salesError) {
      console.error("Error fetching sales:", salesError);
      throw salesError;
    }

    // Get related data separately to avoid nested join issues
    const saleIds = (sales || []).map(s => s.id);
    const customerIds = new Set<string>();
    const staffIds = new Set<string>();
    const locationIds = new Set<string>();

    (sales || []).forEach((sale: any) => {
      if (sale.customer_id) customerIds.add(sale.customer_id);
      if (sale.staff_id) staffIds.add(sale.staff_id);
      if (sale.location_id) locationIds.add(sale.location_id);
    });

    // Fetch customers
    const customerMap = new Map<string, { full_name: string; email: string }>();
    if (customerIds.size > 0) {
      const { data: customers, error: customerError } = await supabaseAdmin
        .from('users')
        .select('id, full_name, email')
        .in('id', Array.from(customerIds));

      if (customerError) {
        console.warn("Error fetching customers:", customerError);
      } else {
        customers?.forEach((customer: any) => {
          customerMap.set(customer.id, {
            full_name: customer.full_name || "Unknown",
            email: customer.email || "",
          });
        });
      }
    }

    // Fetch staff
    const staffMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staffMembers, error: staffError } = await supabaseAdmin
        .from('provider_staff')
        .select('id, name')
        .in('id', Array.from(staffIds));

      if (staffError) {
        console.warn("Error fetching staff:", staffError);
      } else {
        staffMembers?.forEach((staff: any) => {
          staffMap.set(staff.id, staff.name || "Unknown");
        });
      }
    }

    // Fetch locations
    const locationMap = new Map<string, string>();
    if (locationIds.size > 0) {
      const { data: locations, error: locationError } = await supabaseAdmin
        .from('provider_locations')
        .select('id, name')
        .in('id', Array.from(locationIds));

      if (locationError) {
        console.warn("Error fetching locations:", locationError);
      } else {
        locations?.forEach((location: any) => {
          locationMap.set(location.id, location.name || "Unknown");
        });
      }
    }

    // Get sale items for each sale
    const itemsMap = new Map();
    
    if (saleIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('sale_items')
        .select('*')
        .in('sale_id', saleIds);

      // Group items by sale_id
      (items || []).forEach((item: any) => {
        if (!itemsMap.has(item.sale_id)) {
          itemsMap.set(item.sale_id, []);
        }
        itemsMap.get(item.sale_id).push({
          id: item.id,
          type: item.item_type,
          name: item.item_name,
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          total: Number(item.total_price),
        });
      });
    }

    // Transform to Sale format
    const transformedSales = (sales || []).map((sale: any) => {
      const customerInfo = sale.customer_id ? customerMap.get(sale.customer_id) : null;
      const staffName = sale.staff_id ? staffMap.get(sale.staff_id) : null;
      
      return {
        id: sale.id,
        ref_number: sale.ref_number || sale.sale_number,
        client_name: customerInfo?.full_name || null,
        date: sale.sale_date,
        items: itemsMap.get(sale.id) || [],
        subtotal: Number(sale.subtotal || 0),
        tax: Number(sale.tax_amount || 0),
        total: Number(sale.total_amount || 0),
        payment_method: sale.payment_method || 'cash',
        team_member_id: sale.staff_id || null,
        team_member_name: staffName || null,
      };
    });

    // Apply search filter if provided
    let filteredSales = transformedSales;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredSales = transformedSales.filter(s => 
        s.ref_number.toLowerCase().includes(searchLower) ||
        s.client_name?.toLowerCase().includes(searchLower)
      );
    }

    const totalPages = count ? Math.ceil(count / limit) : 1;

    return successResponse({
      data: filteredSales,
      total: count || filteredSales.length,
      page,
      limit,
      total_pages: totalPages,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch sales");
  }
}

/**
 * POST /api/provider/sales
 * 
 * Create a new sale
 */
export async function POST(request: NextRequest) {
  try {
    // Check permission to create sales
    const permissionCheck = await requirePermission('create_sales', request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }

    const body = await request.json();
    const {
      location_id,
      customer_id,
      staff_id,
      sale_date,
      items,
      subtotal,
      tax_rate,
      tax_amount,
      discount_amount,
      total_amount,
      payment_method,
      payment_status,
      payment_reference,
      service_location_type,
      house_call_address,
      notes,
    } = body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return handleApiError(
        new Error('At least one item is required'),
        'VALIDATION_ERROR',
        400
      );
    }

    if (total_amount === undefined || total_amount === null) {
      return handleApiError(
        new Error('Total amount is required'),
        'VALIDATION_ERROR',
        400
      );
    }

    // Calculate totals if not provided
    const calculatedSubtotal = subtotal || items.reduce((sum: number, item: any) => 
      sum + (item.unit_price || 0) * (item.quantity || 1), 0
    );
    const calculatedTax = tax_amount || (calculatedSubtotal * (tax_rate || 0));
    const calculatedTotal = total_amount || (calculatedSubtotal + calculatedTax - (discount_amount || 0));

    // Create sale
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        provider_id: providerId,
        location_id: location_id || null,
        customer_id: customer_id || null,
        staff_id: staff_id || null,
        sale_date: sale_date || new Date().toISOString(),
        subtotal: calculatedSubtotal,
        tax_rate: tax_rate || 0,
        tax_amount: calculatedTax,
        discount_amount: discount_amount || 0,
        total_amount: calculatedTotal,
        payment_method: payment_method || 'cash',
        payment_status: payment_status || 'completed',
        notes: payment_reference 
          ? `${notes || ''}\nPayment Reference: ${payment_reference}`.trim() 
          : service_location_type === 'house-call' && house_call_address
          ? `${notes || ''}\nHouse Call Address: ${house_call_address.address_line1}, ${house_call_address.city}${house_call_address.postal_code ? `, ${house_call_address.postal_code}` : ''}`.trim()
          : (notes || null),
        created_by: user.id,
      })
      .select()
      .single();

    if (saleError) {
      throw saleError;
    }

    // Create sale items
    const saleItems = items.map((item: any) => ({
      sale_id: sale.id,
      item_type: item.type || 'product',
      item_id: item.item_id || null,
      item_name: item.name,
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      total_price: (item.unit_price || 0) * (item.quantity || 1),
    }));

    const { error: itemsError } = await supabase
      .from('sale_items')
      .insert(saleItems);

    if (itemsError) {
      // Rollback sale creation
      await supabase.from('sales').delete().eq('id', sale.id);
      throw itemsError;
    }

    // Fetch complete sale with items (simplified query)
    const { data: fetchedSaleItems } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id);

    // Get customer and staff info separately
    let clientName = null;
    let staffName = null;

    if (sale.customer_id) {
      const { data: customer } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', sale.customer_id)
        .single();
      clientName = customer?.full_name || null;
    }

    if (sale.staff_id) {
      const { data: staff } = await supabase
        .from('provider_staff')
        .select('name')
        .eq('id', sale.staff_id)
        .single();
      staffName = staff?.name || null;
    }

    return successResponse({
      id: sale.id,
      ref_number: sale.ref_number || sale.sale_number,
      client_name: clientName,
      date: sale.sale_date,
      items: (fetchedSaleItems || []).map((item: any) => ({
        id: item.id,
        type: item.item_type,
        name: item.item_name,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        total: Number(item.total_price),
      })),
      subtotal: Number(sale.subtotal),
      tax: Number(sale.tax_amount),
      total: Number(sale.total_amount),
      payment_method: sale.payment_method,
      team_member_id: sale.staff_id || null,
      team_member_name: staffName,
    });
  } catch (error) {
    return handleApiError(error, "Failed to create sale");
  }
}
