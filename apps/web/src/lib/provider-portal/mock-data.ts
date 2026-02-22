/**
 * Mock Data for Provider Portal
 * Seeded fake data for UI development
 */

import type {
  Provider,
  Salon,
  TeamMember,
  ServiceCategory,
  ProductItem,
  Appointment,
  Sale,
  PaymentTransaction,
  Shift,
  Campaign,
  Automation,
  DashboardMetrics,
  YocoDevice,
  YocoPayment,
  YocoIntegration,
} from "./types";

export const mockProvider: Provider = {
  id: "provider-1",
  business_name: "Glamour Salon",
  owner_name: "Sarah Johnson",
  email: "sarah@glamoursalon.com",
  phone: "+27 11 123 4567",
  setup_completion: 75,
  selected_location_id: "location-1",
};

export const mockSalons: Salon[] = [
  {
    id: "location-1",
    name: "Main Branch",
    address: "123 Main Street",
    city: "Johannesburg",
    is_primary: true,
  },
  {
    id: "location-2",
    name: "Sandton Branch",
    address: "456 Sandton Drive",
    city: "Sandton",
    is_primary: false,
  },
];

export const mockTeamMembers: TeamMember[] = [
  {
    id: "team-1",
    name: "Joe Doe",
    email: "joe@glamoursalon.com",
    mobile: "+27 82 111 2222",
    role: "employee",
    rating: 4.8,
    is_active: true,
  },
  {
    id: "team-2",
    name: "Sarah Lance",
    email: "sarah.lance@glamoursalon.com",
    mobile: "+27 82 333 4444",
    role: "manager",
    rating: 4.9,
    is_active: true,
  },
  {
    id: "team-3",
    name: "Mike Smith",
    email: "mike@glamoursalon.com",
    mobile: "+27 82 555 6666",
    role: "employee",
    rating: 4.7,
    is_active: true,
  },
];

export const mockServiceCategories: ServiceCategory[] = [
  {
    id: "cat-1",
    name: "Nails",
    order: 1,
    services: [
      {
        id: "svc-1",
        name: "Manicure",
        category_id: "cat-1",
        duration_minutes: 30,
        price: 150,
        is_active: true,
        order: 1,
      },
      {
        id: "svc-2",
        name: "Pedicure",
        category_id: "cat-1",
        duration_minutes: 45,
        price: 200,
        is_active: true,
        order: 2,
      },
    ],
  },
  {
    id: "cat-2",
    name: "Hair & Styling",
    order: 2,
    services: [
      {
        id: "svc-3",
        name: "Haircut",
        category_id: "cat-2",
        duration_minutes: 60,
        price: 300,
        is_active: true,
        order: 1,
      },
      {
        id: "svc-4",
        name: "Hair Color",
        category_id: "cat-2",
        duration_minutes: 120,
        price: 800,
        is_active: true,
        order: 2,
      },
    ],
  },
];

export const mockProducts: ProductItem[] = [
  {
    id: "prod-1",
    name: "Hair Shampoo",
    barcode: "1234567890123",
    sku: "HS-001",
    category: "Hair Care",
    supplier: "Beauty Supplies Co",
    quantity: 50,
    retail_price: 89.99,
  },
  {
    id: "prod-2",
    name: "Nail Polish - Red",
    barcode: "1234567890124",
    sku: "NP-RED-001",
    category: "Nail Care",
    supplier: "Nail Art Inc",
    quantity: 25,
    retail_price: 45.00,
  },
];

