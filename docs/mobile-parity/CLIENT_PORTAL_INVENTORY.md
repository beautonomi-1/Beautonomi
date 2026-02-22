# Client Portal Inventory (apps/web)

Source of truth for customer-facing routes in the Next.js client portal. Used for mobile parity planning.

## Navigation Structure (Web Mobile View)

**Bottom Nav (authenticated):** Home | Explore | Bookings | Chats | Profile  
**Bottom Nav (guest):** Home | Explore | Wishlists | Log in

---

## Routes Inventory

### Home
| Field | Value |
|-------|-------|
| **Route** | `/` |
| **Screen** | Home |
| **Components** | BeautonomiHeader, TopRatedSection, NearestProvidersSection, HottestPicksSection, UpcomingTalentSection, BrowseByCitySection, Footer, BottomNav |
| **API** | `/api/public/home` (provider sections); location for NearestProvidersSection |
| **States** | Loading: sections load; Empty: no providers; Error: fallback UI |
| **Analytics** | `EVENT_HOME_VIEW` |

### Explore Feed
| Field | Value |
|-------|-------|
| **Route** | `/explore` |
| **Screen** | Explore |
| **Components** | ExploreFeed, PostCard, MasonryGrid |
| **API** | `GET /api/explore/posts`, `GET /api/explore/events` |
| **States** | Loading: skeleton; Empty: "No posts yet"; Error: retry |
| **Analytics** | `EVENT_EXPLORE_FEED_VIEW`, `EVENT_EXPLORE_POST_IMPRESSION`, `EVENT_EXPLORE_POST_CLICK` |

### Explore Post Detail
| Field | Value |
|-------|-------|
| **Route** | `/explore/[id]` |
| **Screen** | Explore Post Detail |
| **Components** | PostDetail, Comments, SaveButton, LikeButton |
| **API** | `GET /api/explore/posts/[id]`, `GET /api/explore/posts/[id]/comments`, `POST /api/explore/posts/[id]/comments` |
| **States** | Loading: skeleton; Error: not found / retry |
| **Analytics** | `EVENT_EXPLORE_POST_CLICK`, `EVENT_EXPLORE_SAVE`, `EVENT_EXPLORE_UNSAVE` |

### Saved / Wishlists (Explore)
| Field | Value |
|-------|-------|
| **Route** | `/explore/saved` |
| **Screen** | Saved Posts |
| **Components** | Guests only redirect or SavedPostsList |
| **API** | `GET /api/explore/saved` (auth required) |
| **States** | Loading: skeleton; Empty: "No saved posts"; Error: retry |
| **Analytics** | `EVENT_PAGE_VIEW` (explore_saved) |

### Search
| Field | Value |
|-------|-------|
| **Route** | `/search` |
| **Screen** | Search Providers |
| **Components** | SearchBar, SearchMap, SearchFilters, ProviderResults |
| **API** | `GET /api/public/search`, `GET /api/public/search/suggestions`, `GET /api/location/validate` |
| **States** | Loading: skeleton; Empty: "No results"; Error: retry |
| **Analytics** | `EVENT_SEARCH_VIEW`, `EVENT_SEARCH_FILTERS_APPLIED`, `EVENT_SEARCH_RESULT_IMPRESSION`, `EVENT_SEARCH_RESULT_CLICK` |

### Partner / Provider Profile
| Field | Value |
|-------|-------|
| **Route** | `/partner-profile?slug=...` |
| **Screen** | Partner Profile |
| **Components** | PartnerHero, PartnerPhotos, PartnerServices, PartnerTeam, PartnerReviews, BookNowButton |
| **API** | `GET /api/public/providers/[slug]`, `GET /api/public/providers/[slug]/services`, `GET /api/public/providers/[slug]/availability`, `GET /api/provider/ratings/list` |
| **States** | Loading: skeleton; Error: 404 / retry |
| **Analytics** | `EVENT_PROVIDER_PROFILE_VIEW` |

### Partner Profile Gallery
| Field | Value |
|-------|-------|
| **Route** | `/partner-profile/gallery?slug=...` |
| **Screen** | Partner Gallery |
| **Components** | GalleryGrid, Lightbox |
| **API** | Provider images from profile data |
| **States** | Loading; Empty: no images |
| **Analytics** | `EVENT_PAGE_VIEW` |

### Partner Profile Appointment (Booking Entry)
| Field | Value |
|-------|-------|
| **Route** | `/partner-profile/appointment?slug=...` |
| **Screen** | Booking Entry |
| **Components** | Redirect to /book/[slug] |
| **API** | Same as partner profile |
| **States** | N/A (redirect) |
| **Analytics** | `EVENT_BOOKING_START` |

