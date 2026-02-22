# Scheduling: Time Blocks vs Availability Blocks

## `time_blocks`
Provider-defined working hours and breaks for each day of the week.
- Represents the **template** (recurring schedule)
- Fields: provider_id, location_id, day_of_week, start_time, end_time, block_type (working/break)

## `availability_blocks`  
Specific date overrides to the template schedule.
- Represents **exceptions** (holidays, special hours, blocked time)
- Fields: provider_id, staff_id, date, start_time, end_time, is_available, reason

## How Availability is Calculated

1. Start with `time_blocks` for the day-of-week template
2. Apply `availability_blocks` overrides for specific dates
3. Subtract existing bookings from available slots
4. Return remaining slots to the customer
