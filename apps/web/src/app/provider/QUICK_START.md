# Provider Portal - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- Supabase project configured
- Environment variables set

### Installation
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

### Access the Portal
Navigate to: `http://localhost:3000/provider/dashboard`

---

## 📋 Common Tasks

### Adding a New Service
1. Navigate to: `/provider/catalogue/services`
2. Click "Add Service"
3. Fill in service details
4. Configure pricing options
5. Set up advanced pricing rules (optional)
6. Save

### Managing Team Members
1. Navigate to: `/provider/team/members`
2. Click "Add Team Member"
3. Fill in member details
4. Configure permissions and settings
5. Send invitation

### Viewing Reports
1. Navigate to: `/provider/reports`
2. Select report type
3. Configure filters
4. View/download report

### Setting Up Advanced Pricing
1. Navigate to: `/provider/catalogue/services`
2. Edit a service
3. Click "Advanced pricing options"
4. Add pricing rules:
   - Time-based (peak hours, weekends)
   - Client type (new, returning, VIP)
   - Seasonal (date ranges)
5. Save rules

---

## 🔧 Common Code Patterns

### Making API Calls
```typescript
import { providerApi } from "@/lib/provider-portal/api";

// List items
const items = await providerApi.listServices();

// Create item
const newItem = await providerApi.createService(data);

// Update item
await providerApi.updateService(id, updates);

// Delete item
await providerApi.deleteService(id);
```

### Error Handling
```typescript
import { handleError, withRetry } from "@/lib/provider-portal/error-handler";

try {
  const data = await withRetry(
    () => fetcher.get("/api/provider/data"),
    { maxRetries: 3 }
  );
} catch (error) {
  handleError(error, {
    action: "loadData",
    resource: "data",
  });
}
```

### Feature Flags
```typescript
import { isFeatureEnabled } from "@/lib/provider-portal/feature-flags";

const isEnabled = await isFeatureEnabled("feature_key");
if (isEnabled) {
  // Show feature
}
```

---

## 🎨 Component Usage

### Page Structure
```typescript
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";

export default function MyPage() {
  return (
    <div>
      <PageHeader
        title="Page Title"
        subtitle="Page description"
      />
      <SectionCard>
        {/* Content */}
      </SectionCard>
    </div>
  );
}
```

### Forms
```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Use shadcn/ui components
// Include validation
// Handle errors properly
```

---

## 🐛 Troubleshooting

### API Errors
- Check authentication
- Verify endpoint exists
- Check error handler logs
- Verify network connectivity

### Feature Not Working
- Check feature flag status
- Verify permissions
- Check console for errors
- Verify API response

### Forms Not Submitting
- Check validation
- Verify required fields
- Check error messages
- Verify API endpoint

---

## 📞 Support

For issues or questions:
1. Check documentation
2. Review error logs
3. Check feature flags
4. Contact development team

---

**Quick Reference:** See `README.md` for detailed documentation.