### Book (Booking Flow)
| Field | Value |
|-------|-------|
| **Route** | `/book/[providerSlug]`, `/book` (with ?slug=...) |
| **Screen** | Booking Flow |
| **Components** | OnlineBookingFlow, StepService, StepVenue, StepStaff, StepDate, StepTime, StepPayment |
| **API** | `GET /api/public/providers/[slug]`, `GET /api/public/providers/[slug]/services`, `GET /api/public/providers/[slug]/availability`, `POST /api/public/booking-holds`, `POST /api/public/booking-holds/[id]/consume`, `POST /api/public/bookings` |
| **States** | Loading per step; Error: retry / validation |
| **Analytics** | `EVENT_BOOKING_START`, `EVENT_BOOKING_HOLD_CREATED`, `EVENT_BOOKING_DETAILS_COMPLETED`, `EVENT_BOOKING_CONFIRMED`, `EVENT_CHECKOUT_START`, `EVENT_PAYMENT_INITIATED`, `EVENT_PAYMENT_SUCCESS`, `EVENT_PAYMENT_FAILED` |

### Book Continue (Post-Hold)
| Field | Value |
|-------|-------|
| **Route** | `/book/continue?holdId=...` |
| **Screen** | Continue Booking |
| **API** | `GET /api/public/booking-holds/[holdId]`, `POST /api/public/booking-holds/[holdId]/consume` |
| **States** | Loading; Error: hold expired |
| **Analytics** | `EVENT_BOOKING_DETAILS_COMPLETED` |

### Bookings List
| Field | Value |
|-------|-------|
| **Route** | `/bookings` (redirects to `/account-settings/bookings`) |
| **Screen** | Bookings |
| **Components** | BookingsList, UpcomingBookings, PastBookings |
| **API** | `GET /api/me/bookings` |
| **States** | Loading: skeleton; Empty: "No bookings"; Error: retry |
| **Analytics** | `EVENT_PAGE_VIEW` (bookings) |

### Booking Detail
| Field | Value |
|-------|-------|
| **Route** | `/account-settings/bookings/[id]` |
| **Screen** | Booking Detail |
| **Components** | BookingDetail, PayNowButton, RescheduleButton, CancelButton |
| **API** | `GET /api/me/bookings` (filter by id) or provider booking API |
| **States** | Loading; Error: not found |
| **Analytics** | `EVENT_PAYMENT_INITIATED`, `EVENT_BOOKING_CANCELLED`, `EVENT_BOOKING_RESCHEDULED` |

### Booking Reschedule
| Field | Value |
|-------|-------|
| **Route** | `/account-settings/bookings/[id]/reschedule` |
| **Screen** | Reschedule |
| **API** | `POST /api/me/bookings/[id]/reschedule` |
| **States** | Loading; Error: validation / policy |
| **Analytics** | `EVENT_BOOKING_RESCHEDULED` |

### Booking Cancel
| Field | Value |
|-------|-------|
| **Route** | Inline modal / action on booking detail |
| **API** | `POST /api/me/bookings/[id]/cancel` |
| **Analytics** | `EVENT_BOOKING_CANCELLED` |

### Booking Review
| Field | Value |
|-------|-------|
| **Route** | `/account-settings/bookings/[id]/review` |
| **Screen** | Write Review |
| **API** | `POST /api/bookings/[id]/review` |
| **States** | Loading; Error: validation |
| **Analytics** | `EVENT_REVIEW_SUBMITTED` |

### Chats / Inbox
| Field | Value |
|-------|-------|
| **Route** | `/inbox` or `/account-settings/messages` |
| **Screen** | Chats / Messages |
| **Components** | ConversationList, ChatThread |
| **API** | Messaging API (conversations, messages) |
| **States** | Loading; Empty: "No conversations"; Error: retry |
| **Analytics** | `EVENT_MESSAGE_THREAD_OPEN`, `EVENT_MESSAGE_SENT` |

### Profile
| Field | Value |
|-------|-------|
| **Route** | `/profile` |
| **Screen** | Profile |
| **Components** | PersonalInfoCard, ServicesBookedSection |
| **API** | `GET /api/me/profile`, `PATCH /api/me/profile` |
| **States** | Loading; Error: retry |
| **Analytics** | `EVENT_PAGE_VIEW` (profile) |

### Account Settings (Index)
| Field | Value |
|-------|-------|
| **Route** | `/account-settings` |
| **Screen** | Account Settings |
| **Components** | AccountSetting links, UpcomingBookingPreview |
| **API** | `GET /api/me/profile`, bookings summary |
| **States** | Loading; Error: retry |
| **Analytics** | `EVENT_PAGE_VIEW` |

