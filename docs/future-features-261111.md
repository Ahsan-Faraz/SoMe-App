# Near-future features (client, 11 Nov 2026)

From the yellow section "Near future features - to consider but not implement yet" in
`SoMe-Test-Guide-261111pm.docx`. The client's words: focus now on fixing what exists and getting the
domains up; these come after. **Nothing here is to be built yet.** Each item lists what he asked for,
what the app has today, what must be decided first, and a rough size.

Sizes: **S** = up to a day, **M** = a few days, **L** = a week or more.

| # | Feature | Size | Blocked on |
|---|---|---|---|
| 1 | Configurable ad fields and ad cards | L | The client's design ("I will think this through") |
| 2 | Profile completion weight per field (1–5) | S | Nothing |
| 3 | Admin verification with a time limit | M | What "verification" is, and email reminders |
| 4 | Verification by other users | M | Who may verify, can it be withdrawn |
| 5 | Payments: platform levels, community and group fees, profit sharing | L | Payment provider, legal, pricing |
| 6 | Phone notifications with a custom message per chat | L | Push on iPhone needs the installed app |
| 7 | Chat images that expire (by time or number of views) | M | The exact rules |

## 1. Configurable ad fields and ad cards

**Asked:** the fields of an ad should be configurable, perhaps from the profile builder, so ads work
for things like "Looking for bike ride company" or "Bike for sale". What the ad cards list shows
should be adaptable too. The client will think the design through.

**Today:** an ad has fixed fields (Looking for, headline, text, district, place, one image); age and
Status come from the profile. The card layout is fixed.

**To decide:** one set of ad fields per community, or several ad types (each with its own fields)?
Which fields are searchable in the ad filter? Which show on the card?

**Notes:** the profile builder's field definitions and typed values can be reused for ads, so this is
a second "builder" on the same base, plus a new ad filter and card. Existing ads must keep working.

## 2. Profile completion weight per field

**Asked:** per profile field, next to "required" and "searchable": a completion score of 1 to 5 that
weighs how much filling in that field counts towards the 0–100 % profile score.

**Today:** the score exists and is filterable; its rule is fixed in one database function (open
question Q2 in `docs/backend-design.md`). Fields have Required and Searchable switches.

**To decide:** do the basic fields (profile image, "Taken in app" photo, linked profiles) get a weight
too, and what is the default weight for existing fields?

**Notes:** one new column on the field definition, one number input in the builder, a new score rule,
and a one-off recount of every profile's score.

## 3. Admin verification with a time limit

**Asked:** a verification by the admin either never runs out or runs out after one year. After 11
months the member gets a warning to re-verify with the admin. After 12 months the profile is
temporarily deactivated until a new verification is sent in.

**Today:** approval of the application is the only check, and it never expires. There is no
"verified" state separate from being a member, and nothing runs on a schedule.

**To decide:** is the verification the application image, or a new step? Per community setting
(never / one year)? What does "deactivated" hide: the profile only, or chats and groups too? Is the
warning an email, an in-app notice, or both?

**Notes:** needs a verified-until date per member, a daily job (reminder, deactivate), a re-verify
screen for the member and a queue for the admin (the application queue can be reused).

## 4. Verification by other users

**Asked:** a member can verify another profile and write a short comment. A profile shows its
verifications: the comment, and who verified, with a link to their profile.

**Today:** linked profiles (confirmed when both link each other) and private notes and stars (seen
only by the author). Nothing public from one member about another.

**To decide:** who may verify (any approved member, only people who met them, a limit per member)?
Can the verified person hide or remove a verification? Can the verifier withdraw it? Does the admin
moderate the comments? What happens to verifications when either person blocks the other or leaves?

**Notes:** this is public text about another person, so it needs a report and remove route, and it
must follow the block rules.

## 5. Payments

**Asked:** a platform fee by level: Free member, VIP member (paid), Group admin, Community admin. On
top of that a fee per community and per group inside it, "like subscribing to TV channels", with
profit sharing with group admins and community admins later.

**Today:** no payments. "VIP" exists only as the group-create right (`can_create_groups`); the limit
of 10 profiles per VIP group is still open (Q15).

**To decide:** payment provider (Stripe, Swish), currency and VAT, who the seller is, what happens
when a payment stops (grace period, read-only, removed?), refunds, and how profit sharing is paid out.

**Notes:** the largest item here. It touches roles, group access, legal terms and accounting, and it
was "much later" in the client's 2 November answers.

## 6. Phone notifications with a custom message

**Asked:** notifications on the phone for new messages in selected chats. Each member sets their own
text per chat (for example "new messages about dogs"). The real message is never shown.

**Today:** no push. Unread numbers show when the app is open.

**15 Nov (261115):** listed under "Soonish": "probably easy if the user adds the app to the iPhone
home screen, not sure on Android". The notes below answer that: Android works too.

**To decide:** which chats can be selected (DMs, groups, both)? How often at most (every message, or
one per chat until it is opened)?

**Notes:** web push works on Android and desktop browsers, and on iPhone only when the app is
installed to the home screen (iOS 16.4+). The service worker has no push handler today. Sending
needs a push service and a background sender, since a busy group must not send one push per member
per message inside the message's own request.

## 7. Chat images with a limit

**Asked:** images in chats that expire after a time or a number of views.

**Today:** chat images stay as long as the message stays, in the private bucket.

**To decide:** who sets the limit (the sender per image, or the group admin for the group)? Does a
view by the sender count? What does the chat show after it expires? An expired image can still have
been saved or screenshotted, and the app should not claim otherwise.

**Notes:** needs a view count per image and viewer, a check before each signed image link is made,
and a job that deletes expired files.