const generateAppointments = (): Appointment[] => {
  const today = new Date();
  const appointments: Appointment[] = [];
  
  for (let i = 0; i < 20; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + Math.floor(Math.random() * 14) - 7);
    const hour = 9 + Math.floor(Math.random() * 8);
    const minutes = [0, 15, 30, 45][Math.floor(Math.random() * 4)];
    
    appointments.push({
      id: `apt-${i + 1}`,
      ref_number: `APT${String(i + 1).padStart(4, "0")}`,
      client_name: `Client ${i + 1}`,
      client_email: `client${i + 1}@example.com`,
      client_phone: `+27 82 ${Math.floor(Math.random() * 9000000) + 1000000}`,
      service_id: `svc-${(i % 4) + 1}`,
      service_name: mockServiceCategories.flatMap(c => c.services)[i % 4]?.name || "Service",
      team_member_id: mockTeamMembers[i % 3].id,
      team_member_name: mockTeamMembers[i % 3].name,
      scheduled_date: date.toISOString().split("T")[0],
      scheduled_time: `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      duration_minutes: [30, 45, 60, 90, 120][Math.floor(Math.random() * 5)],
      price: [150, 200, 300, 500, 800][Math.floor(Math.random() * 5)],
      status: (["booked", "started", "completed", "cancelled"] as const)[Math.floor(Math.random() * 4)],
      created_by: "owner",
      created_date: new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  
  return appointments.sort((a, b) => 
    new Date(`${a.scheduled_date}T${a.scheduled_time}`).getTime() - 
    new Date(`${b.scheduled_date}T${b.scheduled_time}`).getTime()
  );
};

export const mockAppointments = generateAppointments();

export const mockSales: Sale[] = [
  {
    id: "sale-1",
    ref_number: "SALE001",
    client_name: "Client 1",
    date: new Date().toISOString().split("T")[0],
    items: [
      { id: "item-1", type: "service", name: "Manicure", quantity: 1, unit_price: 150, total: 150 },
      { id: "item-2", type: "product", name: "Nail Polish", quantity: 1, unit_price: 45, total: 45 },
    ],
    subtotal: 195,
    tax: 28.5,
    total: 223.5,
    payment_method: "card",
    team_member_id: "team-1",
    team_member_name: "Joe Doe",
  },
];

export const mockPayments: PaymentTransaction[] = mockAppointments
  .filter(a => a.status === "completed")
  .map((apt, i) => ({
    id: `pay-${i + 1}`,
    ref_number: `PAY${String(i + 1).padStart(4, "0")}`,
    payment_date: apt.scheduled_date,
    appointment_id: apt.id,
    appointment_duration: apt.duration_minutes,
    team_member_id: apt.team_member_id,
    team_member_name: apt.team_member_name,
    method: (["cash", "card", "mobile", "gift_card"] as const)[Math.floor(Math.random() * 4)],
    amount: apt.price,
    status: "completed" as const,
  }));

export const mockShifts: Shift[] = [
  {
    id: "shift-1",
    team_member_id: "team-1",
    team_member_name: "Joe Doe",
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "17:00",
  },
  {
    id: "shift-2",
    team_member_id: "team-2",
    team_member_name: "Sarah Lance",
    date: new Date().toISOString().split("T")[0],
    start_time: "10:00",
    end_time: "18:00",
  },
];

export const mockCampaigns: Campaign[] = [
  {
    id: "camp-1",
    name: "Summer Special",
    type: "blast",
    status: "active",
    created_date: new Date().toISOString(),
    sent_count: 500,
    open_count: 120,
  },
];

export const mockAutomations: Automation[] = [
  {
    id: "auto-1",
    name: "24h Upcoming Reminder",
    type: "reminder",
    trigger: "24h before",
    is_active: true,
    description: "Send reminder 24 hours before appointment",
  },
  {
    id: "auto-2",
    name: "1h Reminder",
    type: "reminder",
    trigger: "1h before",
    is_active: true,
    description: "Send reminder 1 hour before appointment",
  },
];

export const mockDashboardMetrics: DashboardMetrics = {
  earnings: 125000,
  earnings_this_month: 45000,
  sales: 342,
  sales_delta: 12.5,
  today_appointments: 8,
  weekly_appointments: 45,
  monthly_earnings_data: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    amount: Math.floor(Math.random() * 5000) + 1000,
  })),
  upcoming_appointments_data: Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    count: Math.floor(Math.random() * 10) + 1,
  })),
  top_services: [
    { service_name: "Haircut", count: 45, revenue: 13500 },
    { service_name: "Manicure", count: 38, revenue: 5700 },
    { service_name: "Hair Color", count: 22, revenue: 17600 },
  ],
  top_team_members: [
    { name: "Sarah Lance", appointments: 65, revenue: 19500 },
    { name: "Joe Doe", appointments: 52, revenue: 15600 },
    { name: "Mike Smith", appointments: 48, revenue: 14400 },
  ],
  recent_activity: mockAppointments.slice(0, 5),
};

export const mockYocoDevices: YocoDevice[] = [
  {
    id: "yoco-device-1",
    name: "Main Counter Terminal",
    device_id: "webpos-device-abc123",
    location_id: "location-1",
    location_name: "Main Branch",
    is_active: true,
    created_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_used: new Date().toISOString(),
    total_transactions: 245,
    total_amount: 125000,
  },
  {
    id: "yoco-device-2",
    name: "Reception Terminal",
    device_id: "webpos-device-xyz789",
    location_id: "location-1",
    location_name: "Main Branch",
    is_active: true,
    created_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    last_used: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    total_transactions: 89,
    total_amount: 45000,
  },
  {
    id: "yoco-device-3",
    name: "Sandton Terminal",
    device_id: "webpos-device-def456",
    location_id: "location-2",
    location_name: "Sandton Branch",
    is_active: false,
    created_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    total_transactions: 12,
    total_amount: 6000,
  },
];

export const mockYocoPayments: YocoPayment[] = [
  {
    id: "yoco-pay-1",
    yoco_payment_id: "ch_abc123xyz",
    device_id: "yoco-device-1",
    device_name: "Main Counter Terminal",
    amount: 15000, // R150.00 in cents
    currency: "ZAR",
    status: "successful",
    payment_date: new Date().toISOString(),
    appointment_id: "apt-1",
    metadata: { appointment_ref: "APT0001" },
  },
  {
    id: "yoco-pay-2",
    yoco_payment_id: "ch_def456uvw",
    device_id: "yoco-device-1",
    device_name: "Main Counter Terminal",
    amount: 30000, // R300.00 in cents
    currency: "ZAR",
    status: "successful",
    payment_date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    appointment_id: "apt-2",
    metadata: { appointment_ref: "APT0002" },
  },
  {
    id: "yoco-pay-3",
    yoco_payment_id: "ch_ghi789rst",
    device_id: "yoco-device-2",
    device_name: "Reception Terminal",
    amount: 20000, // R200.00 in cents
    currency: "ZAR",
    status: "pending",
    payment_date: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    sale_id: "sale-1",
    metadata: { sale_ref: "SALE001" },
  },
];

export const mockYocoIntegration: YocoIntegration = {
  is_enabled: true,
  connected_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  last_sync: new Date().toISOString(),
};
