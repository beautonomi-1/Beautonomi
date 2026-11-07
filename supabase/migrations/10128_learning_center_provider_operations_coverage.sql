-- 10128: Learning Center — provider operations & growth coverage (fact-checked; see docs/learning/FACT_LEDGER.md)
-- Per-claim sources for this migration: docs/learning/_ledger_provider_ops.md
INSERT INTO public.learning_articles (category_id, title, slug, summary, body, content_format, status, audience, is_internal, published_at)
SELECT c.id, v.title, v.slug, v.summary, v.body, 'html', 'published', 'provider', false, NOW()
FROM (VALUES
  (
    'reports-analytics',
    'Your provider dashboard: cards and metrics',
    'provider-dashboard-cards-metrics',
    'The Dashboard tab in the provider app (and Dashboard at /provider/dashboard on the web) shows period revenue, appointments, booking status, balances, rewards and upcoming bookings; app revenue is ledger-based and excludes cash and Yoco service payments.',
    $b$<p>Your Dashboard is the first screen you see in the provider app and the first item in the web sidebar. It summarises how the business is doing for a chosen period, what money is currently held for you, and what is coming up next.</p>
<div data-learn-mockup="provider-mobile-dashboard" data-caption="Provider app Dashboard tab"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> the <strong>Dashboard</strong> tab (first tab in the bottom bar: Dashboard, Clients, Chats, Bookings, More).</li>
<li><strong>On the web:</strong> sidebar <strong>Main → Dashboard</strong> (<a href="/provider/dashboard">/provider/dashboard</a>).</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open the Dashboard. If your account is still being reviewed you will see <strong>Your account is under review</strong> with a <strong>Complete your profile →</strong> button.</li>
<li>Use the quick buttons <strong>New</strong> (new booking), <strong>Walk-in appt</strong> and <strong>Retail</strong> (product sale). Where point-of-sale checkout is enabled you will also see <strong>Sell / POS</strong>.</li>
<li>In the app, pick a period with the chips <strong>Today</strong>, <strong>This Week</strong> or <strong>This Month</strong>. The <strong>This …</strong> section then shows <strong>Revenue earned</strong>, <strong>Appointments</strong> and, where you have in-person sales, <strong>Retail sales</strong>.</li>
<li>Scroll down for <strong>How you earned it</strong>, <strong>Earnings trend (last 7 days)</strong>, <strong>Booking status</strong>, <strong>Appointments by channel</strong> (Online, Walk-in, Provider), <strong>Top services</strong> and <strong>Performance</strong> (Completion rate, No-show rate).</li>
<li>Check <strong>Balances now</strong> for your payout balance and <strong>Unpaid bookings</strong>. These are current balances and are not filtered by the period chips.</li>
<li>Finish with <strong>Your standing</strong>, <strong>Rewards &amp; achievements</strong>, <strong>Upcoming (Next 7 Days)</strong> and <strong>Recent activity</strong>.</li>
</ol>
<div data-learn-mockup="provider-web-dashboard" data-caption="Web Dashboard metric cards"></div>
<h2>Good to know</h2>
<ul>
<li>In the app, <strong>Revenue earned</strong> is ledger-based (platform-settled payments) and uses the day you were paid. Cash and Yoco service payments you collected yourself are not included. Appointments are counted on the day they are scheduled.</li>
<li>The web Dashboard (<em>Overview of your business performance</em>) shows cards such as <strong>Revenue This Month</strong>, <strong>Travel Fees This Month</strong>, <strong>Pending Payments</strong>, <strong>Active Bookings</strong>, <strong>Appointments Today</strong>, <strong>Today's Revenue</strong> and <strong>Completion Rate</strong>, plus <strong>Your Earnings</strong>, <strong>Your Expenses</strong>, <strong>Performance</strong>, <strong>Booking Status</strong> and <strong>Booking Type Breakdown</strong>.</li>
<li>The strip near the top of the app Dashboard shows your rating, your current badge, At-home / At-salon and, if you use a distance limit, <em>Within … km</em>. Tap the rating to open reviews or the badge to open Rewards &amp; badges.</li>
<li>If <strong>Online bookings need attention</strong> appears, tap it to open your plan and billing.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/reports-analytics-overview">Reports and analytics overview</a></li>
<li><a href="/learn/article/provider-web-reports-analytics">Web reports and analytics</a></li>
<li><a href="/learn/article/payouts-earnings-overview">Payouts and earnings</a></li>
<li><a href="/learn/article/provider-rewards-badges">Rewards and badges</a></li>
</ul>$b$
  ),
  (
    'clients-crm',
    'Chats tab and the Engagement hub',
    'provider-chats-engagement-hub',
    'Client conversations live in the Chats tab of the provider app (Messages at /provider/messaging on the web); More → Engagement → Engagement groups Messages, Marketing, Support tickets and your latest reviews.',
    $b$<p>Clients message you about bookings and custom requests. In the provider app those conversations live in the <strong>Chats</strong> tab. The <strong>Engagement</strong> hub puts messages, marketing, support tickets and your recent reviews on one screen.</p>
<div data-learn-mockup="provider-mobile-messages" data-caption="Chats tab conversation list"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> the <strong>Chats</strong> tab in the bottom bar. For the hub, go to <strong>More → Engagement → Engagement</strong>.</li>
<li><strong>On the web:</strong> sidebar <strong>Team &amp; Marketing → Messages</strong> (<a href="/provider/messaging">/provider/messaging</a>) and <strong>Team &amp; Marketing → Reviews</strong> (/provider/reviews). The web Engagement hub is at /provider/engagement (from the More hub at /provider/more).</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open <strong>Chats</strong>. The red badge on the tab shows your unread count.</li>
<li>Use the search box (<em>Search by name, message, or booking #</em>) to find a conversation.</li>
<li>Long-press a conversation and choose <strong>Pin chat</strong> to keep it at the top, or <strong>Unpin chat</strong> to undo.</li>
<li>Open a conversation to reply. When the chat is linked to a client, the price-tag button at the top opens <strong>Send custom offer</strong>.</li>
<li>For the bigger picture, open <strong>More → Engagement → Engagement</strong>. Tap <strong>Messages</strong> (opens Chats), <strong>Marketing</strong> (campaigns and promos) or <strong>Support tickets</strong>. Under <strong>Reviews</strong>, tap <strong>Manage</strong> to open the full reviews list.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>The <strong>Marketing</strong> tile only shows for owners and team members who can manage marketing. Everyone else sees the hub subtitle <em>Reviews &amp; messaging</em>.</li>
<li>Each review card shows what the client rated you, your rating of the client and your public reply. Reviews you have not answered show <strong>Reply pending</strong>.</li>
<li>If direct messaging is switched off in your content &amp; safety settings, you can still read past conversations but cannot start new ones.</li>
<li>The web sidebar shows an unread badge on <strong>Messages</strong>.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-mobile-clients-messaging-support">App clients, messaging and support</a></li>
<li><a href="/learn/article/provider-web-clients-messaging-crm">Web clients, messaging and CRM</a></li>
<li><a href="/learn/article/reviews-management-overview">Managing reviews</a></li>
<li><a href="/learn/article/provider-custom-requests-offers">Custom requests and offers</a></li>
</ul>$b$
  ),
  (
    'marketing-automations',
    'Buying ads: time boosts, impression packs and CPC campaigns',
    'provider-buy-ads',
    'Buy sponsored placement under More → Grow your business → Buy ads in the app or Team & Marketing → Paid Ads (/provider/settings/ads) on the web; choose a time boost, an impression pack or a custom CPC budget, and the campaign only goes live after payment is verified.',
    $b$<p>Ads put your listing in sponsored placements, shown as a <strong>Sponsored</strong> result in eligible searches while the campaign is funded and active. You pay up front, and nothing is shown before your payment is verified.</p>
<div data-learn-mockup="provider-mobile-more" data-caption="More tab — Grow your business → Buy ads"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Grow your business → Buy ads</strong>, the <strong>Ads</strong> card near the top of More, or the <strong>Buy ads</strong> quick action. The screen is titled <strong>Paid ads</strong>.</li>
<li><strong>On the web:</strong> sidebar <strong>Team &amp; Marketing → Paid Ads</strong> (<a href="/provider/settings/ads">/provider/settings/ads</a>), or <strong>Settings → Marketing → Paid ads (boosted listings)</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open Paid ads. Optionally pick <strong>Target categories</strong>. If you select none, your ad shows in all category searches.</li>
<li>Choose how you want to grow:
<ul>
<li><strong>Time boost</strong>: a flat fee for sponsored placement over a set number of days.</li>
<li><strong>Impression pack</strong>: prepaid sponsored impressions that run until the pack is fully shown.</li>
<li><strong>CPC budget</strong> (<strong>New CPC campaign</strong>): set a total budget, with an optional daily cap and bid per click.</li>
</ul></li>
<li>Check the <strong>Review your boost</strong> summary, then pay. On the web you go to Paystack and come back to the ads page. In the app, Paystack opens inside the app. On iPhone, boosts may go through an App Store purchase instead.</li>
<li>Wait for <strong>Confirming payment</strong> to change to <strong>Active</strong>. Track <strong>Impressions</strong>, <strong>Reach</strong>, <strong>Clicks</strong>, <strong>CTR</strong>, <strong>Bookings</strong> and <strong>Spend</strong> under <strong>Ad performance</strong> (Today, 7 days, 30 days, All time).</li>
<li>Under <strong>Campaigns</strong>, use <strong>Edit targeting</strong>, <strong>Pause</strong> / <strong>Activate</strong>, <strong>View receipt</strong> or <strong>Buy again</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Beautonomi sets the prices and options for boosts and packs, and they vary by market. Which ad types you see, and whether ads are offered at all, depends on your plan and region. If ads are not open in your market you will see <strong>Ads not enabled</strong>.</li>
<li>Time boosts and impression packs keep the price you bought them at. To add budget, buy another boost or pack. You can lower a CPC budget but not raise it.</li>
<li>If a payment does not finish, the campaign shows <strong>Awaiting payment</strong> or <strong>Payment failed</strong>. Use <strong>Resume payment</strong> / <strong>Try payment again</strong>, or <strong>Cancel payment</strong> to remove the draft without being charged.</li>
<li>Custom CPC budgets are not offered where purchases go through the App Store.</li>
<li>Buy ads only appears for owners and team members with the permission to edit settings.</li>
</ul>
<div data-learn-mockup="provider-web-marketing" data-caption="Web Paid Ads campaigns and performance"></div>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/marketing-automations-overview">Marketing and automations</a></li>
<li><a href="/learn/article/provider-web-subscription-plan">Your subscription plan</a></li>
<li><a href="/learn/article/provider-explore-posts">Explore posts</a></li>
<li><a href="/learn/article/provider-mobile-more-navigation">Finding your way around More</a></li>
</ul>$b$
  ),
  (
    'marketing-automations',
    'Explore posts: drafts, publishing and posting from a booking',
    'provider-explore-posts',
    'Create Explore feed posts (up to 5 photos or videos each) under More → Engagement → Explore posts in the app or Team & Marketing → Explore Content (/provider/explore) on the web; save as a draft or publish, and post straight from the booking-complete prompt.',
    $b$<p>Explore is the Beautonomi feed where clients find looks and providers. Each post can include up to 5 photos or videos, a caption, tags, an optional linked service and optional background sound. Posts can be saved as drafts and published later.</p>
<div data-learn-mockup="provider-web-marketing" data-caption="Explore Content — your posts"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Engagement → Explore posts</strong> (<em>Your feed posts, views &amp; comments</em>).</li>
<li><strong>On the web:</strong> sidebar <strong>Team &amp; Marketing → Explore Content</strong> (<a href="/provider/explore">/provider/explore</a>). New posts open at /provider/explore/new.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Start a new post. In the app, tap <strong>Post now</strong> (or <strong>Create post</strong> if you have none yet) and add media from <strong>Library</strong> or <strong>Camera</strong> (up to 5 items).</li>
<li>Optionally add on-media text (<strong>Add text</strong>), a <strong>Caption</strong>, <strong>Tags</strong> (comma-separated) and <strong>Link a service</strong> so clients can tap through to book that look.</li>
<li>Choose to publish now or save a draft. Drafts show <strong>Draft — not on Explore yet</strong> until you publish them.</li>
<li>Open a post to see views, likes and comments, edit it, or delete it.</li>
<li>From a booking: when you complete an appointment, the <strong>Booking complete</strong> prompt offers <strong>Show off your work</strong> → <strong>Open Explore</strong>. The new post opens pre-filled and is linked to that booking. If you already started a post for that booking, you will see <strong>Finish your Explore draft</strong> → <strong>Continue draft</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Publishing to Explore earns reward points. Beautonomi sets how many points each action earns.</li>
<li>Video posts may show <strong>Processing</strong> for a moment. If a video fails, you will see <strong>Video failed</strong>. Edit the post and save to try again.</li>
<li>A post marked <strong>Hidden by Beautonomi</strong> was removed by moderation and may include a moderation note.</li>
<li>Team members need the permission to create Explore posts. If the Explore feed is hidden in your Trust &amp; Safety content settings, turn it back on to manage posts.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-rewards-badges">Rewards and badges</a></li>
<li><a href="/learn/article/marketing-automations-overview">Marketing and automations</a></li>
<li><a href="/learn/article/provider-mobile-calendar-bookings">App calendar and bookings</a></li>
<li><a href="/learn/article/provider-buy-ads">Buying ads</a></li>
</ul>$b$
  ),
  (
    'clients-crm',
    'Custom requests and sending custom offers',
    'provider-custom-requests-offers',
    'Client quote requests are under More → Operations → Custom Requests in the app (Custom Requests at /provider/custom-requests on the web); send an offer with price, duration (15–480 minutes), expiry and a real slot, and it becomes a booking once the client pays.',
    $b$<p>Clients can send you a custom request when they want something that is not on your menu, or need a quote. You reply with an offer that has a price, duration and time slot. The request is not on your calendar yet. It becomes a booking once the client accepts and pays.</p>
<div data-learn-mockup="provider-mobile-messages" data-caption="Custom request detail and offer"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Operations → Custom Requests</strong>, or the <strong>Custom requests</strong> quick action on More. A red badge shows requests waiting for your response.</li>
<li><strong>On the web:</strong> the More hub (/provider/more, the <strong>More</strong> button in the bottom bar on smaller screens) <strong>→ Operations → Custom Requests</strong>, or go straight to <a href="/provider/custom-requests">/provider/custom-requests</a>.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open a request to see the category or service, preferred time, at-home or at-salon, the client's budget range, address and any attachments.</li>
<li>Under <strong>Send offer</strong>, enter the <strong>Price</strong> and <strong>Duration (minutes)</strong>. Duration must be between 15 and 480 minutes.</li>
<li>Set <strong>Offer expires in (days)</strong> (at least 1 day; the app starts at 7). Optionally choose a <strong>Venue</strong> and <strong>Assigned staff</strong>.</li>
<li>Pick a <strong>Proposed date and time</strong>. Slots come from your real availability, so the client can only pay for a time you can keep.</li>
<li>For at-home requests, the travel fee is worked out when the address is on file. You can override it.</li>
<li>Send. The client is notified and can accept. You can <strong>Edit offer</strong> or <strong>Withdraw offer</strong> while it is pending, or <strong>Decline request</strong> with an optional reason.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Offer statuses include <strong>Pending acceptance</strong>, <strong>Changes requested</strong>, <strong>Payment in progress</strong>, <strong>Paid / Booked</strong>, <strong>Withdrawn</strong> and <strong>Expired</strong>. If an earlier offer was withdrawn or has expired, you can send a new one.</li>
<li>You can also send a custom offer from a chat: open the conversation in <strong>Chats</strong> and tap the price-tag button (<strong>Send custom offer</strong>).</li>
<li>At-salon offers need a salon location. Add one in your locations settings first, or switch the offer to a house call.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-chats-engagement-hub">Chats tab and the Engagement hub</a></li>
<li><a href="/learn/article/calendar-scheduling-overview">Calendar and scheduling</a></li>
<li><a href="/learn/article/provider-mobile-calendar-bookings">App calendar and bookings</a></li>
<li><a href="/learn/article/clients-crm-overview">Clients and CRM</a></li>
</ul>$b$
  ),
  (
    'marketing-automations',
    'AI studio: profile, content and reply suggestions',
    'provider-ai-studio',
    'AI studio (More → Settings → Settings & account → Marketing → AI studio in the app; Settings → Marketing → AI studio at /provider/settings/ai on the web) drafts profile text, captions, replies, pricing ideas, booking messages and review replies, as included in your plan.',
    $b$<p>AI studio gives you draft suggestions you can copy or apply. It does not change anything on its own, except when you choose <strong>Apply bio to profile</strong>. Which tools work depends on your plan.</p>
<div data-learn-mockup="provider-web-settings" data-caption="Settings → Marketing → AI studio"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Settings → Settings &amp; account → Marketing → AI studio</strong>.</li>
<li><strong>On the web:</strong> <strong>Settings</strong> (bottom of the sidebar) <strong>→ Marketing</strong> tab <strong>→ AI studio</strong> (<a href="/provider/settings/ai">/provider/settings/ai</a>).</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Optionally type extra context, for example the services you focus on and your city. In the app this applies to every tool.</li>
<li>Pick a tool and tap <strong>Generate</strong>:
<ul>
<li><strong>Profile suggestions</strong>: headline, bio, specialties, FAQ and policy ideas.</li>
<li><strong>Content studio</strong>: post captions, hashtags and short descriptions.</li>
<li><strong>Smart replies</strong>: reply options for a message you received.</li>
<li><strong>Pricing assistant</strong>: price suggestions based on your services. These are advice only.</li>
<li><strong>Booking messages</strong>: reminder, no-show and reschedule SMS templates.</li>
<li><strong>Reputation coach</strong>: review reply drafts and recovery tips.</li>
<li><strong>Look describe</strong>: caption, tags and alt text from an image URL (paste the URL in the image field first).</li>
</ul></li>
<li>Read the <strong>Result</strong>. If Profile suggestions returns a bio, tap <strong>Apply bio to profile</strong> to save it as your business description.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Access is plan-based. If a tool is not included in your plan, you will see a message saying the feature is not available, instead of a result.</li>
<li>Always check suggested prices and wording before using them with clients.</li>
<li>Your business description is also editable under Settings → Business Description.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-web-subscription-plan">Your subscription plan</a></li>
<li><a href="/learn/article/provider-business-profile-upgrade-salon">Business profile and upgrading to a salon</a></li>
<li><a href="/learn/article/provider-explore-posts">Explore posts</a></li>
<li><a href="/learn/article/reviews-management-overview">Managing reviews</a></li>
</ul>$b$
  ),
  (
    'reviews-management',
    'Rewards and badges: points, levels and perks',
    'provider-rewards-badges',
    'Track your points and badge level under More → Settings → Rewards & badges in the app (Points and Badges tabs) or Business → Rewards & Badges (/provider/gamification) on the web; points come from completed bookings, reviews and Explore posts, and Beautonomi sets the values.',
    $b$<p>Rewards &amp; badges reward you for good work on Beautonomi. You earn points for activity such as completed bookings, client reviews and Explore posts. Points move you up badge levels, and some levels come with perks.</p>
<div data-learn-mockup="provider-mobile-more" data-caption="More → Settings → Rewards & badges"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Settings → Rewards &amp; badges</strong> (<em>Points, milestones &amp; badge progress</em>). You can also tap your badge on the Dashboard or use <strong>Settings &amp; account → Account → Rewards &amp; badges</strong>.</li>
<li><strong>On the web:</strong> sidebar <strong>Business → Rewards &amp; Badges</strong> (<a href="/provider/gamification">/provider/gamification</a>).</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open Rewards &amp; badges. The <strong>Points</strong> tab shows <strong>Current points</strong>, <strong>Lifetime points</strong>, your <strong>Current badge</strong> and <strong>Recent points</strong>.</li>
<li>Switch to <strong>Badges</strong> to see <strong>Your level</strong>, <strong>Level up next</strong> and how many points you still need.</li>
<li>Scroll to <strong>Badge journey</strong>. Each level is marked <strong>Current</strong>, <strong>Unlocked</strong>, <strong>Up next</strong> or <strong>Locked</strong>, along with its requirements (points, reviews, bookings or rating).</li>
<li>Check <strong>Milestones</strong> such as First booking or First review.</li>
<li>If your points or badge look out of date after recent bookings, tap <strong>Sync badge progress</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Beautonomi sets the points for each activity and the requirements for each badge, and may change them. Rely on what the screen shows, not on fixed numbers.</li>
<li>Some badges come with perks such as a <strong>Featured listing</strong> or a <strong>Subscription perk</strong>. The perk and how long it lasts are shown on the badge.</li>
<li>Tips under <strong>How to level up</strong>: complete bookings, earn great reviews and stay consistent.</li>
<li>The Points tab also shows <strong>Total earned</strong>. This only counts payments recorded in your finance ledger, so cash you collected directly may not be included.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/reviews-management-overview">Managing reviews</a></li>
<li><a href="/learn/article/provider-explore-posts">Explore posts</a></li>
<li><a href="/learn/article/provider-dashboard-cards-metrics">Your provider dashboard</a></li>
<li><a href="/learn/article/provider-mobile-more-navigation">Finding your way around More</a></li>
</ul>$b$
  ),
  (
    'clients-crm',
    'Refer a business and track client referral sources',
    'provider-referrals-referral-sources',
    'Refer another salon or beauty business under Settings & account → Clients → Refer a business in the app (/provider/referrals on the web), and track how clients find you with Referral Sources (/provider/settings/clients/referrals).',
    $b$<p>There are two different referral tools. <strong>Refer a business</strong> sends Beautonomi the details of another salon or beauty business you think should join. <strong>Referral Sources</strong> is your own list of where clients come from, such as Instagram, Google or a friend.</p>
<div data-learn-mockup="provider-web-clients" data-caption="Settings → Clients → Referral Sources"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Settings → Settings &amp; account → Clients</strong>, then <strong>Refer a business</strong> or <strong>Referral sources</strong>.</li>
<li><strong>On the web:</strong> <strong>Settings → Clients</strong> tab, then <strong>Refer a business</strong> (<a href="/provider/referrals">/provider/referrals</a>) or <strong>Referral Sources</strong> (/provider/settings/clients/referrals).</li>
</ul>
<h2>Step by step</h2>
<h3>Refer a business</h3>
<ol>
<li>Open Refer a business and fill in <strong>Business name *</strong>. Add an email or a phone number. At least one of these is required.</li>
<li>Optionally add the <strong>Contact person</strong>, <strong>City or area</strong>, <strong>Why are you referring them?</strong> and <strong>Private notes</strong>.</li>
<li>Tap <strong>Submit referral</strong>. Your referral appears under <strong>Your referrals</strong> as <strong>Submitted</strong>, then <strong>Invited</strong> and <strong>Joined</strong> as Beautonomi follows up.</li>
</ol>
<h3>Referral sources</h3>
<ol>
<li>Open Referral Sources and add a source with a <strong>Name *</strong> (for example Instagram), an optional <strong>Description</strong> and the <strong>Active</strong> switch.</li>
<li>Edit or delete sources at any time. The screen shows totals for sources, active sources and clients linked to each source.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Beautonomi checks the email and phone against existing businesses and referrals for duplicates before creating a lead.</li>
<li>Referral sources only track attribution for your own business. They are separate from Beautonomi's customer invite-a-friend programme.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/clients-crm-overview">Clients and CRM</a></li>
<li><a href="/learn/article/provider-web-clients-messaging-crm">Web clients, messaging and CRM</a></li>
<li><a href="/learn/article/marketing-automations-overview">Marketing and automations</a></li>
</ul>$b$
  ),
  (
    'calendar-scheduling',
    'Resources and forms: rooms, equipment and intake forms',
    'provider-resources-forms',
    'Manage rooms, chairs and equipment plus intake, consent and waiver forms under More → Operations → Resources & forms in the app, or the Resources & Forms sidebar section (/provider/resources, /provider/forms) on the web.',
    $b$<p><strong>Resources</strong> are the physical things your services use, such as treatment rooms, chairs and equipment. <strong>Forms</strong> are intake, consent and waiver forms that clients fill in for their bookings. Both are managed in one place.</p>
<div data-learn-mockup="provider-web-settings" data-caption="Resources & Forms"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Operations → Resources &amp; forms</strong>, then <strong>Rooms &amp; equipment</strong> or <strong>Intake &amp; consent forms</strong>.</li>
<li><strong>On the web:</strong> sidebar section <strong>Resources &amp; Forms</strong>, then <strong>Resources</strong> (<a href="/provider/resources">/provider/resources</a>) or <strong>Forms</strong> (/provider/forms). Resources are also under <strong>Settings → Appointment Activity → Resources</strong>.</li>
</ul>
<h2>Step by step</h2>
<h3>Add a resource</h3>
<ol>
<li>Tap <strong>Add resource</strong>. Enter a <strong>Name *</strong> (for example Treatment Room 1) and choose a <strong>Type</strong>: Room, Chair, Equipment or Other.</li>
<li>Optionally set a <strong>Description</strong>, <strong>Capacity</strong>, <strong>Group</strong> and <strong>Calendar Color</strong>, and switch <strong>Active</strong> on or off.</li>
<li>Use the <strong>Groups</strong> tab to organise resources (for example Treatment Rooms). Deleting a group does not delete the resources in it.</li>
</ol>
<h3>Create a form</h3>
<ol>
<li>Open the forms list and create a <strong>New Form</strong>. Give it a <strong>Title *</strong> and choose a <strong>Form Type</strong>: Intake, Consent or Waiver.</li>
<li>Add fields with <strong>Add Field</strong>. Field types are Text, Checkbox, Signature and Date, and each can be marked <strong>Required</strong>.</li>
<li>Switch on <strong>Attach to every booking</strong> if clients should complete the form whenever they book any service.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Form responses appear on each booking.</li>
<li>Changes you make to forms sync between the app and the web portal.</li>
<li>Adding resources depends on your plan. If it is not included, you will be asked to upgrade.</li>
<li>Managing resources and forms requires the permission to edit settings.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/calendar-scheduling-overview">Calendar and scheduling</a></li>
<li><a href="/learn/article/services-catalogue-overview">Services and catalogue</a></li>
<li><a href="/learn/article/provider-web-calendar-bookings">Web calendar and bookings</a></li>
</ul>$b$
  ),
  (
    'inventory-products',
    'Inventory, suppliers and product variants',
    'provider-inventory-suppliers-variants',
    'Track stock in the app under More → E-Commerce & Products → Products & e-commerce → Products & inventory (Inventory tab), add suppliers from the product form, and switch on "Has variants" for sizes or volumes with their own SKU, barcode, price and stock.',
    $b$<p>Products you sell can track stock levels and low-stock alerts, and can belong to a supplier. If a product comes in sizes or volumes, turn on variants so each option has its own SKU, barcode, price and stock.</p>
<div data-learn-mockup="provider-web-catalogue" data-caption="Products and inventory"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → E-Commerce &amp; Products → Products &amp; e-commerce → Products &amp; inventory</strong>, which has <strong>Products</strong> and <strong>Inventory</strong> tabs.</li>
<li><strong>On the web:</strong> sidebar <strong>E-Commerce → Products</strong> (<a href="/provider/ecommerce/products">/provider/ecommerce/products</a>). Products are added and edited in the catalogue at /provider/catalogue/products.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Add or edit a product (<strong>Add Product</strong>). Enter an <strong>SKU</strong> (or tap <strong>Generate</strong>) and a <strong>Barcode</strong> (type it or scan the packaging).</li>
<li>Tap <strong>Supplier</strong> to pick a supplier, or choose <strong>Add new supplier</strong> and type the name.</li>
<li>Set <strong>Stock</strong>, <strong>Low stock level</strong> and <strong>Reorder qty</strong>, and switch on <strong>Track stock</strong>, <strong>Retail sales enabled</strong> and <strong>Low stock alerts</strong> as needed.</li>
<li>For sizes or volumes, switch on <strong>Has variants (sizes, volumes…)</strong> and generate at least one variant row. Each option gets its own barcode, SKU, size, price and stock. Name, photos, category and tax stay on the main product.</li>
<li>Open the <strong>Inventory</strong> tab (Inventory Manager) to see <strong>Total products</strong>, <strong>Stock value</strong>, <strong>Out of stock</strong>, <strong>Low stock</strong> and a breakdown <strong>By category</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>For products with variants, stock is tracked per variant. Change quantities and prices in the full product editor.</li>
<li>If you turn <strong>Has variants</strong> off and save, the hidden options are deleted, including their prices and barcodes.</li>
<li>The Products &amp; e-commerce screen flags <strong>Low stock</strong> and orders that need action, and links to <strong>Walk-in sale</strong> and <strong>Orders &amp; returns</strong>.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/inventory-products-overview">Inventory and products</a></li>
<li><a href="/learn/article/provider-web-ecommerce-orders">Web e-commerce orders</a></li>
<li><a href="/learn/article/provider-shipping-collection-returns">Shipping, collection and returns</a></li>
<li><a href="/learn/article/provider-web-services-catalogue">Web services catalogue</a></li>
</ul>$b$
  ),
  (
    'inventory-products',
    'Shipping, collection and returns for product orders',
    'provider-shipping-collection-returns',
    'Set delivery fees, in-store collection and courier booking (Aramex, Courier Guy or Bob Go) under E-Commerce → Shipping & Collection (/provider/ecommerce/shipping), and handle return requests under Orders → Returns (/provider/ecommerce/returns) or Orders & returns in the app.',
    $b$<p>When clients buy products online, they can either collect from you or have the order delivered. Shipping &amp; Collection controls the options and fees they see at checkout. Returns is where you approve or reject return requests and process refunds.</p>
<div data-learn-mockup="provider-web-orders" data-caption="Orders, returns and shipping"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → E-Commerce &amp; Products → Products &amp; e-commerce</strong>, then <strong>Shipping &amp; collection</strong>, or <strong>Orders &amp; returns</strong> (with <strong>Orders</strong> and <strong>Returns</strong> tabs).</li>
<li><strong>On the web:</strong> sidebar <strong>E-Commerce → Shipping &amp; Collection</strong> (<a href="/provider/ecommerce/shipping">/provider/ecommerce/shipping</a>) and <strong>Orders → Returns</strong> (/provider/ecommerce/returns).</li>
</ul>
<h2>Step by step</h2>
<h3>Shipping and collection</h3>
<ol>
<li>Switch on <strong>Enable Collection</strong> and add <strong>Collection Notes</strong> (shown at checkout, for example hours and what to bring).</li>
<li>Switch on <strong>Enable Delivery</strong>. On the web, choose a <strong>Delivery Fee Model</strong> (Flat fee, Base fee + weight rate, or Base fee + distance rate) and set the base fee, an optional <strong>Free Delivery Threshold</strong>, the <strong>Delivery Radius (km)</strong> and <strong>Estimated Delivery Days</strong>.</li>
<li>Optionally choose a courier under <strong>Courier Booking</strong>: Manual tracking only, Aramex, Courier Guy or Bob Go. Then save your courier account details and use <strong>Test connection</strong>.</li>
<li>For Bob Go you can also add an optional webhook secret for live shipment updates.</li>
</ol>
<h3>Returns</h3>
<ol>
<li>Open Returns and filter by status: Pending, Approved, Rejected, Received or Refunded.</li>
<li>For a pending request, <strong>Approve</strong> it and choose the return method (Drop off, Ship back or Not required), or <strong>Reject</strong> it with an optional note to the client.</li>
<li>When the item is back, tap <strong>Mark item received</strong>, then <strong>Process refund</strong> as <strong>Wallet credit</strong> or <strong>Cash in person</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Checkout uses your own delivery fees. The courier's live rates are only your booking cost and are not charged to the client.</li>
<li>Only the business owner can view or edit courier account keys. In the app you can pick a courier, but you connect the keys on the web.</li>
<li>Live courier booking has to be switched on by Beautonomi, so it may not be available in your region yet.</li>
<li>Wallet credit refunds are added to the client's Beautonomi wallet.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-web-ecommerce-orders">Web e-commerce orders</a></li>
<li><a href="/learn/article/inventory-products-overview">Inventory and products</a></li>
<li><a href="/learn/article/provider-inventory-suppliers-variants">Inventory, suppliers and variants</a></li>
</ul>$b$
  ),
  (
    'online-booking-links',
    'Express booking links',
    'provider-express-booking-links',
    'Create pre-filled booking links (services, staff, location, expiry, max uses) under More → Express booking in the app or Team & Marketing → Booking links (/provider/express-booking) on the web; express links are plan-gated.',
    $b$<p>An express link opens your booking page with chosen services, a team member and a location already filled in. It is useful for promotions, Instagram bios or a specific stylist's clients. You can give a link an expiry date or a usage limit, and pause it at any time.</p>
<div data-learn-mockup="provider-mobile-more" data-caption="More → Express booking (Booking Links)"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> the <strong>Express booking</strong> quick action on the More tab. The screen is titled <strong>Booking Links</strong>.</li>
<li><strong>On the web:</strong> sidebar <strong>Team &amp; Marketing → Booking links</strong> (<a href="/provider/express-booking">/provider/express-booking</a>). The page is titled <strong>Express Booking Links</strong>.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Tap <strong>New Link</strong> (<strong>Create Express Link</strong>).</li>
<li>Enter a <strong>Name</strong> (for example Summer Promo) and a <strong>Slug (URL-safe)</strong>.</li>
<li>Optionally choose <strong>Pre-select services</strong>, a <strong>Staff member</strong> (or Any staff), the <strong>Location choice</strong> (Client chooses, At salon or At home) and a branch.</li>
<li>Optionally set an <strong>Expiry date</strong> and <strong>Max uses</strong> (leave empty for unlimited), then keep <strong>Active link</strong> on and tap <strong>Create</strong>.</li>
<li>Copy and share the link with clients. In the app, each link has <strong>Copy</strong>, <strong>Share</strong>, <strong>Embed</strong> (copies a URL for your website iframe) and <strong>Pause</strong> / <strong>Activate</strong>, and shows its click count.</li>
<li>In the app, <strong>Prefill</strong> lets you add a promo code, gift card code, add-ons or retail products that are applied when the client opens the link.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Express links are a plan feature, and your plan may limit how many you can create. If you see <strong>Upgrade Required</strong>, tap <strong>View Plans</strong>.</li>
<li>The app's Booking Links screen also shows your <strong>General Booking Link</strong> with <strong>Copy Link</strong>, <strong>Share Link</strong>, a <strong>QR Code</strong> and <strong>Customize Link</strong> for your slug.</li>
<li>Front Desk is a separate quick action on More that opens the waiting room view.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/online-booking-links-overview">Online booking links</a></li>
<li><a href="/learn/article/provider-web-online-booking-links">Web online booking links</a></li>
<li><a href="/learn/article/provider-web-front-desk">Front desk metrics</a></li>
<li><a href="/learn/article/staff-permissions-overview">Staff and permissions</a></li>
</ul>$b$
  ),
  (
    'calendar-scheduling',
    'Closed periods, blocked time and waitlist settings',
    'provider-closed-periods-blocked-time-waitlist',
    'Add holiday closures under Closed Periods (/provider/settings/appointment-activity/closed-periods), manage blocked time under Blocked time types, and set up the intelligent waitlist and virtual waiting room under Waitlist settings, all in Settings → Appointment Activity on the web or Settings & account → Appointment & activity in the app.',
    $b$<p>These settings stop clients booking when you are closed, block out non-working time, and control how the waitlist and virtual waiting room behave.</p>
<div data-learn-mockup="provider-web-calendar" data-caption="Closed periods block bookings on the calendar"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Settings → Settings &amp; account → Appointment &amp; activity</strong>, then <strong>Closed periods</strong>, <strong>Blocked time types</strong> or <strong>Waitlist settings</strong>.</li>
<li><strong>On the web:</strong> <strong>Settings → Appointment Activity</strong> tab, then <strong>Business closed periods</strong>, <strong>Blocked time types</strong> or <strong>Waitlist settings</strong>. The sidebar also has <strong>Schedule → Closed Periods</strong> (<a href="/provider/settings/appointment-activity/closed-periods">/provider/settings/appointment-activity/closed-periods</a>).</li>
</ul>
<h2>Step by step</h2>
<h3>Closed periods</h3>
<ol>
<li>Tap <strong>Add Closed Period</strong>. In the app, choose a type (Holiday / Closure, Break or Maintenance).</li>
<li>Set the start and end date and time and an optional reason (for example Christmas Holiday). In the app you can also switch on <strong>Recurring</strong> to repeat the closure.</li>
<li>Save. Clients cannot book during the period. The app shows how many existing bookings are affected.</li>
</ol>
<h3>Blocked time</h3>
<ol>
<li>In the app, <strong>Blocked time types</strong> is where you create named types such as Lunch, Meeting or Personal, each with a colour, to use when you block calendar time.</li>
<li>On the web, the Blocked time types page lets you add a <strong>Break</strong> or <strong>Maintenance</strong> block with a start, an end and an optional reason, and lists upcoming blocked time.</li>
</ol>
<h3>Waitlist settings</h3>
<ol>
<li>Under <strong>Intelligent waitlist</strong>, turn on notifying clients when slots open. Optionally turn on auto-notify, notify high priority entries first, and set a notification delay in minutes.</li>
<li>Under <strong>Virtual waiting room</strong>, allow client self check-in and showing the estimated wait time.</li>
<li>Under <strong>Online waitlist</strong>, let clients join the waitlist from online booking when no slots are free.</li>
<li>Set the maximum waitlist size and the number of days after which entries are removed automatically, then save.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>The web waitlist settings also have <strong>Auto-booking for waitlist entries</strong>. Auto-booked appointments start as <em>pending</em> and need payment confirmation.</li>
<li>For one-off breaks on the calendar, you can also use Time blocks (More → Operations → Time blocks).</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/waitlist-waiting-room-overview">Waitlist and waiting room</a></li>
<li><a href="/learn/article/provider-web-group-bookings-time-blocks">Web group bookings and time blocks</a></li>
<li><a href="/learn/article/provider-mobile-group-bookings-time-blocks">App group bookings and time blocks</a></li>
<li><a href="/learn/article/calendar-scheduling-overview">Calendar and scheduling</a></li>
</ul>$b$
  ),
  (
    'integrations',
    'Calendar sync and marketing integrations',
    'provider-calendar-sync-integrations',
    'Connect Google, Apple or Outlook calendars at Settings → Appointment Activity → Calendar Integration (/provider/settings/calendar-integration), and connect SendGrid/Mailchimp or Twilio, or use platform marketing credits, under Settings → Marketing.',
    $b$<p>Integrations connect Beautonomi to tools you already use. <strong>Calendar sync</strong> copies your appointments to an external calendar. <strong>Email</strong> and <strong>Twilio</strong> integrations send marketing campaigns through your own accounts. <strong>Marketing Integrations</strong> shows whether you are sending through Beautonomi with marketing credits or through your own accounts.</p>
<div data-learn-mockup="provider-web-settings" data-caption="Settings → Marketing integrations"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>Calendar sync (web):</strong> <strong>Settings → Appointment Activity → Calendar Integration</strong> (<a href="/provider/settings/calendar-integration">/provider/settings/calendar-integration</a>).</li>
<li><strong>Email and Twilio (web):</strong> <strong>Settings → Marketing → Email Integration</strong> (/provider/settings/integrations/email) and <strong>Twilio Integration</strong> (/provider/settings/integrations/twilio). Credits and sending mode are at /provider/settings/marketing-integrations.</li>
<li><strong>In the app:</strong> <strong>More → Settings → Settings &amp; account → Marketing → Email integration</strong> or <strong>Twilio integration</strong>.</li>
</ul>
<h2>Step by step</h2>
<h3>Connect a calendar</h3>
<ol>
<li>Open Calendar Integration and tap <strong>Connect Calendar</strong>.</li>
<li>Choose a provider. Only providers Beautonomi has enabled are listed (from Google Calendar, Apple Calendar and Microsoft Outlook).</li>
<li>Choose <strong>Two-way sync (recommended)</strong>, where changes sync both ways, or <strong>One-way sync (appointments → calendar only)</strong>, then sign in to approve access.</li>
<li>Use <strong>Sync Now</strong> to refresh, check <strong>Last synced</strong> and any sync errors, or <strong>Disconnect</strong>.</li>
</ol>
<h3>Connect email or SMS/WhatsApp</h3>
<ol>
<li>Email Integration: choose <strong>SendGrid</strong> or <strong>Mailchimp (Transactional/Mandrill)</strong>, paste your API key, save, then send a test email.</li>
<li>Twilio Integration: enter your Account SID and Auth Token, add SMS and/or WhatsApp sender numbers in international format, switch on each channel, then send a test message.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Calendar sync is a plan feature. If it is not included, you will see an upgrade prompt with <strong>View plans</strong>.</li>
<li>When your own email or Twilio account is connected, it is used instead of platform sending and your platform marketing credits are not used for those sends.</li>
<li>With platform sending, promotional SMS, email and WhatsApp messages use marketing credits. Your balance is split into <strong>Included (resets monthly)</strong> and <strong>Purchased (rolls over)</strong>, and you top up via Paystack. Transactional notifications are free.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/integrations-overview">Integrations overview</a></li>
<li><a href="/learn/article/marketing-automations-overview">Marketing and automations</a></li>
<li><a href="/learn/article/provider-web-calendar-bookings">Web calendar and bookings</a></li>
<li><a href="/learn/article/provider-web-subscription-plan">Your subscription plan</a></li>
</ul>$b$
  ),
  (
    'provider-onboarding',
    'Business profile, description and upgrading to a salon',
    'provider-business-profile-upgrade-salon',
    'Edit what clients see under Settings → Business details and Business Description (10+ characters for Get Started, 2000 max); freelancers can switch to a salon at /provider/settings/upgrade-to-salon to unlock team management and multiple locations (this can''t be undone).',
    $b$<p>Your business profile (name, description, contact details and photos) is what clients see when they find you. If you started as a freelancer and are growing a team, you can upgrade your account to a salon.</p>
<div data-learn-mockup="provider-web-settings" data-caption="Settings → Appointment Activity"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Settings → Settings &amp; account → Appointment &amp; activity</strong>, then <strong>Business details</strong> or <strong>Business description</strong>. Freelancers also see <strong>Upgrade to Salon</strong> at the top of that list.</li>
<li><strong>On the web:</strong> <strong>Settings → Appointment Activity</strong> tab, then <strong>Business details</strong>, <strong>Business Description</strong> (/provider/settings/business-description) or <strong>Business profile for Get Started</strong> (/provider/settings/business). Freelancers see an <strong>Upgrade to Salon</strong> item and an <strong>Upgrade Now</strong> banner (<a href="/provider/settings/upgrade-to-salon">/provider/settings/upgrade-to-salon</a>).</li>
</ul>
<h2>Step by step</h2>
<h3>Update your description</h3>
<ol>
<li>Open Business Description and write what you offer and what makes you different.</li>
<li>Keep it to 2000 characters or fewer. Your Get Started checklist stays incomplete until the description is at least 10 characters.</li>
<li>Save. You can also generate a bio with AI studio and apply it.</li>
</ol>
<h3>Upgrade from freelancer to salon</h3>
<ol>
<li>Open Upgrade to Salon and read <strong>What you'll get</strong>: Team Management, Multiple Locations, Advanced Scheduling and Commission Tracking.</li>
<li>Start the upgrade and tap <strong>Confirm Upgrade</strong> in the confirmation window. Your business type changes to salon, you are added as the owner in the team system, and your primary location is marked automatically.</li>
<li>Start adding team members and locations.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>The upgrade cannot be undone, but all your existing bookings, reviews and data are kept.</li>
<li>Some plans do not include salon features. If yours does not, you will be asked to upgrade your subscription first. An account can only be upgraded once.</li>
<li>New accounts show <strong>Your account is under review</strong> on the Dashboard until approved. A complete profile helps approval.</li>
<li>Beautonomi Friendly (/beautonomi-friendly) is a public page that sends customers to search for providers. There is nothing extra for you to sign up for there.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/provider-onboarding-overview">Provider onboarding</a></li>
<li><a href="/learn/article/setup-status-checklist">Setup status checklist</a></li>
<li><a href="/learn/article/locations-service-areas-overview">Locations and service areas</a></li>
<li><a href="/learn/article/provider-ai-studio">AI studio</a></li>
</ul>$b$
  ),
  (
    'staff-permissions',
    'Team member public title and first bookable day',
    'provider-staff-public-title-bookable-from',
    'When editing a team member (Team members at /provider/team/members, or More → Team & scheduling in the app), set "Title customers see" to show a job title on your booking page and "First day customers can book online" to hide them from online booking until that date.',
    $b$<p>Two optional team member settings control how a person appears on your public booking page. <strong>Title customers see</strong> replaces their permission role with a client-friendly title such as Senior stylist. <strong>First day customers can book online</strong> keeps a new hire out of online booking until their start date.</p>
<div data-learn-mockup="provider-web-team" data-caption="Team members — edit team member"></div>
<h2>Where to find it</h2>
<ul>
<li><strong>In the app:</strong> <strong>More → Business → Team &amp; scheduling</strong>, tap a team member, then tap <strong>Edit</strong>.</li>
<li><strong>On the web:</strong> sidebar <strong>Team &amp; Marketing → Team members</strong> (<a href="/provider/team/members">/provider/team/members</a>), then edit the member.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Open the team member's edit form.</li>
<li>Fill in <strong>Title customers see (optional)</strong>, for example Nail technician or Barber. On the web this field holds up to 120 characters.</li>
<li>Set <strong>First day customers can book online (optional)</strong> to the member's first day. Leave it empty to make them bookable straight away.</li>
<li>Check that the member takes appointments. In the app this is <strong>Takes appointments</strong>; on the web it is <strong>Enable in online booking</strong>.</li>
<li>Save. In the app, the member's details show <strong>First bookable day</strong>, or <strong>Immediately</strong> if no date is set. To remove the date, use <strong>Clear date (bookable immediately)</strong>.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>A team member only appears in public online booking if they are active, take appointments, are enabled for online booking, and their first bookable day (in your business time zone) has arrived.</li>
<li>The public title only changes what clients see. Permissions still come from the member's role (owner, manager or employee).</li>
<li>Switch off <strong>Takes appointments</strong> for managers who run the calendar but do not see clients.</li>
</ul>
<h2>Related articles</h2>
<ul>
<li><a href="/learn/article/staff-permissions-overview">Staff and permissions</a></li>
<li><a href="/learn/article/provider-web-staff-permissions">Web staff permissions</a></li>
<li><a href="/learn/article/online-booking-links-overview">Online booking links</a></li>
<li><a href="/learn/article/provider-express-booking-links">Express booking links</a></li>
</ul>$b$
  )
) AS v(category_slug, title, slug, summary, body)
JOIN public.learning_categories c ON c.slug = v.category_slug AND c.tenant_id IS NULL
ON CONFLICT (slug) WHERE tenant_id IS NULL DO UPDATE
SET category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
    body = EXCLUDED.body, content_format = 'html', status = 'published', audience = EXCLUDED.audience,
    is_internal = false, updated_at = NOW();

INSERT INTO public.learning_article_stats (article_id)
SELECT a.id FROM public.learning_articles a WHERE a.slug IN (
  'provider-dashboard-cards-metrics',
  'provider-chats-engagement-hub',
  'provider-buy-ads',
  'provider-explore-posts',
  'provider-custom-requests-offers',
  'provider-ai-studio',
  'provider-rewards-badges',
  'provider-referrals-referral-sources',
  'provider-resources-forms',
  'provider-inventory-suppliers-variants',
  'provider-shipping-collection-returns',
  'provider-express-booking-links',
  'provider-closed-periods-blocked-time-waitlist',
  'provider-calendar-sync-integrations',
  'provider-business-profile-upgrade-salon',
  'provider-staff-public-title-bookable-from'
) AND a.tenant_id IS NULL
ON CONFLICT (article_id) DO NOTHING;