### Account Settings Sub-Routes
| Route | Screen | API | Notes |
|-------|--------|-----|-------|
| `/account-settings/personal-info` | Personal Info | PATCH /api/me/profile | |
| `/account-settings/bookings` | Bookings | GET /api/me/bookings | |
| `/account-settings/wishlists` | Wishlists | GET /api/me/wishlists | |
| `/account-settings/wishlists/recently-viewed` | Recently Viewed | GET /api/me/recently-viewed | |
| `/account-settings/messages` | Messages | Messaging API | |
| `/account-settings/notifications` | Notifications | GET/PATCH notification prefs | |
| `/account-settings/payments` | Payments | GET /api/me payments | |
| `/account-settings/addresses` | Addresses | GET/POST /api/me/addresses | |
| `/account-settings/preferences` | Preferences | GET/PATCH /api/me/beauty-preferences | |
| `/account-settings/login-and-security` | Login & Security | Auth APIs | |
| `/account-settings/reviews` | Reviews | GET my reviews | |
| `/account-settings/custom-requests` | Custom Requests | GET /api/me/custom-requests | |
| `/account-settings/membership` | Membership | GET /api/me/membership | |
| `/account-settings/loyalty` | Loyalty | Loyalty API | |
| `/account-settings/loyalty/redeem` | Redeem Points | Loyalty redeem API | |
| `/account-settings/loyalty-points` | Loyalty Points | Loyalty API | |
| `/account-settings/referrals` | Referrals | Referrals API | |
| `/account-settings/recurring-bookings` | Recurring | GET recurring bookings | |
| `/account-settings/waitlist` | Waitlist | Waitlist API | |
| `/account-settings/business` | Business Services | Business API | |
| `/account-settings/wallet` | Wallet | Wallet API | |
| `/account-settings/privacy-and-sharing` | Privacy | Privacy API | |
| `/account-settings/taxes` | Taxes | Tax documents | |

### Gift Card
| Field | Value |
|-------|-------|
| **Route** | `/gift-card` |
| **Screen** | Gift Card Purchase |
| **API** | Gift card purchase / initialize payment |
| **States** | Loading; Error: payment failed |
| **Analytics** | `EVENT_PAYMENT_INITIATED`, `EVENT_PAYMENT_SUCCESS` |

### Portal (Guest Booking Link)
| Field | Value |
|-------|-------|
| **Route** | `/portal`, `/portal/booking` |
| **Screen** | Guest Booking Portal |
| **API** | `GET /api/portal/booking`, `POST /api/portal/booking/reschedule`, `POST /api/portal/booking/cancel` |
| **States** | Loading; Error: link invalid |
| **Analytics** | Limited (guest) |

### Login / Auth
| Field | Value |
|-------|-------|
| **Route** | LoginModal (inline), `/signup`, `/onboarding` |
| **Screen** | Login / Signup / Onboarding |
| **API** | Supabase auth, OTP, OAuth |
| **Analytics** | `EVENT_SIGNUP_START`, `EVENT_SIGNUP_COMPLETE`, `EVENT_LOGIN_SUCCESS` |

---

## Summary: Screen IDs for Parity

| screen_id | web_route | primary |
|-----------|-----------|---------|
| home | / | ✓ tab |
| explore | /explore | ✓ tab |
| explore_post | /explore/[id] | stack |
| saved | /explore/saved | stack |
| search | /search | stack/tab |
| partner_profile | /partner-profile | stack |
| partner_gallery | /partner-profile/gallery | stack |
| book | /book/[slug] | stack |
| book_continue | /book/continue | stack |
| bookings | /account-settings/bookings | ✓ tab |
| booking_detail | /account-settings/bookings/[id] | stack |
| booking_reschedule | /account-settings/bookings/[id]/reschedule | stack |
| booking_review | /account-settings/bookings/[id]/review | stack |
| chats | /inbox | ✓ tab |
| profile | /profile | ✓ tab |
| account_settings | /account-settings | stack |
| account_personal_info | /account-settings/personal-info | stack |
| account_wishlists | /account-settings/wishlists | stack |
| account_messages | /account-settings/messages | stack |
| account_notifications | /account-settings/notifications | stack |
| account_payments | /account-settings/payments | stack |
| account_addresses | /account-settings/addresses | stack |
| account_preferences | /account-settings/preferences | stack |
| account_reviews | /account-settings/reviews | stack |
| account_custom_requests | /account-settings/custom-requests | stack |
| account_membership | /account-settings/membership | stack |
| account_loyalty | /account-settings/loyalty | stack |
| account_referrals | /account-settings/referrals | stack |
| account_business | /account-settings/business | stack |
| gift_card | /gift-card | stack |
| login | (modal) | auth |
| signup | /signup | auth |
| onboarding | /onboarding | auth |
